"""Geography: CBS locality list, built-up locality polygons, municipal jurisdictions, neighborhoods.

Sources (downloaded by scripts/fetch_geo.py into data/raw/geo/ and data/raw/govmap/):
  bycode2023.xlsx           CBS locality file: names, municipal status, ITM coordinates
  sa2020/*.gdb              CBS statistical areas 2011 (2020 data); dissolved by locality code
  muni_il.geojson           GovMap open data: municipal jurisdictions (רשויות מוניציפאליות)
  govmap/{n}/neighborhood_* GovMap elections site: neighborhood polygons and per-neighborhood results

Every layer is ITM (EPSG:2039) except the GovMap neighborhood layer (EPSG:3857); output is EPSG:4326.
"""
from __future__ import annotations

import glob
import re
from pathlib import Path

import geopandas as gpd
import pandas as pd
import yaml
from pyproj import Transformer
from shapely.geometry import Point

from .load import DATA, EXTERNAL_CODE

RAW_GEO = DATA / "raw" / "geo"
GEO_CONF = DATA / "geo"
LOCALITIES_CSV = GEO_CONF / "localities.csv"

ITM = "EPSG:2039"
WGS84 = "EPSG:4326"
RC_PREFIX = "מועצה אזורית "


def overrides() -> dict:
    return yaml.safe_load((GEO_CONF / "overrides.yaml").read_text(encoding="utf-8")) or {}


def clean_name(name: str) -> str:
    """CBS names have stray spaces around hyphens ("תל אביב -יפו")."""
    name = re.sub(r"\s*-\s*", "-", str(name).strip())
    return re.sub(r"\s+", " ", name)


def decode_cbs_coord(value) -> tuple[float, float] | None:
    """CBS packs ITM coordinates into one number: 12 digits = XXXXXXYYYYYY metres,
    10 digits = XXXXXYYYYY in 10 m units."""
    if pd.isna(value):
        return None
    s = str(int(value))
    if len(s) == 12:
        return float(s[:6]), float(s[6:])
    if len(s) == 10:
        return float(s[:5]) * 10, float(s[5:]) * 10
    return None


def build_locality_table() -> pd.DataFrame:
    """One row per CBS locality: display name, municipality, ITM point. Written to data/geo/localities.csv."""
    by = pd.read_excel(RAW_GEO / "bycode2023.xlsx")
    rows = []
    for _, r in by.iterrows():
        code = int(r["סמל יישוב"])
        status = r["שם מעמד מונציפאלי"]
        status = "" if pd.isna(status) else str(status).strip()
        if status.startswith(RC_PREFIX):
            kind = "regional"
            muni_id = f"rc{int(r['סמל מעמד מונציפאלי'])}"
            muni_name = clean_name(status)
        else:
            kind = {"עירייה": "city", "מועצה מקומית": "local"}.get(status, "none")
            muni_id = f"l{code}"
            muni_name = clean_name(r["שם יישוב"])
        xy = decode_cbs_coord(r["קואורדינטות"])
        rows.append({
            "code": code, "name": clean_name(r["שם יישוב"]), "muni_id": muni_id,
            "muni_name": muni_name, "muni_kind": kind,
            "x": xy[0] if xy else None, "y": xy[1] if xy else None,
        })
    to_itm = Transformer.from_crs(WGS84, ITM, always_xy=True)
    for code, e in (overrides().get("extra_localities") or {}).items():
        x, y = to_itm.transform(e["lon"], e["lat"])
        council = e.get("council")
        rows.append({
            "code": int(code), "name": e["name"],
            "muni_id": f"rc{council}" if council else f"l{code}",
            "muni_name": e["name"], "muni_kind": "regional" if council else "none", "x": x, "y": y,
        })
    df = pd.DataFrame(rows).drop_duplicates("code", keep="last").sort_values("code")
    df.to_csv(LOCALITIES_CSV, index=False, encoding="utf-8")
    return df.set_index("code")


def locality_table() -> pd.DataFrame:
    return pd.read_csv(LOCALITIES_CSV, encoding="utf-8").set_index("code")


def locality_polygons() -> gpd.GeoDataFrame:
    """Built-up locality polygons: CBS statistical areas dissolved by locality code."""
    gdb = glob.glob(str(RAW_GEO / "sa2020" / "**" / "*.gdb"), recursive=True)[0]
    sa = gpd.read_file(gdb, columns=["SEMEL_YISHUV"])
    sa = sa.rename(columns={"SEMEL_YISHUV": "code"})
    sa["geometry"] = sa.geometry.buffer(0)
    loc = sa.dissolve("code").reset_index()[["code", "geometry"]]
    return loc.set_crs(ITM, allow_override=True)


