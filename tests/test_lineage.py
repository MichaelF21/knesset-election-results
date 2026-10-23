import copy

import pytest

from pipeline import load as L
from pipeline import parties as P


def test_lineage_valid():
    lin = P.load_lineage()
    k26 = {r["letters"] for r in P.read_lists(26)}
    assert {e["k26"] for e in lin.entries} == k26


def test_fails_on_missing_2026_list():
    entries = P.read_yaml("lineage.yaml")
    entries = [e for e in entries if e["k26"] != "רק"]
    with pytest.raises(P.LineageError, match="missing from lineage.yaml"):
        P.validate_lineage(entries, {r["letters"] for r in P.read_lists(25)}, P.read_lists(26))


def test_fails_on_unknown_predecessor():
    entries = copy.deepcopy(P.read_yaml("lineage.yaml"))
    entries[0]["predecessors"] = ["XX"]
    with pytest.raises(P.LineageError, match="not a 2022 list"):
        P.validate_lineage(entries, {r["letters"] for r in P.read_lists(25)}, P.read_lists(26))


def test_withdrawn_list_must_be_marked():
    entries = copy.deepcopy(P.read_yaml("lineage.yaml"))
    for e in entries:
        if e["k26"] == "כן":
            e["kind"] = "new"
    with pytest.raises(P.LineageError, match="withdrew"):
        P.validate_lineage(entries, {r["letters"] for r in P.read_lists(25)}, P.read_lists(26))


def test_letter_reuse_is_not_continuity():
    lin = P.load_lineage()
    # 2026 פה is "אני ואתה" (2022 ך), not Yesh Atid (2022 פה)
    assert lin.by_letter["פה"]["predecessors"] == ["ך"]
    # 2026 ב is Otzma (split from 2022 ט), not the Jewish Home (2022 ב)
    assert lin.by_letter["ב"]["kind"] == "split"
    # 2026 ד is not Balad
    assert lin.by_letter["ד"]["kind"] == "new"
    assert "ב" not in lin.used_k25()


def test_every_k25_letter_has_official_name():
    loc, _ = L.load_election(25)
    official = {r["letters"] for r in P.read_lists(25)}
    assert set(L.party_columns(loc)) <= official


def test_blocs_cover_known_lists():
    blocs = P.load_blocs()
    assert P.bloc_of(blocs, 25, "ב") == "others"
    assert P.bloc_of(blocs, 26, "ב") == "coalition"
    assert P.bloc_of(blocs, 26, "ודם") == "arab"
    for bid in blocs["order"]:
        for n in (25, 26):
            official = {r["letters"] for r in P.read_lists(n)}
            assert set(blocs["blocs"][bid].get(f"k{n}") or []) <= official
