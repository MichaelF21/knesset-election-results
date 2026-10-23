import json
from pathlib import Path

import pytest

from pipeline.parties import Lineage
from pipeline.swing import unit_swing

FIXTURE = Path(__file__).parent / "fixtures" / "swing_cases.json"

# Synthetic lineage covering every kind. Letters deliberately reuse 2022 letters for other parties.
LINEAGE = Lineage([
    {"k26": "A", "kind": "continuing", "predecessors": ["A"]},
    {"k26": "M", "kind": "merger_existing_existing", "predecessors": ["L", "R"]},
    {"k26": "T", "kind": "merger_existing_new", "predecessors": ["Y"]},
    {"k26": "S1", "kind": "split", "split_from": "J"},
    {"k26": "S2", "kind": "split", "split_from": "J"},
    {"k26": "Y", "kind": "new"},  # same letter as a 2022 list, different party
    {"k26": "W", "kind": "withdrawn"},
])
BLOCS = {"order": ["b1", "b2", "rest"], "blocs": {
    "b1": {"k25": ["A", "J"], "k26": ["A", "S1", "S2"]},
    "b2": {"k25": ["L", "R", "Y"], "k26": ["M", "T"]},
    "rest": {"rest": True},
}}

V22 = {"A": 300, "L": 50, "R": 50, "Y": 200, "J": 250, "G": 150}  # valid 1000; G did not run again
V26 = {"A": 250, "M": 120, "T": 230, "S1": 150, "S2": 130, "Y": 100, "W": 0, "Z": 20}  # valid 1000

CASES = {
    "full": dict(v22=V22, valid22=1000, v26=V26, valid26=1000),
    "zero_2022": dict(v22={"A": 0, "Y": 100}, valid22=100, v26={"A": 10, "Y": 90}, valid26=100),
    "small": dict(v22={"A": 40, "Y": 10}, valid22=50, v26={"A": 45, "Y": 5}, valid26=50),
    "no_2026": dict(v22=V22, valid22=1000, v26=None, valid26=0),
}


def run(case):
    return unit_swing(case["v22"], case["valid22"], case["v26"], case["valid26"], LINEAGE, BLOCS)


@pytest.fixture
def full():
    return run(CASES["full"])


def test_continuing(full):
    a = full["parties"]["A"]
    assert (a["share22"], a["share26"], a["swing"]) == (30.0, 25.0, -5.0)


def test_merger_existing_existing_vs_sum(full):
    m = full["parties"]["M"]
    assert m["share22"] == 10.0  # 5 + 5
    assert m["parts22"] == {"L": 5.0, "R": 5.0}
    assert m["swing"] == 2.0


def test_merger_existing_new_vs_existing_only(full):
    t = full["parties"]["T"]
    assert (t["share22"], t["swing"]) == (20.0, 3.0)


def test_new_has_no_swing_even_if_letter_reused(full):
    y = full["parties"]["Y"]
    assert y["kind"] == "new"
    assert y["share26"] == 10.0
    assert y["share22"] is None and y["swing"] is None


def test_split_family(full):
    s1 = full["parties"]["S1"]
    assert s1["swing"] is None and s1["split_from"] == "J"
    fam = full["families"]["J"]
    assert fam["members"] == ["S1", "S2"]
    assert (fam["share22"], fam["share26"], fam["swing"]) == (25.0, 28.0, 3.0)


def test_did_not_run(full):
    assert full["gone"] == {"G": 15.0}
    assert "W" not in full["parties"]


def test_shares_add_up(full):
    # 2022: successors' predecessors + families + gone cover every 2022 vote exactly once
    p = full["parties"]
    s22 = sum(p[k]["share22"] for k in ("A", "M", "T")) + full["families"]["J"]["share22"] + sum(full["gone"].values())
    assert s22 == pytest.approx(100.0)


def test_blocs(full):
    b = full["blocs"]
    assert b["b1"] == {"share22": 55.0, "share26": 53.0, "swing": -2.0}
    assert b["b2"] == {"share22": 30.0, "share26": 35.0, "swing": 5.0}
    assert b["rest"]["share22"] == 15.0 and b["rest"]["share26"] == 12.0


def test_zero_in_2022_still_shows_pp_swing():
    r = run(CASES["zero_2022"])
    assert r["parties"]["A"]["share22"] == 0.0
    assert r["parties"]["A"]["swing"] == 10.0


def test_small_sample_flag(full):
    assert full["small_sample"] is False
    assert run(CASES["small"])["small_sample"] is True


def test_missing_2026_gives_no_swing():
    r = run(CASES["no_2026"])
    assert r["comparable"] is False
    assert r["parties"]["A"]["swing"] is None
    assert r["parties"]["A"]["share22"] == 30.0
    assert r["blocs"]["b1"]["swing"] is None


def test_fixture_in_sync():
    """tests/fixtures/swing_cases.json is what vitest checks swing.ts against."""
    fixture = {
        "lineage": LINEAGE.entries,
        "blocs": BLOCS,
        "cases": {name: {"input": c, "expected": run(c)} for name, c in CASES.items()},
    }
    text = json.dumps(fixture, ensure_ascii=False, indent=1, sort_keys=True) + "\n"
    if not FIXTURE.exists() or FIXTURE.read_text(encoding="utf-8") != text:
        FIXTURE.parent.mkdir(exist_ok=True)
        FIXTURE.write_text(text, encoding="utf-8")
        pytest.fail("swing_cases.json regenerated; rerun tests and commit it")
