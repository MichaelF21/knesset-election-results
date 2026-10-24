"""Color checks for the party palette (§7): map distinguishability and WCAG AA labels."""
import itertools
import json
import math

import pytest

from pipeline import load as L
from pipeline import parties as P
from pipeline.parties import load_colors

MIN_DELTA_E = 12  # CIEDE2000; clearly distinct side by side


def _rgb(hex_: str):
    h = hex_.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(hex_: str) -> float:
    r, g, b = (_lin(c) for c in _rgb(hex_))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: str, b: str) -> float:
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def lab(hex_: str):
    r, g, b = (_lin(c) for c in _rgb(hex_))
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116  # noqa: E731
    fx, fy, fz = f(x), f(y), f(z)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def delta_e2000(c1: str, c2: str) -> float:
    L1, a1, b1 = lab(c1)
    L2, a2, b2 = lab(c2)
    C1, C2 = math.hypot(a1, b1), math.hypot(a2, b2)
    Cm = (C1 + C2) / 2
    G = 0.5 * (1 - math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)))
    a1p, a2p = a1 * (1 + G), a2 * (1 + G)
    C1p, C2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    h1p = math.degrees(math.atan2(b1, a1p)) % 360
    h2p = math.degrees(math.atan2(b2, a2p)) % 360
    dLp, dCp = L2 - L1, C2p - C1p
    dh = h2p - h1p
    if C1p * C2p == 0:
        dh = 0
    elif dh > 180:
        dh -= 360
    elif dh < -180:
        dh += 360
    dHp = 2 * math.sqrt(C1p * C2p) * math.sin(math.radians(dh / 2))
    Lm, Cmp = (L1 + L2) / 2, (C1p + C2p) / 2
    hm = h1p + h2p
    if C1p * C2p != 0:
        hm = (h1p + h2p + 360) / 2 if abs(h1p - h2p) > 180 else (h1p + h2p) / 2
    T = (1 - 0.17 * math.cos(math.radians(hm - 30)) + 0.24 * math.cos(math.radians(2 * hm))
         + 0.32 * math.cos(math.radians(3 * hm + 6)) - 0.20 * math.cos(math.radians(4 * hm - 63)))
    dtheta = 30 * math.exp(-(((hm - 275) / 25) ** 2))
    Rc = 2 * math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7))
    Sl = 1 + 0.015 * (Lm - 50) ** 2 / math.sqrt(20 + (Lm - 50) ** 2)
    Sc, Sh = 1 + 0.045 * Cmp, 1 + 0.015 * Cmp * T
    Rt = -math.sin(math.radians(2 * dtheta)) * Rc
    return math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh))


@pytest.fixture(scope="module")
def colors():
    return load_colors()


def map_winners_2022() -> set[str]:
    loc, _ = L.load_election(25)
    parties = L.party_columns(loc)
    # units big enough to matter on the map (tiny localities can be won by anyone)
    big = loc[loc[L.VALID] >= 100]
    return set(big[parties].idxmax(axis=1))


def test_2022_winners_have_colors(colors):
    assert map_winners_2022() <= set(colors["k25"])


def _violations(pal: dict, pairs: dict, constrained: set) -> list:
    from scripts.tune_colors import MIN_ANY_OK, cvd_de, ok_de, ok_pair

    bad = []
    for a, b in itertools.combinations([k for k in pal if k in constrained], 2):
        strength = pairs.get(frozenset((a, b)))
        if not ok_pair(pal[a], pal[b], strength):
            bad.append((a, b, round(ok_de(pal[a], pal[b]), 1), round(cvd_de(pal[a], pal[b]), 1),
                        "neighbors" if strength else f"legend (< {MIN_ANY_OK})"))
    return bad


def test_2022_neighbors_distinguishable(colors):
    """Parties whose units touch (data/parties/neighbor_pairs_k25.json) clear the dataviz validator's
    thresholds, normal vision and simulated color blindness (rules in scripts/tune_colors.py)."""
    from scripts.tune_colors import pairs_2022

    loc, _ = L.load_election(25)
    votes = {c: int(loc[c].sum()) for c in L.party_columns(loc)}
    p22 = pairs_2022()
    constrained = {x for pair in p22 for x in pair} | {k for k, v in votes.items() if v >= 0.01 * sum(votes.values())}
    bad = _violations(colors["k25"], p22, constrained)
    assert not bad, f"too similar: {bad}"


def test_2026_neighbors_distinguishable(colors):
    from scripts.tune_colors import MAJORS_26, pairs_2022, pairs_2026

    bad = _violations(colors["k26"], pairs_2026(pairs_2022()), set(MAJORS_26) | {"ני"})
    assert not bad, f"too similar: {bad}"


def test_continuing_parties_keep_their_color(colors):
    lin = P.load_lineage()
    for e in lin.running:
        if e["kind"] == "continuing" and e["predecessors"][0] == e["k26"] and e["k26"] in colors["k25"]:
            assert colors["k26"].get(e["k26"]) == colors["k25"][e["k26"]], e["k26"]


def test_label_contrast_aa(colors):
    for election in ("k25", "k26", "blocs"):
        for k, c in colors[election].items():
            assert max(contrast(c, "#000000"), contrast(c, "#ffffff")) >= 4.5, (election, k, c)
