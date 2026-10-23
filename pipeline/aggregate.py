"""Aggregate committee results into map units (§6).

Unit shape: { id, name, eligible, voters, invalid, valid, turnout, votes: {letter: n}, winner,
              winner_share, margin, ... }
Levels: national (incl. external envelopes) → municipality → locality → neighborhood (area).
Regional councils = sum of their member localities; cities and local councils map 1:1.
"""
from __future__ import annotations

import re

import pandas as pd

from . import load as L

NUM = {"eligible": L.ELIGIBLE, "voters": L.VOTERS, "invalid": L.INVALID, "valid": L.VALID}


ELIGIBLE_COUNTED = "_eligible_counted"  # set by ingest for partial results


def make_unit(uid: str, name: str, eligible: int, voters: int, invalid: int, valid: int,
              votes: dict[str, int], eligible_counted: int | None = None, **extra) -> dict:
    votes = {k: int(v) for k, v in sorted(votes.items(), key=lambda kv: -kv[1]) if v}
    ranked = list(votes.items())
    winner = ranked[0][0] if ranked and valid else None
    first = ranked[0][1] if ranked else 0
    second = ranked[1][1] if len(ranked) > 1 else 0
    return {
        "id": uid, "name": name,
        "eligible": int(eligible), "voters": int(voters), "invalid": int(invalid), "valid": int(valid),
        # partial results: turnout among stations already counted
        "turnout": (round(voters / eligible_counted * 100, 2) if eligible_counted else None)
        if eligible_counted is not None else (round(voters / eligible * 100, 2) if eligible else None),
        "votes": votes,
        "winner": winner,
        "winner_share": round(first / valid * 100, 2) if valid else None,
        "margin": round((first - second) / valid * 100, 2) if valid else None,
        **({"eligible_counted": int(eligible_counted)} if eligible_counted is not None else {}),
        **extra,
    }


def _row_unit(uid: str, name: str, row: pd.Series, parties: list[str], **extra) -> dict:
    ec = int(row[ELIGIBLE_COUNTED]) if ELIGIBLE_COUNTED in row.index else None
    return make_unit(uid, name, *(int(row[c]) for c in NUM.values()),
                     {p: int(row[p]) for p in parties}, eligible_counted=ec, **extra)


def csv_name(name: str) -> str:
    """Last-resort display name from the corrupted CSV (double spaces mark dropped hyphens)."""
    return re.sub(r"\s{2,}", "-", str(name).strip())


def localities(loc: pd.DataFrame, table: pd.DataFrame) -> dict[str, dict]:
    parties = L.party_columns(loc)
    out = {}
    for _, r in loc.iterrows():
        code = int(r[L.CODE])
        if code == L.EXTERNAL_CODE:
            continue
        known = code in table.index
        name = table.at[code, "name"] if known else csv_name(r[L.NAME])
        muni = table.at[code, "muni_id"] if known else f"l{code}"
        out[str(code)] = _row_unit(str(code), name, r, parties, parent=muni, counted=bool(r[L.VALID] > 0))
    return out


def municipalities(locs: dict[str, dict], table: pd.DataFrame) -> dict[str, dict]:
    groups: dict[str, list[dict]] = {}
    for u in locs.values():
        groups.setdefault(u["parent"], []).append(u)
    out = {}
    for mid, members in groups.items():
        first = int(members[0]["id"])
        if first in table.index and table.at[first, "muni_id"] == mid:
            name, kind = table.at[first, "muni_name"], table.at[first, "muni_kind"]
        else:
            name, kind = members[0]["name"], "none"
        votes: dict[str, int] = {}
        for u in members:
            for k, v in u["votes"].items():
                votes[k] = votes.get(k, 0) + v
        counted = [u for u in members if u["counted"]]
        ec = [u.get("eligible_counted") for u in members]
        ec_sum = sum(e or 0 for e in ec) if any(e is not None for e in ec) else None
        out[mid] = make_unit(
            mid, name, *(sum(u[f] for u in members) for f in NUM), votes, eligible_counted=ec_sum,
            kind=kind, localities=sorted(u["id"] for u in members),
            counted=bool(counted), partial=0 < len(counted) < len(members))
    return out


def national(loc: pd.DataFrame) -> tuple[dict, dict | None]:
    parties = L.party_columns(loc)
    cols = list(NUM.values()) + parties + ([ELIGIBLE_COUNTED] if ELIGIBLE_COUNTED in loc.columns else [])
    total = loc[cols].sum()
    nat = _row_unit("IL", "ארצי", total, parties)
    ext = loc[loc[L.CODE] == L.EXTERNAL_CODE]
    external = _row_unit("external", "מעטפות חיצוניות", ext.iloc[0], parties) if len(ext) else None
    return nat, external


def areas_from_govmap(govmap: dict, meta: dict[str, dict]) -> dict[str, dict]:
    parties = govmap["parties"]
    out = {}
    for aid, v in govmap["features"].items():
        m = meta.get(aid, {"name": "", "city": None})
        out[aid] = make_unit(aid, m["name"], v.get("בזב", 0), v.get("מצביעים", 0), v.get("פסולים", 0),
                             v.get("כשרים", 0), {p: v.get(p, 0) for p in parties},
                             parent=str(m["city"]), counted=bool(v.get("כשרים", 0)))
    return out
