"""Write the static JSON the site reads (site/public/data/, §6)."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from . import parties as P
from .swing import unit_swing

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "site" / "public" / "data"
MOCK = ROOT / "site" / "mock-data"
ELECTIONS = {
    25: {"title": "הכנסת ה-25", "date": "2022-11-01"},
    26: {"title": "הכנסת ה-26", "date": "2026-10-27"},
}


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def parties_json(lineage: P.Lineage, seats: dict[int, dict | None]) -> dict:
    colors = P.load_colors()
    blocs = P.load_blocs()
    default = colors.get("default", "#9aa0a6")
    out: dict = {"default_color": default}
    for n in (25, 26):
        rows = []
        for r in P.read_lists(n):
            row = {**r, "color": colors.get(f"k{n}", {}).get(r["letters"], default),
                   "bloc": P.bloc_of(blocs, n, r["letters"])}
            if n == 26:
                e = lineage.by_letter[r["letters"]]
                row["lineage"] = {k: v for k, v in e.items() if k in ("id", "kind", "predecessors", "split_from", "from_k25", "joined", "note")}
            rows.append(row)
        out[f"k{n}"] = rows
    out["families"] = lineage.families()
    out["gone"] = [r["letters"] for r in P.read_lists(25) if r["letters"] not in lineage.used_k25()]
    out["blocs"] = {
        "order": blocs["order"],
        "items": {bid: {"name": b["name"], "color": colors.get("blocs", {}).get(bid, default),
                        "k25": b.get("k25") or [], "k26": b.get("k26") or [], "rest": bool(b.get("rest"))}
                  for bid, b in blocs["blocs"].items()},
    }
    out["surplus"] = {f"k{n}": [list(a) for a in P.load_surplus(n)] for n in (25, 26)}
    out["seats"] = {f"k{n}": s for n, s in seats.items()}
    return out


def _sum(units: list[dict]) -> tuple[dict, int]:
    votes: dict[str, int] = {}
    for u in units:
        for k, v in u["votes"].items():
            votes[k] = votes.get(k, 0) + v
    return votes, sum(u["valid"] for u in units)


def swing_levels(r25: dict, r26: dict | None, lineage: P.Lineage) -> dict[str, dict]:
    """Precomputed swing per level. Aggregates compare only localities counted in 2026."""
    blocs = P.load_blocs()
    if r26 is None:
        return {}
    loc22, loc26 = r25["localities"], r26["localities"]

    def agg(codes22: list[str], codes26: list[str], ext22=None, ext26=None) -> dict:
        counted = [c for c in codes26 if c in loc26 and loc26[c]["counted"]]
        u22 = [loc22[c] for c in counted if c in loc22]
        u26 = [loc26[c] for c in counted]
        if ext26 and ext26["valid"]:
            u22 += [ext22] if ext22 else []
            u26 += [ext26]
        v22, n22 = _sum(u22)
        v26, n26 = _sum(u26)
        return unit_swing(v22 if u22 else None, n22, v26 if u26 else None, n26, lineage, blocs)

    out: dict[str, dict] = {}
    out["national"] = {"IL": agg(list(loc22), list(loc26), r25.get("external"), r26.get("external"))}
    out["localities"] = {c: agg([c], [c]) for c in set(loc22) | set(loc26)}
    munis = {**r25["municipalities"], **r26["municipalities"]}
    out["municipalities"] = {m: agg(u["localities"], r26["municipalities"].get(m, u)["localities"])
                             for m, u in munis.items()}
    a22, a26 = r25.get("areas") or {}, r26.get("areas") or {}
    out["areas"] = {}
    for aid in set(a22) | set(a26):
        x, y = a22.get(aid), a26.get(aid)
        out["areas"][aid] = unit_swing(
            x["votes"] if x else None, x["valid"] if x else 0,
            y["votes"] if y and y["counted"] else None, y["valid"] if y else 0, lineage, blocs)
    return out


def load_results(base: Path, election: int) -> dict | None:
    d = base / "results" / f"k{election}"
    nat = read_json(d / "national.json")
    if nat is None:
        return None
    return {
        "national": nat["national"], "external": nat.get("external"),
        "municipalities": read_json(d / "municipalities.json") or {},
        "localities": read_json(d / "localities.json") or {},
        "areas": read_json(d / "areas.json") or {},
    }
