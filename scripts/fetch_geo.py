"""Download geography layers and build the web map layers (§3.2, Phase 4).

  python scripts/fetch_geo.py            download missing raw files, then build
  python scripts/fetch_geo.py --build    build only (raw files must exist)

Raw downloads go to data/raw/geo/ (gitignored, large) and data/raw/govmap/ (small, committed).
Outputs:
  data/geo/localities.csv                    CBS locality table (committed; used by ingest)
  site/public/data/geo/municipalities.topojson
  site/public/data/geo/localities.topojson
  site/public/data/geo/points.json           dots: polygon-less localities + small ones (see dots())
  site/public/data/geo/areas/<code>.json     neighborhood polygons per city (lazy-loaded)
  data/geo/geo_report.md                     coverage and unmatched items, for review
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline import geo as G  # noqa: E402
from pipeline import load as L  # noqa: E402

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
SOURCES = {
    "bycode2023.xlsx": "https://data.gov.il/dataset/d9b1e04c-426f-4e32-ba40-a1ad9d8748a7/resource/"
                       "d47a54ff-87f0-44b3-b33a-f284c0c38e5a/download/bycode2023.xlsx",
    "sa2020.gdb.zip": "https://www.cbs.gov.il/he/Documents/statisticalareas_2020_demography.gdb.zip",
    "muni_il.geojson": "https://open.govmap.gov.il/geoserver/opendata/wfs?service=WFS&version=2.0.0"
                       "&request=GetFeature&typeNames=opendata:muni_il&outputFormat=application/json",
}
GOVMAP = "https://elections.govmap.gov.il/data/votes"
GOVMAP_FILES = ["neighborhood_data.json", "neighborhood_geometry.topojson"]

BUILD = ROOT / "data" / "build" / "geo"
OUT = ROOT / "site" / "public" / "data" / "geo"
MAPSHAPER = ROOT / "site" / "node_modules" / "mapshaper" / "bin" / "mapshaper"

# Neighborhood maps are shown only for cities where this share of the city's valid votes
# was placed in a neighborhood (§3.3), and only for cities with 2+ neighborhoods.
AREA_MIN_PLACED = 0.90
AREA_MAX_PLACED = 1.05  # GovMap places stations by location; >5% spill-in means the polygons don't fit
DOT_MAX_KM2 = 4.0  # built-up areas smaller than this also get a dot (invisible as polygons at country zoom)


def download(url: str, dest: Path) -> None:
    print(f"  downloading {dest.name} …")
    with requests.get(url, headers={"User-Agent": UA}, stream=True, timeout=600) as r:
        r.raise_for_status()
        tmp = dest.with_suffix(dest.suffix + ".part")
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
        tmp.replace(dest)


def fetch_raw() -> None:
    G.RAW_GEO.mkdir(parents=True, exist_ok=True)
    for name, url in SOURCES.items():
        if not (G.RAW_GEO / name).exists():
            download(url, G.RAW_GEO / name)
    if not list((G.RAW_GEO / "sa2020").glob("**/*.gdb")):
        with zipfile.ZipFile(G.RAW_GEO / "sa2020.gdb.zip") as z:
            z.extractall(G.RAW_GEO / "sa2020")


def fetch_govmap(election: int, force: bool = False) -> bool:
    """GovMap neighborhood results for an election. Returns False if GovMap has not published it."""
    d = G.govmap_dir(election)
    if not force and all((d / f).exists() for f in GOVMAP_FILES):
        return True
    idx = requests.get(f"{GOVMAP}/elections.json", headers={"User-Agent": UA}, timeout=60).json()
    if str(election) not in idx.get("elections", {}):
        print(f"  GovMap has no neighborhood data for election {election} yet")
        return False
    d.mkdir(parents=True, exist_ok=True)
    (d.parent / "elections.json").write_text(json.dumps(idx, ensure_ascii=False, indent=1), encoding="utf-8")
    for f in GOVMAP_FILES:
        download(f"{GOVMAP}/{idx['elections'][str(election)]['path']}/{f}", d / f)
    return True


def mapshaper(*args: str) -> None:
    cmd = ["node", str(MAPSHAPER), *args]
    subprocess.run(cmd, check=True, cwd=ROOT)


def write_geojson(gdf, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_file(path, driver="GeoJSON")


def build() -> dict:
    loc, _ = L.load_election(25)
    valid = loc.set_index(L.CODE)[L.VALID]
    codes = set(valid.index) - {L.EXTERNAL_CODE}
    layers = G.build_layers(codes, valid)
    table = layers["table"]

    BUILD.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    munis = layers["municipalities"].copy()
    munis["id"] = munis.muni_id
    write_geojson(munis[["id", "geometry"]], BUILD / "municipalities.geojson")
    locs = layers["localities"].copy()
    locs["id"] = locs.code.astype(str)
    write_geojson(locs[["id", "geometry"]], BUILD / "localities.geojson")

    mapshaper(str(BUILD / "municipalities.geojson"), "-simplify", "6%", "keep-shapes",
              "-rename-layers", "municipalities",
              "-o", str(OUT / "municipalities.topojson"), "format=topojson", "quantization=100000")
    mapshaper(str(BUILD / "localities.geojson"), "-simplify", "8%", "keep-shapes",
              "-clean", "-rename-layers", "localities",
              "-o", str(OUT / "localities.topojson"), "format=topojson", "quantization=100000")
    if layers["no_jurisdiction"] is not None:
        write_geojson(layers["no_jurisdiction"], BUILD / "no_jurisdiction.geojson")
        mapshaper(str(BUILD / "no_jurisdiction.geojson"), "-simplify", "6%", "keep-shapes",
                  "-rename-layers", "no_jurisdiction",
                  "-o", str(OUT / "no_jurisdiction.topojson"), "format=topojson", "quantization=100000")

    (OUT / "points.json").write_text(json.dumps(dots(layers, table), ensure_ascii=False), encoding="utf-8")

    areas_report = build_areas(valid, table)
    report = {**layers["report"], "areas": areas_report}
    write_report(report)
    return report


def dots(layers: dict, table) -> list[dict]:
    """Dots for localities too small to see as polygons at country zoom (points.json).

    Every polygon-less locality (Bedouin tribes, army camps, …) has a dot (poly: false, shown at all
    zooms). So do localities with a polygon that is hidden or tiny at country zoom (poly: true, the
    map fades these dots out once the polygons are big enough to see): members of regional councils,
    localities whose municipality has no jurisdiction polygon (West Bank settlements), and anything
    under DOT_MAX_KM2.
    """
    fallback = {m for m, _ in layers["report"]["municipalities_fallback"]}
    out = []
    for r in layers["points"].itertuples():
        out.append({"id": str(int(r.code)), "name": table.at[r.code, "name"], "muni": table.at[r.code, "muni_id"],
                    "lon": round(r.geometry.x, 5), "lat": round(r.geometry.y, 5), "poly": False})
    polys = layers["localities"]
    area_km2 = polys.to_crs(G.ITM).geometry.area / 1e6
    reps = polys.geometry.representative_point()
    for code, area, pt in zip(polys.code, area_km2, reps):
        code = int(code)
        if code not in table.index:
            continue
        muni = table.at[code, "muni_id"]
        if table.at[code, "muni_kind"] == "regional" or muni in fallback or area < DOT_MAX_KM2:
            out.append({"id": str(code), "name": table.at[code, "name"], "muni": muni,
                        "lon": round(pt.x, 5), "lat": round(pt.y, 5), "poly": True})
    return out


def build_areas(valid, table) -> list[dict]:
    """Neighborhood polygons from GovMap, split per city, for cities with good placement."""
    src = G.govmap_dir(25) / "neighborhood_geometry.topojson"
    data = json.loads((G.govmap_dir(25) / "neighborhood_data.json").read_text(encoding="utf-8"))
    geo = BUILD / "neighborhoods.geojson"
    mapshaper(str(src), "-proj", "wgs84", "init=EPSG:3857", "-clean",
              "-o", str(geo), "format=geojson", "precision=0.00001")
    fc = json.loads(geo.read_text(encoding="utf-8"))
    by_city: dict[int, list] = {}
    for f in fc["features"]:
        p = f["properties"]
        code = int(p["SETL_CODE"])
        f["properties"] = {"id": str(p["id"]), "name": p.get("neighborhood_name") or "", "city": code}
        by_city.setdefault(code, []).append(f)

    placed_by_city: dict[int, int] = {}
    for f in fc["features"]:
        v = data["features"].get(f["properties"]["id"])
        if v:
            c = f["properties"]["city"]
            placed_by_city[c] = placed_by_city.get(c, 0) + v["כשרים"]

    areas_dir = OUT / "areas"
    shutil.rmtree(areas_dir, ignore_errors=True)
    areas_dir.mkdir(parents=True)
    rows = []
    for code, feats in sorted(by_city.items()):
        if code not in valid.index or code == L.EXTERNAL_CODE:
            continue
        share = placed_by_city.get(code, 0) / valid[code] if valid[code] else 0.0
        enabled = len(feats) >= 2 and AREA_MIN_PLACED <= share <= AREA_MAX_PLACED
        if len(feats) >= 2:
            rows.append({"code": code, "name": table.at[code, "name"] if code in table.index else str(code),
                         "neighborhoods": len(feats), "placed_share": round(share, 4), "enabled": enabled})
        if enabled:
            (areas_dir / f"{code}.json").write_text(
                json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False,
                           separators=(",", ":")), encoding="utf-8")
    index = {str(r["code"]): {"neighborhoods": r["neighborhoods"], "placed_share": r["placed_share"]}
             for r in rows if r["enabled"]}
    (areas_dir / "index.json").write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
    return rows


def write_report(r: dict) -> None:
    lines = [
        "# Geography coverage report (2022 results)", "",
        "Generated by `scripts/fetch_geo.py`. Review the lists below.", "",
        f"- Valid votes excluding external envelopes: {r['valid_total']:,}",
        f"- Placed on a polygon or point: {r['valid_placed']:,} (**{r['placed_share']:.2%}**)",
        f"- Localities with a polygon: {r['polygon_localities']}",
        f"- Localities shown as points: {len(r['point_localities'])}",
        f"- CBS polygons with no 2022 results (not drawn): {r['polygons_without_results']}", "",
        "## Localities shown as points (no CBS statistical-area polygon)", "",
        "| code | name | valid votes |", "|---|---|---|",
        *[f"| {c} | {n} | {v:,} |" for c, n, v in r["point_localities"]], "",
        "## Not placed at all", "",
        *([f"- {c}: {v:,} votes" for c, v in r["unplaced_localities"]] or ["- none"]), "",
        "## Result codes missing from the CBS locality list", "",
        *([f"- {c}" for c in r["not_in_cbs_list"]] or ["- none"]), "",
        "## Municipalities with no GovMap jurisdiction polygon (drawn as the union of their localities)", "",
        *([f"- {m} {n}" for m, n in r["municipalities_fallback"]] or ["- none"]), "",
        "## GovMap jurisdictions that matched no municipality", "",
        *([f"- {n}" for n in r["unmatched_govmap"]] or ["- none"]), "",
        "## Neighborhood maps (GovMap neighborhoods, cities with 2+ neighborhoods)", "",
        f"Shown when {AREA_MIN_PLACED:.0%}–{AREA_MAX_PLACED:.0%} of the city's valid votes are placed.", "",
        "| code | city | neighborhoods | placed | shown |", "|---|---|---|---|---|",
        *[f"| {a['code']} | {a['name']} | {a['neighborhoods']} | {a['placed_share']:.1%} | "
          f"{'✓' if a['enabled'] else '✗'} |" for a in sorted(r["areas"], key=lambda a: -a["neighborhoods"])],
        "",
    ]
    (ROOT / "data" / "geo" / "geo_report.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--build", action="store_true", help="skip downloads")
    args = ap.parse_args()
    if not args.build:
        fetch_raw()
        fetch_govmap(25)
    r = build()
    print(f"placed {r['placed_share']:.2%} of valid votes; {len(r['point_localities'])} points; "
          f"{sum(a['enabled'] for a in r['areas'])} cities with neighborhood maps")
    for f in sorted(OUT.glob("*")):
        if f.is_file():
            print(f"  {f.name}: {f.stat().st_size / 1e6:.2f} MB")
    if r["placed_share"] < 0.99:
        sys.exit("FAIL: under 99% of valid votes placed")


if __name__ == "__main__":
    main()
