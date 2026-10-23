"""Swing between the 25th and 26th Knesset for one unit (§4.2). Identical at every level.

Share = party votes / valid votes of the unit, in percent. Swing = share26 − share22, in pp.
The front end mirrors this in site/src/lib/swing.ts; tests/fixtures/swing_cases.json keeps them in sync.
"""
from __future__ import annotations

from typing import Mapping

from .parties import Lineage, bloc_of

SMALL_SAMPLE = 100


def _share(votes: Mapping[str, int], letter: str, valid: int) -> float:
    return votes.get(letter, 0) / valid * 100 if valid else 0.0


def _r(x: float | None) -> float | None:
    return None if x is None else round(x, 3)


def unit_swing(v22: Mapping[str, int] | None, valid22: int, v26: Mapping[str, int] | None, valid26: int,
               lineage: Lineage, blocs: dict) -> dict:
    """Swing for one unit.

    v22/v26 are {ballot letter: votes}; either may be None when the unit has no result in that
    election (not yet counted, new locality). Returns a JSON-ready dict.
    """
    have22 = v22 is not None and valid22 > 0
    have26 = v26 is not None and valid26 > 0
    v22 = v22 or {}
    v26 = v26 or {}

    parties: dict[str, dict] = {}
    for e in lineage.running:
        k = e["k26"]
        kind = e["kind"]
        s26 = _share(v26, k, valid26) if have26 else None
        row: dict = {"kind": kind, "share26": _r(s26), "share22": None, "swing": None}
        preds = e.get("predecessors") or []
        if kind in ("continuing", "merger_existing_existing", "merger_existing_new") and have22:
            parts = {p: _share(v22, p, valid22) for p in preds}
            s22 = sum(parts.values())
            row["share22"] = _r(s22)
            if kind == "merger_existing_existing":
                row["parts22"] = {p: _r(s) for p, s in parts.items()}
            if s26 is not None:
                row["swing"] = _r(s26 - s22)
        if kind == "split":
            row["split_from"] = e["split_from"]
        parties[k] = row

    families: dict[str, dict] = {}
    for src, members in lineage.families().items():
        s22 = _share(v22, src, valid22) if have22 else None
        s26 = sum(_share(v26, m, valid26) for m in members) if have26 else None
        families[src] = {
            "members": members,
            "share22": _r(s22),
            "share26": _r(s26),
            "swing": _r(s26 - s22) if s22 is not None and s26 is not None else None,
        }

    used = lineage.used_k25()
    gone = {}
    if have22:
        gone = {k: _r(_share(v22, k, valid22)) for k in v22 if k not in used}

    bloc_rows = {}
    for bid in blocs["order"]:
        s22 = sum(_share(v22, k, valid22) for k in v22 if bloc_of(blocs, 25, k) == bid) if have22 else None
        s26 = sum(_share(v26, k, valid26) for k in v26 if bloc_of(blocs, 26, k) == bid) if have26 else None
        bloc_rows[bid] = {
            "share22": _r(s22),
            "share26": _r(s26),
            "swing": _r(s26 - s22) if s22 is not None and s26 is not None else None,
        }

    return {
        "parties": parties,
        "families": families,
        "gone": gone,
        "blocs": bloc_rows,
        "comparable": have22 and have26,
        "small_sample": (have22 and valid22 < SMALL_SAMPLE) or (have26 and valid26 < SMALL_SAMPLE),
    }
