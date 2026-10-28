"""Neighborhood results (§3.3).

Default source: the GovMap elections site, which publishes results already aggregated into a fixed
neighborhood layer (the same polygons and ids for every election). Both elections land in the same
areas, so neighborhood swing is a direct comparison. Station numbers are never matched across elections.

Fallback (feature-flagged, off): geocode a committee station-address file once per building (ריכוז),
assign stations to neighborhoods by point-in-polygon and aggregate. Enable with STATION_GEOCODING=1
when the committee publishes an address file and GovMap has not published neighborhood results.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

import pandas as pd

from . import load as L
from .geo import govmap_dir

CACHE = L.DATA / "cache" / "geocode.json"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
STATION_GEOCODING = os.environ.get("STATION_GEOCODING") == "1"


def govmap_areas(election: int, mock: bool = False) -> dict | None:
    """GovMap neighborhood results ({'parties', 'features', 'totals'}), or None if unpublished."""
    d = L.DATA / "mock" / "govmap" / str(election) if mock else govmap_dir(election)
    data_path = d / "neighborhood_data.json"
    if not data_path.exists():
        return None
    try:
        data = json.loads(data_path.read_text(encoding="utf-8"))
    except ValueError:  # e.g. a web page saved before GovMap published the data
        return None
    if not data.get("features"):
        return None
    return {"parties": data["parties"], "features": data["features"], "totals": data.get("totals", {})}


def same_area_layer(election: int) -> bool:
    """True when GovMap's neighborhood polygons for `election` are the 2022 ones (same ids)."""
    def ids(n):
        path = govmap_dir(n) / "neighborhood_geometry.topojson"
        if not path.exists():
            return None
        topo = json.loads(path.read_text(encoding="utf-8"))
        obj = next(iter(topo["objects"].values()))
        return [(g["properties"].get("id"), g["properties"].get("UNIQ_ID")) for g in obj["geometries"]]
    return ids(election) is not None and ids(election) == ids(25)


def area_meta() -> dict[str, dict]:
    """Area id → {'name', 'city'} from the GovMap neighborhood geometry (identical across elections)."""
    topo = json.loads((govmap_dir(25) / "neighborhood_geometry.topojson").read_text(encoding="utf-8"))
    out = {}
    for g in topo["objects"]["neighborhood"]["geometries"]:
        p = g["properties"]
        out[str(p["id"])] = {"name": p.get("neighborhood_name") or "", "city": int(p["SETL_CODE"])}
    return out


# --- Fallback: geocoding a station-address file -------------------------------------------------

def _load_cache() -> dict:
    return json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}


def geocode(addresses: list[str], user_agent: str = "election-site-pipeline") -> dict[str, tuple | None]:
    """Geocode with Nominatim at 1 request/second, caching every answer in data/cache/geocode.json."""
    import requests

    cache = _load_cache()
    for i, addr in enumerate(a for a in addresses if a not in cache):
        r = requests.get(NOMINATIM, params={"q": addr, "format": "json", "limit": 1, "countrycodes": "il"},
                         headers={"User-Agent": user_agent}, timeout=30)
        hits = r.json() if r.ok else []
        cache[addr] = (float(hits[0]["lon"]), float(hits[0]["lat"])) if hits else None
        if i % 20 == 0:
            CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
        time.sleep(1.0)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    return {a: cache.get(a) for a in addresses}


def stations_to_areas(stations: pd.DataFrame, addresses: pd.DataFrame, areas_gdf) -> pd.DataFrame:
    """Aggregate station rows into areas.

    addresses: one row per building with columns סמל ישוב, ריכוז, address (street, number, city).
    areas_gdf: GeoDataFrame with columns id, city, geometry in EPSG:4326.
    Returns per-area sums plus a per-city hit-rate table (votes placed / votes).
    """
    import geopandas as gpd
    from shapely.geometry import Point

    pts = geocode(addresses["address"].tolist())
    addresses = addresses.assign(geometry=[Point(*pts[a]) if pts.get(a) else None for a in addresses["address"]])
    located = gpd.GeoDataFrame(addresses.dropna(subset=["geometry"]), geometry="geometry", crs="EPSG:4326")
    joined = gpd.sjoin(located, areas_gdf[["id", "geometry"]], predicate="within", how="left")
    place_to_area = joined.set_index([L.CODE, L.PLACE])["id"]
    st = stations.join(place_to_area, on=[L.CODE, L.PLACE])
    cols = [L.ELIGIBLE, L.VOTERS, L.INVALID, L.VALID] + L.party_columns(stations)
    by_area = st.dropna(subset=["id"]).groupby("id")[cols].sum()
    hit = st.assign(placed=st["id"].notna() * st[L.VALID]).groupby(L.CODE)[["placed", L.VALID]].sum()
    hit["rate"] = hit["placed"] / hit[L.VALID]
    return by_area, hit
