"""Synthetic 26th Knesset results for building and testing the UI (§8). NEVER deploy these.

Perturbs the 2022 station results and re-labels them under the 2026 ballot letters, then runs the
ingest with MOCK=1 (output: site/mock-data/, served only by the dev server, with a "נתוני דמה" banner).

  MOCK=1 python scripts/mock_k26.py               full count
  MOCK=1 python scripts/mock_k26.py --counted 40  only ~40% of stations counted (partial results)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline import load as L  # noqa: E402

OUT = ROOT / "data" / "mock" / "k26"
GOVMAP_OUT = ROOT / "data" / "mock" / "govmap" / "26"

# 2022 letter → {2026 letter: share of its voters}. Invented numbers, only to exercise every lineage kind.
FLOWS = {
    "מחל": {"מחל": 0.93, "ב": 0.04, "רק": 0.03},
    "פה": {"רק": 0.72, "אמת": 0.10, "דרך": 0.18},
    "ט": {"ט": 0.42, "ב": 0.46, "ני": 0.12},
    "כן": {"דרך": 0.55, "רק": 0.20, "די": 0.15, "מחל": 0.10},
    "שס": {"שס": 0.97, "ג": 0.03},
    "ג": {"ג": 0.92, "רץ": 0.05, "זך": 0.03},
    "ל": {"ל": 0.90, "רק": 0.10},
    "עם": {"עם": 1.0},
    "ום": {"ודם": 1.0},
    "ד": {"ודם": 0.85, "עם": 0.15},
    "אמת": {"אמת": 1.0},
    "מרצ": {"אמת": 1.0},
    "ב": {"ט": 0.3, "רק": 0.4, "ב": 0.3},
    "יז": {"די": 1.0},
    "ך": {"פה": 1.0},
    "ף": {"צף": 1.0},
    "זץ": {"בי": 1.0},
    "יק": {"יק": 1.0},
    "נף": {"נף": 1.0},
    "קך": {"קך": 1.0},
}
SMALL_NEW = ["בד", "בקר", "ד", "ה", "ז", "זץ", "י", "ך", "נקי", "נץ", "נר", "צבי", "צדק", "ק", "קה", "קץ"]
K26 = [r["letters"] for r in json.loads((ROOT / "data/parties/k26.json").read_text(encoding="utf-8"))
       if r["status"] != "withdrawn"]


def remap(votes22: pd.DataFrame, rng: np.random.Generator, locality_noise: pd.Series) -> pd.DataFrame:
    """2022 party votes (rows = units) → 2026 party votes."""
    out = pd.DataFrame(0.0, index=votes22.index, columns=K26)
    for src in votes22.columns:
        flows = FLOWS.get(src)
        if flows is None:  # small 2022 lists: spread over small new lists
            flows = {k: 1 / len(SMALL_NEW) for k in SMALL_NEW}
        for dst, share in flows.items():
            out[dst] += votes22[src] * share
    noise = rng.lognormal(0, 0.12, size=out.shape) * locality_noise.values[:, None]
    out = out * noise
    out["דרך"] *= 1.25  # an invented national trend so swing is visible
    out["ב"] *= 1.15
    return out


def to_int(df: pd.DataFrame, valid: pd.Series) -> pd.DataFrame:
    """Scale rows to the target valid total and round, keeping exact sums."""
    scaled = df.div(df.sum(axis=1).replace(0, 1), axis=0).mul(valid, axis=0)
    floor = np.floor(scaled).astype(int)
    rem = (valid - floor.sum(axis=1)).astype(int)
    frac = (scaled - floor).values
    order = np.argsort(-frac, axis=1)
    arr = floor.values
    for i, r in enumerate(rem.values):
        arr[i, order[i, :r]] += 1
    return pd.DataFrame(arr, index=df.index, columns=df.columns)


def build(seed: int, counted: float) -> tuple[Path, Path]:
    rng = np.random.default_rng(seed)
    loc22, st22 = L.load_election(25)
    parties22 = L.party_columns(st22)

    codes = st22[L.CODE].unique()
    loc_noise = pd.Series(rng.lognormal(0, 0.08, size=len(codes)), index=codes)
    st = st22.copy()
    turnout = rng.normal(1.0, 0.03, size=len(st)).clip(0.85, 1.1)
    st[L.ELIGIBLE] = (st[L.ELIGIBLE] * rng.normal(1.05, 0.01, size=len(st))).round().astype(int)
    voters = (st[L.VOTERS] * 1.05 * turnout).round().astype(int)
    # external envelopes have no eligible voters (בזב 0), so only cap rows that have them
    st[L.VOTERS] = np.where(st[L.ELIGIBLE] > 0, np.minimum(voters, st[L.ELIGIBLE]), voters)
    st[L.INVALID] = (st[L.VOTERS] * 0.006).round().astype(int)
    st[L.VALID] = st[L.VOTERS] - st[L.INVALID]
    votes = remap(st22[parties22], rng, loc_noise.reindex(st[L.CODE]).reset_index(drop=True).set_axis(st.index))
    votes = to_int(votes, st[L.VALID])

    if counted < 100:
        # whole localities report together on election night is unrealistic; count stations randomly,
        # but keep external envelopes (counted last) at zero
        mask = rng.random(len(st)) < counted / 100
        mask &= (st[L.CODE] != L.EXTERNAL_CODE).values
        for c in [L.VOTERS, L.INVALID, L.VALID]:
            st.loc[~mask, c] = 0
        votes.loc[~mask, :] = 0

    st26 = pd.concat([st[L.STATION_COLS[:-4] + [L.ELIGIBLE, L.VOTERS, L.INVALID, L.VALID]], votes], axis=1)
    cols = [L.ELIGIBLE, L.VOTERS, L.INVALID, L.VALID] + K26
    loc26 = (st26.groupby([L.COMMITTEE, L.CODE], as_index=False)[cols].sum()
             .merge(loc22[[L.CODE, L.NAME]], on=L.CODE))
    loc26 = loc26[L.BASE_COLS + K26]

    OUT.mkdir(parents=True, exist_ok=True)
    lp, sp = OUT / "expc.csv", OUT / "expb.csv"
    loc26.to_csv(lp, index=False, encoding="utf-8-sig")
    st26.to_csv(sp, index=False, encoding="utf-8-sig")

    # Neighborhood results in GovMap's format, perturbed the same way
    gm = json.loads((ROOT / "data/raw/govmap/25/neighborhood_data.json").read_text(encoding="utf-8"))
    feats = pd.DataFrame.from_dict(gm["features"], orient="index")
    v22 = feats[gm["parties"]].fillna(0)
    valid = (feats["כשרים"] * rng.normal(1.05, 0.03, size=len(feats))).round().astype(int).clip(lower=0)
    v26 = to_int(remap(v22, rng, pd.Series(rng.lognormal(0, 0.08, size=len(feats)), index=feats.index)), valid)
    if counted < 100:
        v26.loc[rng.random(len(v26)) >= counted / 100, :] = 0
        valid = v26.sum(axis=1)
    out_feats = {}
    for aid in feats.index:
        n = int(valid[aid]) if v26.loc[aid].sum() else 0
        out_feats[aid] = {"בזב": int(feats.at[aid, "בזב"] * 1.05), "מצביעים": n, "פסולים": 0, "כשרים": n,
                          **{k: int(v) for k, v in v26.loc[aid].items()}}
    GOVMAP_OUT.mkdir(parents=True, exist_ok=True)
    (GOVMAP_OUT / "neighborhood_data.json").write_text(
        json.dumps({"version": 2, "parties": K26, "features": out_feats}, ensure_ascii=False), encoding="utf-8")
    return lp, sp


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    if os.environ.get("MOCK") != "1":
        sys.exit("mock data is only built with MOCK=1 (it must never be deployed)")
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=26)
    ap.add_argument("--counted", type=float, default=100, help="percent of stations counted")
    args = ap.parse_args()
    lp, sp = build(args.seed, args.counted)
    from scripts.ingest import run
    run(26, lp, sp, final=args.counted >= 100, fetch_areas=False)


if __name__ == "__main__":
    main()
