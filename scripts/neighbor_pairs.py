"""Which winning parties touch each other on the map? (§7 color check input)

Writes data/parties/neighbor_pairs.json: [[letterA, letterB, count], …] for the municipality and
locality layers of an election, so the palette check only has to separate parties that are adjacent.
  python scripts/neighbor_pairs.py --election 25
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import geopandas as gpd

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "data" / "build" / "geo"


def pairs(layer: str, units: dict) -> Counter:
    g = gpd.read_file(BUILD / f"{layer}.geojson").to_crs("EPSG:2039")
    g["winner"] = g["id"].map(lambda i: (units.get(str(i)) or {}).get("winner"))
    g = g.dropna(subset=["winner"])
    g["geometry"] = g.geometry.buffer(50)  # touching within 50 m
    j = gpd.sjoin(g[["id", "winner", "geometry"]], g[["id", "winner", "geometry"]], predicate="intersects")
    j = j[(j.id_left < j.id_right) & (j.winner_left != j.winner_right)]
    return Counter(tuple(sorted(p)) for p in zip(j.winner_left, j.winner_right))


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--election", type=int, default=25)
    n = ap.parse_args().election
    res = ROOT / "site" / "public" / "data" / "results" / f"k{n}"
    c = pairs("municipalities", json.loads((res / "municipalities.json").read_text(encoding="utf-8")))
    c += pairs("localities", json.loads((res / "localities.json").read_text(encoding="utf-8")))
    out = [[a, b, k] for (a, b), k in c.most_common()]
    (ROOT / "data" / "parties" / f"neighbor_pairs_k{n}.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=0), encoding="utf-8")
    for a, b, k in out[:30]:
        print(a, b, k)


if __name__ == "__main__":
    main()