def municipality_polygons(table: pd.DataFrame) -> tuple[gpd.GeoDataFrame, dict]:
    """GovMap jurisdictions keyed by our municipality id (l<code> or rc<status code>)."""
    m = gpd.read_file(RAW_GEO / "muni_il.geojson", columns=["Muni_Heb", "Sug_Muni", "CR_LAMAS"])
    m = m.set_crs(ITM, allow_override=True)
    aliases = overrides().get("council_aliases") or {}
    rc_by_name = {}
    for muni_id, name in table[table.muni_kind == "regional"][["muni_id", "muni_name"]].drop_duplicates().values:
        short = name.removeprefix(RC_PREFIX)
        rc_by_name[aliases.get(short, short)] = muni_id
        rc_by_name[clean_name(aliases.get(short, short))] = muni_id

    def key(r) -> str | None:
        if r.Sug_Muni == "מועצה אזורית":
            return rc_by_name.get(r.Muni_Heb) or rc_by_name.get(clean_name(r.Muni_Heb))
        if r.Sug_Muni == "ללא שיפוט":
            return None
        lamas = str(r.CR_LAMAS or "").strip()
        return f"l{int(lamas)}" if lamas.isdigit() else None

    m["muni_id"] = [key(r) for r in m.itertuples()]
    report = {
        "unmatched_govmap": sorted({f"{r.Muni_Heb} ({r.Sug_Muni})" for r in m.itertuples()
                                    if r.muni_id is None and r.Sug_Muni != "ללא שיפוט"}),
    }
    nojur = m[m.Sug_Muni == "ללא שיפוט"].copy()
    nojur["muni_id"] = None
    m = m[m.muni_id.notna()]
    m["geometry"] = m.geometry.buffer(0)
    out = m.dissolve("muni_id").reset_index()[["muni_id", "geometry"]]
    nojur = nojur.dissolve().reset_index(drop=True)[["geometry"]] if len(nojur) else nojur
    return out, {**report, "no_jurisdiction": nojur}


def itm_points(codes, table: pd.DataFrame) -> gpd.GeoDataFrame:
    rows = [(c, Point(table.at[c, "x"], table.at[c, "y"])) for c in codes
            if c in table.index and pd.notna(table.at[c, "x"])]
    return gpd.GeoDataFrame(rows, columns=["code", "geometry"], crs=ITM)


def build_layers(result_codes: set[int], valid_by_code: pd.Series) -> dict:
    """Build every map layer in EPSG:4326 and a coverage report.

    result_codes: locality codes present in the election results (excluding external envelopes).
    """
    table = build_locality_table()
    polys = locality_polygons()
    poly_codes = set(polys.code)
    polys = polys[polys.code.isin(result_codes)]

    point_codes = sorted(result_codes - poly_codes)
    points = itm_points(point_codes, table)
    unplaced = sorted(set(point_codes) - set(points.code))

    munis, mreport = municipality_polygons(table)
    used_munis = set(table.loc[table.index.intersection(list(result_codes)), "muni_id"])
    # Municipalities with no jurisdiction polygon (e.g. outside the GovMap layer): fall back to the
    # union of their locality polygons. Point-only municipalities stay points (points.json).
    missing = sorted(used_munis - set(munis.muni_id))
    fallback = []
    for mid in missing:
        codes = [c for c in table.index[table.muni_id == mid] if c in result_codes]
        shapes = list(polys[polys.code.isin(codes)].geometry)
        if shapes:
            fallback.append((mid, gpd.GeoSeries(shapes, crs=ITM).union_all()))
    if fallback:
        munis = pd.concat([munis, gpd.GeoDataFrame(fallback, columns=["muni_id", "geometry"], crs=ITM)])
    munis = munis[munis.muni_id.isin(used_munis)]

    total = valid_by_code.drop(EXTERNAL_CODE, errors="ignore").sum()
    placed = valid_by_code[valid_by_code.index.isin(set(polys.code) | set(points.code))].sum()
    report = {
        "valid_total": int(total),
        "valid_placed": int(placed),
        "placed_share": placed / total if total else 0.0,
        "polygon_localities": len(polys),
        "point_localities": [(int(c), table.at[c, "name"] if c in table.index else "?",
                              int(valid_by_code.get(c, 0))) for c in points.code],
        "unplaced_localities": [(int(c), int(valid_by_code.get(c, 0))) for c in unplaced],
        "not_in_cbs_list": sorted(int(c) for c in result_codes - set(table.index)),
        "polygons_without_results": len(poly_codes - result_codes),
        "municipalities_fallback": [(m, table[table.muni_id == m].muni_name.iloc[0]) for m, _ in fallback],
        "municipalities_as_points": sorted(set(missing) - {m for m, _ in fallback}),
        "unmatched_govmap": mreport["unmatched_govmap"],
    }
    return {
        "table": table,
        "localities": polys.to_crs(WGS84),
        "points": points.to_crs(WGS84),
        "municipalities": munis.to_crs(WGS84),
        "no_jurisdiction": mreport["no_jurisdiction"].to_crs(WGS84) if len(mreport["no_jurisdiction"]) else None,
        "report": report,
    }


def govmap_dir(election: int) -> Path:
    return DATA / "raw" / "govmap" / str(election)
