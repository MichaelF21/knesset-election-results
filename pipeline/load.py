"""Load the Central Elections Committee result CSVs.

Two files per election:
  expc.csv  one row per locality (ישוב)
  expb.csv  one row per polling station (קלפי)

Party columns are every column after `כשרים`. Column names can be remapped per election
through a YAML file (e.g. data/parties/k26_columns.yaml) so format changes stay out of code.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd
import yaml

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

# Canonical column names used throughout the pipeline.
COMMITTEE = "סמל ועדה"
NAME = "שם ישוב"
CODE = "סמל ישוב"
ELIGIBLE = "בזב"
VOTERS = "מצביעים"
INVALID = "פסולים"
VALID = "כשרים"
STATION_ID = "ברזל"
STATION = "קלפי"
PLACE = "ריכוז"
JUDGE = "שופט"

EXTERNAL_CODE = 9999  # מעטפות חיצוניות: counted nationally, never mapped

BASE_COLS = [COMMITTEE, NAME, CODE, ELIGIBLE, VOTERS, INVALID, VALID]
STATION_COLS = [COMMITTEE, STATION_ID, NAME, CODE, STATION, PLACE, JUDGE,
                ELIGIBLE, VOTERS, INVALID, VALID]


def load_column_map(election: int) -> dict[str, str]:
    """Return {raw column name: canonical name} for an election, if a map file exists."""
    path = DATA / "parties" / f"k{election}_columns.yaml"
    if not path.exists():
        return {}
    doc = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return {str(k): str(v) for k, v in (doc.get("columns") or {}).items()}


def _read(path: Path | str, election: int | None) -> pd.DataFrame:
    df = pd.read_csv(path, encoding="utf-8-sig")
    df.columns = [str(c).strip() for c in df.columns]
    if election is not None:
        mapping = load_column_map(election)
        if mapping:
            df = df.rename(columns=mapping)
    return df


def party_columns(df: pd.DataFrame) -> list[str]:
    """Ballot-letter columns: everything after `כשרים`."""
    cols = list(df.columns)
    if VALID not in cols:
        raise ValueError(f"missing column {VALID!r}; got {cols[:12]}")
    return cols[cols.index(VALID) + 1:]


def _type(df: pd.DataFrame, required: list[str]) -> pd.DataFrame:
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"missing columns: {missing}")
    parties = party_columns(df)
    int_cols = [c for c in required if c not in (NAME, STATION)] + parties
    for c in int_cols:
        df[c] = pd.to_numeric(df[c], errors="raise").fillna(0).astype("int64")
    df[NAME] = df[NAME].astype(str).str.strip()
    return df


def load_localities(path: Path | str, election: int | None = None) -> pd.DataFrame:
    df = _type(_read(path, election), BASE_COLS)
    if not df[CODE].is_unique:
        dup = df[df[CODE].duplicated()][CODE].tolist()
        raise ValueError(f"duplicate locality codes: {dup[:10]}")
    return df


def load_stations(path: Path | str, election: int | None = None) -> pd.DataFrame:
    df = _type(_read(path, election), STATION_COLS)
    df[STATION] = pd.to_numeric(df[STATION], errors="raise").astype(float)
    return df


def station_sum_mismatches(localities: pd.DataFrame, stations: pd.DataFrame) -> pd.DataFrame:
    """Rows where the station totals do not equal the locality row. Empty when consistent."""
    cols = [ELIGIBLE, VOTERS, INVALID, VALID] + party_columns(localities)
    summed = stations.groupby(CODE)[cols].sum()
    loc = localities.set_index(CODE)[cols]
    summed = summed.reindex(loc.index, fill_value=0)
    diff = (loc - summed)
    bad = diff[(diff != 0).any(axis=1)]
    return bad


def load_election(election: int, locality_csv: Path | str | None = None,
                  stations_csv: Path | str | None = None) -> tuple[pd.DataFrame, pd.DataFrame | None]:
    raw = DATA / "raw" / f"k{election}"
    lpath = Path(locality_csv) if locality_csv else raw / "expc.csv"
    spath = Path(stations_csv) if stations_csv else raw / "expb.csv"
    loc = load_localities(lpath, election)
    st = load_stations(spath, election) if spath.exists() else None
    return loc, st
