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


def test_neighboring_winners_distinguishable(colors):
    """Parties that win touching units (data/parties/neighbor_pairs_k25.json, from
    scripts/neighbor_pairs.py) must be told apart. The same pairs were also run through the dataviz
    validate_palette.js CVD check (only ט/עם is in the 6-8 band, relieved by tooltips and the table)."""
    pairs = json.loads((P.PARTIES / "neighbor_pairs_k25.json").read_text(encoding="utf-8"))
    pal = colors["k25"]
    close = [(a, b, round(delta_e2000(pal[a], pal[b]), 1)) for a, b, n in pairs
             if n >= 2 and delta_e2000(pal.get(a, colors["default"]), pal.get(b, colors["default"])) < MIN_DELTA_E]
    assert not close, f"too similar: {close}"


def test_2026_main_parties_distinguishable(colors):
    pal = colors["k26"]
    close = [(a, b, round(delta_e2000(pal[a], pal[b]), 1))
             for a, b in itertools.combinations(pal, 2) if delta_e2000(pal[a], pal[b]) < 10]
    assert not close, f"too similar: {close}"


def test_label_contrast_aa(colors):
    for election in ("k25", "k26", "blocs"):
        for k, c in colors[election].items():
            assert max(contrast(c, "#000000"), contrast(c, "#ffffff")) >= 4.5, (election, k, c)
