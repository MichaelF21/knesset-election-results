"""Knesset seat allocation (§5): 3.25% threshold, Bader-Ofer (D'Hondt) with surplus agreements.

Mirrored in site/src/lib/seats.ts (used for partial results on election night).
"""
from __future__ import annotations

from typing import Iterable, Mapping

SEATS = 120
THRESHOLD = 0.0325


def _bader_ofer(votes: Mapping[str, int], seats: int) -> dict[str, int]:
    """Allocate `seats` among `votes`: floor of votes/quota, then remainders by votes/(seats+1)."""
    total = sum(votes.values())
    if seats <= 0 or total <= 0:
        return {k: 0 for k in votes}
    quota = total / seats
    alloc = {k: int(v // quota) for k, v in votes.items()}
    while sum(alloc.values()) < seats:
        # ties: larger vote count first, then letter order for determinism
        best = max(votes, key=lambda k: (votes[k] / (alloc[k] + 1), votes[k], k))
        alloc[best] += 1
    return alloc


def allocate(votes: Mapping[str, int], agreements: Iterable[tuple[str, str]] = (),
             seats: int = SEATS, threshold: float = THRESHOLD) -> dict[str, int]:
    """Seats per list. `votes` are national valid votes per ballot letter (incl. external envelopes)."""
    valid = sum(votes.values())
    passed = {k: v for k, v in votes.items() if valid and v >= threshold * valid}
    result = {k: 0 for k in votes}
    if not passed:
        return result

    # An agreement counts only if both lists passed the threshold.
    pair_of: dict[str, tuple[str, str]] = {}
    for a, b in agreements:
        if a in passed and b in passed and a not in pair_of and b not in pair_of:
            pair_of[a] = pair_of[b] = (a, b)

    # Units: single lists, or both lists of an agreement treated as one.
    units: dict[str, int] = {}
    members: dict[str, tuple[str, ...]] = {}
    for k, v in passed.items():
        key = "+".join(pair_of[k]) if k in pair_of else k
        units[key] = units.get(key, 0) + v
        members[key] = pair_of.get(k, (k,))

    # Initial seats per list use the general quota; the agreement only affects the remainders.
    quota = sum(passed.values()) / seats
    base = {k: int(v // quota) for k, v in passed.items()}
    unit_seats = {u: sum(base[m] for m in members[u]) for u in units}
    while sum(unit_seats.values()) < seats:
        best = max(units, key=lambda u: (units[u] / (unit_seats[u] + 1), units[u], u))
        unit_seats[best] += 1

    for u, n in unit_seats.items():
        if len(members[u]) == 1:
            result[members[u][0]] = n
        else:
            result.update(_bader_ofer({m: passed[m] for m in members[u]}, n))
    return result
