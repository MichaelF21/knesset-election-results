"""Map layers in site/public/data/geo (built by scripts/fetch_geo.py)."""
import json
from pathlib import Path

from pipeline import geo as G

GEO = Path(__file__).resolve().parent.parent / "site" / "public" / "data" / "geo"


def _dots() -> dict[str, dict]:
    return {d["id"]: d for d in json.loads((GEO / "points.json").read_text(encoding="utf-8"))}


def test_settlements_have_dots():
    dots = _dots()
    # West Bank settlements are tiny polygons (or none) at country zoom: each must have a dot
    for code in ("3570", "3650", "3557", "3611", "3400"):  # אריאל, אפרת, קדומים, קריית ארבע, חברון
        assert code in dots, code


def test_regional_council_members_have_dots():
    table = G.locality_table()
    results = json.loads((GEO.parent / "results" / "k25" / "localities.json").read_text(encoding="utf-8"))
    dots = _dots()
    members = [c for c in results if int(c) in table.index and table.at[int(c), "muni_kind"] == "regional"]
    assert members
    assert not [c for c in members if c not in dots]


def test_polygonless_localities_never_fade():
    dots = _dots()
    for code in ("967", "1411"):  # a Bedouin tribe and an army camp: no polygon at all
        assert dots[code]["poly"] is False
    assert dots["3570"]["poly"] is True
