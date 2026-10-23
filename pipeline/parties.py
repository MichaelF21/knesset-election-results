"""Party metadata: official lists, lineage, blocs, colors, surplus agreements."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from .load import DATA

PARTIES = DATA / "parties"
KINDS = {"continuing", "merger_existing_existing", "merger_existing_new", "split", "new", "withdrawn"}


class LineageError(ValueError):
    pass


@dataclass
class Lineage:
    entries: list[dict]
    by_letter: dict[str, dict] = field(init=False)

    def __post_init__(self) -> None:
        self.by_letter = {e["k26"]: e for e in self.entries}

    @property
    def running(self) -> list[dict]:
        return [e for e in self.entries if e["kind"] != "withdrawn"]

    def families(self) -> dict[str, list[str]]:
        """2022 joint list letter → 2026 successor letters (kind: split)."""
        fam: dict[str, list[str]] = {}
        for e in self.entries:
            if e["kind"] == "split":
                fam.setdefault(e["split_from"], []).append(e["k26"])
        return fam

    def used_k25(self) -> set[str]:
        used = set(self.families())
        for e in self.entries:
            used.update(e.get("predecessors") or [])
        return used


def read_yaml(name: str):
    return yaml.safe_load((PARTIES / name).read_text(encoding="utf-8"))


def read_lists(election: int) -> list[dict]:
    return json.loads((PARTIES / f"k{election}.json").read_text(encoding="utf-8"))


def validate_lineage(entries: list[dict], k25_letters: set[str], k26_lists: list[dict]) -> None:
    errors = []
    seen = set()
    for e in entries:
        k = e.get("k26")
        if k in seen:
            errors.append(f"duplicate k26 entry {k!r}")
        seen.add(k)
        kind = e.get("kind")
        if kind not in KINDS:
            errors.append(f"{k}: unknown kind {kind!r}")
            continue
        preds = e.get("predecessors") or []
        if kind == "continuing" and len(preds) != 1:
            errors.append(f"{k}: continuing needs exactly one predecessor")
        if kind == "merger_existing_existing" and len(preds) < 2:
            errors.append(f"{k}: merger_existing_existing needs 2+ predecessors")
        if kind == "merger_existing_new" and len(preds) != 1:
            errors.append(f"{k}: merger_existing_new needs exactly one existing predecessor")
        if kind in ("new", "withdrawn", "split") and preds:
            errors.append(f"{k}: kind {kind} takes no predecessors")
        if kind == "split" and e.get("split_from") not in k25_letters:
            errors.append(f"{k}: split_from {e.get('split_from')!r} is not a 2022 list")
        for p in preds:
            if p not in k25_letters:
                errors.append(f"{k}: predecessor {p!r} is not a 2022 list")
    official = {r["letters"] for r in k26_lists}
    missing = sorted(official - seen)
    if missing:
        errors.append(f"2026 lists missing from lineage.yaml: {missing}")
    extra = sorted(seen - official)
    if extra:
        errors.append(f"lineage.yaml letters not on the 2026 list: {extra}")
    withdrawn = {r["letters"] for r in k26_lists if r["status"] == "withdrawn"}
    for e in entries:
        if e.get("k26") in withdrawn and e.get("kind") != "withdrawn":
            errors.append(f"{e['k26']}: list withdrew on gov.il; set kind: withdrawn")
    # A 2022 list feeds at most one continuing/merger successor (splits are handled as families).
    owner: dict[str, str] = {}
    for e in entries:
        for p in e.get("predecessors") or []:
            if p in owner:
                errors.append(f"2022 {p!r} is a predecessor of both {owner[p]!r} and {e['k26']!r}")
            owner[p] = e["k26"]
    for fam in {e.get("split_from") for e in entries if e.get("kind") == "split"}:
        if fam in owner:
            errors.append(f"2022 {fam!r} is both split and a predecessor of {owner[fam]!r}")
    if errors:
        raise LineageError("lineage.yaml invalid:\n  " + "\n  ".join(errors))


def load_lineage(validate: bool = True) -> Lineage:
    entries = read_yaml("lineage.yaml")
    if validate:
        validate_lineage(entries, {r["letters"] for r in read_lists(25)}, read_lists(26))
    return Lineage(entries)


def write_lineage_review(lin: Lineage, k25_votes: dict[str, int] | None = None) -> Path:
    """data/parties/lineage_review.md: one row per 2026 list, plus 2022 lists with no successor."""
    k25 = {r["letters"]: r for r in read_lists(25)}
    k26 = {r["letters"]: r for r in read_lists(26)}
    total = sum(k25_votes.values()) if k25_votes else 0

    def name22(p: str) -> str:
        share = f" ({k25_votes.get(p, 0) / total * 100:.2f}%)" if total else ""
        return f"`{p}` {k25[p]['short_name']}{share}"

    rows = ["# Lineage review", "",
            "Generated from `lineage.yaml` by the pipeline. Approve or edit `lineage.yaml`, never this file.",
            "Rows with ⚠ were matched by name only.", "",
            "| 2026 | list | kind | compared with (2022) | note |", "|---|---|---|---|---|"]
    for e in lin.entries:
        k = e["k26"]
        if e["kind"] == "split":
            comp = f"family of {name22(e['split_from'])}"
        else:
            comp = " + ".join(name22(p) for p in e.get("predecessors") or []) or "—"
        note = ("⚠ " + e["review"]) if e.get("review") else e.get("note", "")
        rows.append(f"| `{k}` | {k26[k]['short_name']} | {e['kind']} | {comp} | {note} |")
    gone = [p for p in k25 if p not in lin.used_k25()]
    rows += ["", "## 2022 lists with no 2026 successor (shown as \"לא התמודדו הפעם\")", "",
             ", ".join(name22(p) for p in gone), ""]
    path = PARTIES / "lineage_review.md"
    path.write_text("\n".join(rows), encoding="utf-8")
    return path


def load_blocs() -> dict:
    """{'order': [...], 'blocs': {id: {'name', 'k25': [...], 'k26': [...], 'rest': bool}}}"""
    return read_yaml("blocs.yaml")


def bloc_of(blocs: dict, election: int, letter: str) -> str:
    rest = None
    for bid, b in blocs["blocs"].items():
        if b.get("rest"):
            rest = bid
        elif letter in (b.get(f"k{election}") or []):
            return bid
    if rest is None:
        raise ValueError("blocs.yaml needs one bloc with rest: true")
    return rest


def load_surplus(election: int) -> list[tuple[str, str]]:
    path = PARTIES / f"surplus_k{election}.yaml"
    if not path.exists():
        return []
    doc = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return [tuple(a) for a in doc.get("agreements") or []]


def load_colors() -> dict:
    path = PARTIES / "colors.yaml"
    return yaml.safe_load(path.read_text(encoding="utf-8")) if path.exists() else {}
