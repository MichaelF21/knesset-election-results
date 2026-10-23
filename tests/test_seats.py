import json
from pathlib import Path

import pytest

from pipeline import load as L
from pipeline.parties import load_surplus
from pipeline.seats import allocate

FIXTURE = Path(__file__).parent / "fixtures" / "seats_cases.json"

EXPECTED_2022 = {"מחל": 32, "פה": 24, "ט": 14, "כן": 12, "שס": 11, "ג": 7, "ל": 6, "עם": 5, "ום": 5, "אמת": 4}


@pytest.fixture(scope="module")
def votes22():
    loc, _ = L.load_election(25)
    return {c: int(loc[c].sum()) for c in L.party_columns(loc)}


def test_2022_regression(votes22):
    seats = allocate(votes22, load_surplus(25))
    assert {k: v for k, v in seats.items() if v} == EXPECTED_2022
    assert sum(seats.values()) == 120


def test_threshold_excludes_below(votes22):
    seats = allocate(votes22, load_surplus(25))
    # מרצ (3.16%) and בל"ד (2.91%) fell below 3.25%
    assert seats["מרצ"] == 0 and seats["ד"] == 0


def test_agreement_void_if_partner_fails():
    votes = {"A": 500, "B": 300, "C": 190, "D": 10}
    assert allocate(votes, [("C", "D")], seats=10) == allocate(votes, [], seats=10)


def test_agreement_moves_remainder_seat():
    votes = {"A": 4600, "B": 2600, "C": 2800}
    without = allocate(votes, [], seats=10)
    with_ = allocate(votes, [("B", "C")], seats=10)
    assert sum(without.values()) == sum(with_.values()) == 10
    assert with_["B"] + with_["C"] >= without["B"] + without["C"]


def test_fixture_in_sync(votes22):
    """tests/fixtures/seats_cases.json is what vitest checks seats.ts against."""
    cases = {
        "k25": {"votes": votes22, "agreements": load_surplus(25)},
        "small": {"votes": {"A": 4600, "B": 2600, "C": 2800}, "agreements": [["B", "C"]], "seats": 10},
        "void": {"votes": {"A": 500, "B": 300, "C": 190, "D": 10}, "agreements": [["C", "D"]], "seats": 10},
    }
    for c in cases.values():
        c["expected"] = allocate(c["votes"], [tuple(a) for a in c["agreements"]], seats=c.get("seats", 120))
        c["agreements"] = [list(a) for a in c["agreements"]]
    text = json.dumps(cases, ensure_ascii=False, indent=1, sort_keys=True) + "\n"
    if not FIXTURE.exists() or FIXTURE.read_text(encoding="utf-8") != text:
        FIXTURE.write_text(text, encoding="utf-8")
        pytest.fail("seats_cases.json regenerated; rerun tests and commit it")
