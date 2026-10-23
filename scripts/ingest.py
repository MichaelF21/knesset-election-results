"""Run the full results pipeline for one election (§8). Idempotent.

  python scripts/ingest.py --election 25
  python scripts/ingest.py --election 26 --locality expc.csv --stations expb.csv [--final]
  python scripts/ingest.py --election 26 --download [--final]   fetch the committee CSVs first

Validates on ingest (unknown ballot letters fail loudly; missing localities and station→locality→national
sums are checked), aggregates every level, allocates seats, and writes site/public/data/.
With MOCK=1 the output goes to site/mock-data/ instead, which only the dev server serves.
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline import aggregate as A  # noqa: E402
from pipeline import export as E  # noqa: E402
from pipeline import geo as G  # noqa: E402
from pipeline import load as L  # noqa: E402
from pipeline import parties as P  # noqa: E402
from pipeline import stations as S  # noqa: E402
from pipeline.seats import allocate  # noqa: E402


# The committee published 2022 files at media25.bechirot.gov.il/files/exp{b,c}.csv. The 2026 address
# follows the same pattern but is NOT verified until election night: override with --url-base.
DEFAULT_URL_BASE = "https://media26.bechirot.gov.il/files"


class IngestError(RuntimeError):
    pass


def download(url_base: str, election: int) -> tuple[Path, Path]:
    import requests

    d = ROOT / "data" / "raw" / f"k{election}"
    d.mkdir(parents=True, exist_ok=True)
    out = []
    for name in ("expc.csv", "expb.csv"):
        r = requests.get(f"{url_base.rstrip('/')}/{name}", timeout=120,
                         headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36"})
        r.raise_for_status()
        if b"," not in r.content[:200]:
            raise IngestError(f"{name}: response does not look like CSV (got {r.content[:80]!r})")
        (d / name).write_bytes(r.content)
        out.append(d / name)
        print(f"  downloaded {name} ({len(r.content):,} bytes)")
    return out[0], out[1]


def validate(election: int, loc, st, table) -> list[str]:
    """Raise on errors that make the data unusable; return warnings."""
    letters = set(L.party_columns(loc))
    official = {r["letters"] for r in P.read_lists(election)}
    unknown = sorted(letters - official)
    if unknown:
        raise IngestError(f"unknown ballot letters in k{election} CSV: {unknown}. "
                          f"Map renamed columns in data/parties/k{election}_columns.yaml "
                          f"or update data/parties/k{election}.json")
    if (loc[L.party_columns(loc)].sum(axis=1) != loc[L.VALID]).any():
        bad = loc[loc[L.party_columns(loc)].sum(axis=1) != loc[L.VALID]][L.CODE].tolist()
        raise IngestError(f"party votes do not add up to valid votes for localities {bad[:10]}")
    if st is not None:
        if set(L.party_columns(st)) != letters:
            raise IngestError("station and locality files have different party columns")
        bad = L.station_sum_mismatches(loc, st)
        if not bad.empty:
            raise IngestError(f"station sums differ from locality rows for {len(bad)} localities: "
                              f"{bad.index.tolist()[:10]}")
    warnings = []
    missing = sorted(set(loc[L.CODE]) - set(table.index) - {L.EXTERNAL_CODE})
    if missing:
        warnings.append(f"{len(missing)} localities not in the CBS list (shown by CSV name, no map shape): "
                        f"{missing[:20]}")
    return warnings


def counted_share(loc, st) -> float:
    """Share of eligible voters whose stations (or localities) have reported."""
    df = st if st is not None and len(st) else loc
    total = df[L.ELIGIBLE].sum()
    if not total:
        return 0.0
    return float(df.loc[df[L.VOTERS] > 0, L.ELIGIBLE].sum() / total * 100)


def run(election: int, locality_csv=None, stations_csv=None, final: bool | None = None,
        out: Path | None = None, fetch_areas: bool = True) -> dict:
    t0 = time.time()
    mock = os.environ.get("MOCK") == "1"
    out = out or (E.MOCK if mock else E.PUBLIC)
    lineage = P.load_lineage()  # fails if any 2026 list is missing from lineage.yaml
    table = G.locality_table()

    loc, st = L.load_election(election, locality_csv, stations_csv)
    warnings = validate(election, loc, st, table)

    is_final = final if final is not None else election == 25
    if not is_final and st is not None:
        counted = st[st[L.VOTERS] > 0].groupby(L.CODE)[L.ELIGIBLE].sum()
        loc[A.ELIGIBLE_COUNTED] = loc[L.CODE].map(counted).fillna(0).astype("int64")
    locs = A.localities(loc, table)
    munis = A.municipalities(locs, table)
    nat, ext = A.national(loc)
    if sum(u["valid"] for u in locs.values()) + (ext["valid"] if ext else 0) != nat["valid"]:
        raise IngestError("locality sums do not add up to the national total")

    areas = {}
    if not mock and fetch_areas and election != 25:
        try:
            from scripts.fetch_geo import fetch_govmap
            fetch_govmap(election, force=True)
        except Exception as e:  # GovMap down must not block election night
            warnings.append(f"GovMap neighborhood fetch failed: {e}")
    gm = S.govmap_areas(election, mock=mock)
    if gm:
        areas = A.areas_from_govmap(gm, S.area_meta())

    seats = allocate(nat["votes"], P.load_surplus(election))
    pct = 100.0 if is_final else round(counted_share(loc, st), 1)

    d = out / "results" / f"k{election}"
    shutil.rmtree(d, ignore_errors=True)
    E.write_json(d / "national.json", {"national": nat, "external": ext, "seats": {k: v for k, v in seats.items() if v}})
    E.write_json(d / "municipalities.json", munis)
    E.write_json(d / "localities.json", locs)
    if areas:
        E.write_json(d / "areas.json", areas)

    # meta.json: start from the public one so a mock run only overrides k26
    meta = E.read_json(out / "meta.json") or E.read_json(E.PUBLIC / "meta.json") or {"elections": {}}
    for n, info in E.ELECTIONS.items():
        meta["elections"].setdefault(str(n), {**info, "status": "not_published"})
    meta["elections"][str(election)].update({
        "status": "final" if is_final else "partial", "counted_pct": pct, "updated": E.now(),
        "has_areas": bool(areas), "mock": mock,
    })
    meta["generated"] = E.now()
    meta["areas_index"] = E.read_json(E.PUBLIC / "geo" / "areas" / "index.json") or {}
    E.write_json(out / "meta.json", meta)

    # parties.json and swing/*.json depend on both elections
    r25 = E.load_results(E.PUBLIC, 25)
    r26 = E.load_results(out, 26)
    seats_all = {}
    for n, base in ((25, E.PUBLIC), (26, out)):
        nj = E.read_json(base / "results" / f"k{n}" / "national.json")
        seats_all[n] = nj["seats"] if nj else None
    E.write_json(out / "parties.json", E.parties_json(lineage, seats_all))
    if r25 and r26:
        for level, units in E.swing_levels(r25, r26, lineage).items():
            E.write_json(out / "swing" / f"{level}.json", units)

    secs = time.time() - t0
    print(f"k{election}: {len(locs)} localities, {len(munis)} municipalities, {len(areas)} areas, "
          f"valid {nat['valid']:,}, status {'final' if is_final else f'partial {pct}%'}"
          f"{' [MOCK]' if mock else ''} → {out.relative_to(ROOT) if out.is_relative_to(ROOT) else out} in {secs:.1f}s")
    print("  seats: " + ", ".join(f"{k} {v}" for k, v in sorted(seats.items(), key=lambda kv: -kv[1]) if v))
    for w in warnings:
        print("  WARNING " + w)
    return {"seats": seats, "warnings": warnings, "seconds": secs}


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--election", type=int, required=True, choices=(25, 26))
    ap.add_argument("--locality", help="expc.csv (default data/raw/k{N}/expc.csv)")
    ap.add_argument("--stations", help="expb.csv (default data/raw/k{N}/expb.csv)")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--final", action="store_true", default=None, help="mark the results final")
    g.add_argument("--partial", dest="final", action="store_false", help="mark the results partial")
    ap.add_argument("--no-areas", action="store_true", help="skip the GovMap neighborhood fetch")
    ap.add_argument("--download", action="store_true", help="download expc.csv/expb.csv into data/raw/k{N}/ first")
    ap.add_argument("--url-base", default=DEFAULT_URL_BASE, help="committee files URL (for --download)")
    args = ap.parse_args()
    try:
        if args.download:
            args.locality, args.stations = download(args.url_base, args.election)
        run(args.election, args.locality, args.stations, args.final, fetch_areas=not args.no_areas)
    except (IngestError, P.LineageError, ValueError) as e:
        sys.exit(f"INGEST FAILED: {e}")


if __name__ == "__main__":
    main()
