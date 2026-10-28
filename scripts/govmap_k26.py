"""2026 results from GovMap's election data (the committee's results, published as open JSON).

The committee's own CSV downloads (media26.bechirot.gov.il/files/exp*.csv) are behind bot protection
for automated clients on election night. GovMap (elections.govmap.gov.il) publishes the same results
per locality, refreshed every few minutes. This turns them into the committee's locality-file format
(data/raw/k26/expc.csv) so the regular, tested ingest runs unchanged.

  python scripts/govmap_k26.py        fetch and write data/raw/k26/expc.csv, print a summary
"""
from __future__ import annotations

import csv
import json
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline import load as L  # noqa: E402

GOVMAP = "https://elections.govmap.gov.il/data/votes"
UA = "election-site-pipeline (https://github.com/MichaelF21/knesset-election-results)"
OUT = ROOT / "data" / "raw" / "k26" / "expc.csv"


class NotPublished(Exception):
    pass


def fetch_localities(election: int = 26) -> dict:
    """GovMap's per-locality results for the election, or NotPublished."""
    idx = requests.get(f"{GOVMAP}/elections.json", headers={"User-Agent": UA}, timeout=60,
                       params={"t": int(time.time())}).json()
    e = idx.get("elections", {}).get(str(election))
    if not e:
        raise NotPublished(f"GovMap does not list election {election}")
    r = requests.get(f"{GOVMAP}/{e['path']}/municipal_data.json", headers={"User-Agent": UA}, timeout=120,
                     params={"t": int(time.time())})
    try:
        data = r.json() if r.ok else None
    except ValueError:
        data = None
    if not data or not data.get("features"):
        raise NotPublished("GovMap locality results not published yet")
    return data


def write_locality_csv(data: dict, path: Path = OUT) -> dict:
    """Write the committee's locality-file layout. Keys of `features` are CBS locality codes."""
    parties = [p for p in data["parties"] if p]  # GovMap lists an unnamed, always-empty column
    header = L.BASE_COLS + parties
    rows = []
    for code, v in sorted(data["features"].items(), key=lambda kv: int(kv[0])):
        row = {L.COMMITTEE: 0, L.NAME: v.get("שם ישוב", ""), L.CODE: int(code),
               L.ELIGIBLE: v.get("בזב", 0), L.VOTERS: v.get("מצביעים", 0),
               L.INVALID: v.get("פסולים", 0), L.VALID: v.get("כשרים", 0)}
        row.update({p: v.get(p, 0) for p in parties})
        rows.append(row)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=header)
        w.writeheader()
        w.writerows(rows)
    tmp.replace(path)
    return {"generated": data.get("generated"), "localities": len(rows), "totals": data.get("totals", {}),
            "valid": sum(r[L.VALID] for r in rows), "eligible": sum(r[L.ELIGIBLE] for r in rows)}


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        info = write_locality_csv(fetch_localities())
    except NotPublished as e:
        sys.exit(str(e))
    print(f"wrote {OUT.relative_to(ROOT)}: {info}")


if __name__ == "__main__":
    main()
