import pytest

from pipeline import load as L


@pytest.fixture(scope="module")
def k25():
    return L.load_election(25)


def test_national_totals(k25):
    loc, _ = k25
    assert loc[L.VALID].sum() == 4_764_742
    assert loc[L.ELIGIBLE].sum() == 6_788_804
    assert loc[L.VOTERS].sum() == 4_794_593


def test_party_columns(k25):
    loc, st = k25
    parties = L.party_columns(loc)
    assert len(parties) == 40
    assert parties == L.party_columns(st)
    # party votes add up to valid votes in every row
    assert (loc[parties].sum(axis=1) == loc[L.VALID]).all()


@pytest.mark.parametrize("letter,share", [
    ("מחל", 23.41), ("פה", 17.79), ("ט", 10.84), ("כן", 9.08), ("שס", 8.25),
    ("ג", 5.88), ("ל", 4.48), ("עם", 4.07), ("ום", 3.75), ("אמת", 3.69),
    ("מרצ", 3.16), ("ד", 2.91), ("ב", 1.19),
])
def test_national_shares(k25, letter, share):
    loc, _ = k25
    assert round(loc[letter].sum() / loc[L.VALID].sum() * 100, 2) == share


def test_station_sums_match_localities(k25):
    loc, st = k25
    assert L.station_sum_mismatches(loc, st).empty


def test_external_envelopes(k25):
    loc, _ = k25
    ext = loc[loc[L.CODE] == L.EXTERNAL_CODE]
    assert len(ext) == 1
    assert int(ext[L.VALID].iloc[0]) == 458_714


def test_bedouin_tribes(k25):
    loc, _ = k25
    assert loc[L.NAME].str.contains("שבט").sum() == 18


def test_place_code_groups_stations(k25):
    """ריכוז is the polling-place (building) code: Tel Aviv has 736 stations in 165 places."""
    _, st = k25
    ta = st[st[L.CODE] == 5000]
    assert len(ta) == 736
    assert ta[L.PLACE].nunique() == 165
    # sub-stations (19.1, 19.2, …) of one station number always share a building
    ta = ta.assign(base=ta[L.STATION].astype(int))
    assert (ta.groupby("base")[L.PLACE].nunique() == 1).all()
