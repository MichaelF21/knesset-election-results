"""Party colors: start from each party's real color, move clashing ones as little as possible (§7).

Targets are the parties' colors in Wikipedia's party-color data (Module:Political party), which follows
the parties' own branding. Parties whose units touch on the map must stay distinguishable:
  - OKLab ΔE×100 ≥ MIN_NEIGHBOR_OK for normal vision,
  - OKLab ΔE×100 ≥ MIN_CVD under protanopia and deuteranopia simulation (Machado 2009),
  - every color keeps a black or white label with WCAG AA contrast.
2026 neighbor pairs come from the 2022 ones through lineage.yaml. A continuing party keeps its
2022 color in 2026. Parties are placed greedily, biggest first, each at the nearest variant of its
target (lightness first, then chroma, then a small hue shift) that satisfies the constraints.

  python scripts/tune_colors.py           print the proposal
  python scripts/tune_colors.py --write   also update data/parties/colors.yaml
"""
from __future__ import annotations

import argparse
import itertools
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline import load as L  # noqa: E402
from pipeline import parties as P  # noqa: E402
from tests.test_colors import contrast, delta_e2000  # noqa: E402

# thresholds of the dataviz palette validator (OKLab ΔE×100): neighbors ≥ 15 for normal vision and
# ≥ 8 under color-vision deficiency; any two colored parties ≥ 8 (legend swatches)
# Strong neighbors (many shared borders, or leading 2026 lists) get the full thresholds; pairs that
# rarely touch get the validator's "legal with secondary encoding" band (tooltips, legend, table view).
STRONG = {"ok": 15.0, "cvd": 8.0}
WEAK = {"ok": 10.0, "cvd": 6.0}
STRONG_BORDERS = 10  # 2022 pairs sharing at least this many borders
MIN_ANY_OK = 8.0

# Real colors (Wikipedia, Module:Political party), by election and ballot letters.
TARGETS = {
    25: {
        "מחל": "#1f5aa5",  # Likud
        "פה": "#2fb4e6",   # Yesh Atid: the light blue of its logo (Wikipedia's #2038F0 is Likud-blue)
        "ט": "#4f9298",    # Religious Zionist Party (joint list with Otzma Yehudit and Noam)
        "כן": "#00bbdf",   # National Unity
        "שס": "#000000",   # Shas
        "ג": "#003366",    # United Torah Judaism
        "ל": "#23c2eb",    # Yisrael Beiteinu
        "עם": "#15793d",   # Ra'am
        "ום": "#d42436",   # Hadash–Ta'al
        "אמת": "#ee1c25",  # Labor
        "מרצ": "#40ae49",  # Meretz
        "ד": "#f6600c",    # Balad
        "ב": "#8dc63f",    # The Jewish Home
        "יז": "#feb414",   # New Economic Party
        "ז": "#0c8599",    # Shahar (no Wikipedia color)
        "אצ": "#748ffc",   # Economic Freedom (no Wikipedia color)
        "צ": "#ff922b",    # Young on Fire (no Wikipedia color)
        "קץ": "#adb5bd",
    },
    26: {
        "רק": "#2a2a78",   # Together (Bennett + Yesh Atid)
        "דרך": "#62b9f2",  # Yashar
        "אמת": "#2a38d7",  # The Democrats
        "ט": "#4f9298",    # Religious Zionism (and Zehut): the Religious Zionist color
        "ב": "#ff4500",    # Otzma Yehudit
        "ני": "#00b2ef",   # Noam
        "ודם": "#01b2ac",  # Joint List
        "די": "#68692c",   # The Reservists
        "ך": "#8f36bf",    # Amcha Yisrael
        "פה": "#ced4da",   # Ani VeAta (no Wikipedia color)
    },
}
CONTINUING_KEEP = True  # continuing lists reuse their 2022 color
# 2026 lists likely to pass the threshold (2022 strength of their predecessors, or polling for new ones)
MAJORS_26 = ["מחל", "רק", "דרך", "אמת", "שס", "ג", "ב", "ט", "ל", "עם", "ודם", "די"]
LEADING_26 = ["מחל", "רק", "דרך", "אמת", "שס", "ב", "ודם", "עם"]


# --- color math --------------------------------------------------------------------------------
def hex2rgb(h): return tuple(int(h.lstrip("#")[i:i + 2], 16) / 255 for i in (0, 2, 4))
def rgb2hex(c): return "#" + "".join(f"{round(max(0, min(1, x)) * 255):02x}" for x in c)
def lin(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def gam(c): return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def oklab_lin(r, g, b):
    l_ = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m_ = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s_ = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    return (0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
            1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
            0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_)


def oklab(h): return oklab_lin(*(lin(c) for c in hex2rgb(h)))


def from_oklab(L_, a, b):
    l_ = (L_ + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m_ = (L_ - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s_ = (L_ - 0.0894841775 * a - 1.2914855480 * b) ** 3
    r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_
    g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_
    bb = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_
    if min(r, g, bb) < -0.001 or max(r, g, bb) > 1.001:
        return None  # out of gamut
    return rgb2hex(tuple(gam(max(0, min(1, x))) for x in (r, g, bb)))


CVD = {  # Machado et al. 2009, severity 1.0, linear RGB
    "protan": ((0.152286, 1.052583, -0.204868), (0.114503, 0.786281, 0.099216), (-0.003882, -0.048116, 1.051998)),
    "deutan": ((0.367322, 0.860646, -0.227968), (0.280085, 0.672501, 0.047413), (-0.011820, 0.042940, 0.968881)),
}


def cvd_de(h1, h2) -> float:
    worst = 1e9
    for m in CVD.values():
        labs = []
        for h in (h1, h2):
            r, g, b = (lin(c) for c in hex2rgb(h))
            sim = [max(0.0, min(1.0, row[0] * r + row[1] * g + row[2] * b)) for row in m]
            labs.append(oklab_lin(*sim))
        worst = min(worst, math.dist(labs[0], labs[1]) * 100)
    return worst


def variants(target: str):
    """Candidate colors around a target, nearest first (OKLab distance)."""
    L0, a0, b0 = oklab(target)
    C0, H0 = math.hypot(a0, b0), math.atan2(b0, a0)
    out = {}
    for dL in [i * 0.02 for i in range(-15, 16)]:
        for kC in (1.0, 0.85, 1.15, 0.7, 1.3):
            for dH in (0, 6, -6, 12, -12, 20, -20):
                L_ = L0 + dL
                if not 0.15 <= L_ <= 0.95:
                    continue
                h = H0 + math.radians(dH)
                c = from_oklab(L_, C0 * kC * math.cos(h), C0 * kC * math.sin(h))
                if c:
                    out[c] = math.dist(oklab(c), (L0, a0, b0)) + abs(dH) * 0.002
    return sorted(out, key=out.get)


def ok_de(c1, c2) -> float:
    return math.dist(oklab(c1), oklab(c2)) * 100


def ok_pair(c1, c2, strength: dict | None) -> bool:
    if strength:
        return ok_de(c1, c2) >= strength["ok"] and cvd_de(c1, c2) >= strength["cvd"]
    return ok_de(c1, c2) >= MIN_ANY_OK


def aa(c): return max(contrast(c, "#000000"), contrast(c, "#ffffff")) >= 4.5


# --- neighbor pairs ------------------------------------------------------------------------------
def pairs_2022() -> dict[frozenset, dict]:
    raw = json.loads((ROOT / "data/parties/neighbor_pairs_k25.json").read_text(encoding="utf-8"))
    return {frozenset((a, b)): (STRONG if n >= STRONG_BORDERS else WEAK) for a, b, n in raw if n >= 2}


def pairs_2026(p22: dict[frozenset, dict]) -> dict[frozenset, dict]:
    lin_ = P.load_lineage()
    succ: dict[str, list[str]] = {}
    for e in lin_.running:
        for p in e.get("predecessors") or []:
            succ.setdefault(p, []).append(e["k26"])
        if e["kind"] == "split":
            succ.setdefault(e["split_from"], []).append(e["k26"])
    out: dict[frozenset, dict] = {}

    def add(pair, strength):
        if out.get(pair) is not STRONG:
            out[pair] = strength

    for pair, strength in p22.items():
        a, b = tuple(pair)
        for x in succ.get(a, []):
            for y in succ.get(b, []):
                if x != y:
                    add(frozenset((x, y)), strength)
    # split siblings compete in the same places
    for members in lin_.families().values():
        for p in itertools.combinations(members, 2):
            add(frozenset(p), WEAK)
    # 2022 winners say little about where new and merged lists will win: every list likely to pass
    # the threshold is a potential neighbor of every other; the leading ones strongly so
    for p in itertools.combinations(MAJORS_26, 2):
        add(frozenset(p), STRONG if set(p) <= set(LEADING_26) else WEAK)
    return out


def solve(targets: dict[str, str], pairs: dict[frozenset, dict], order: list[str], fixed: dict[str, str]):
    chosen = dict(fixed)
    for k in order:
        if k in chosen or k not in targets:
            continue
        for c in variants(targets[k]):
            if not aa(c):
                continue
            if all(ok_pair(c, chosen[o], pairs.get(frozenset((k, o)))) for o in chosen):
                chosen[k] = c
                break
        else:
            raise SystemExit(f"no color found for {k}")
    return chosen


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    loc, _ = L.load_election(25)
    votes22 = {c: int(loc[c].sum()) for c in L.party_columns(loc)}
    p22 = pairs_2022()
    order22 = sorted(TARGETS[25], key=lambda k: -votes22.get(k, 0))
    c22 = solve(TARGETS[25], p22, order22, {})

    lineage = P.load_lineage()
    fixed26 = {}
    for e in lineage.running:
        if e["kind"] == "continuing" and CONTINUING_KEEP and e["predecessors"][0] == e["k26"] and e["k26"] in c22:
            fixed26[e["k26"]] = c22[e["k26"]]
    targets26 = {**{k: c22[k] for k in fixed26}, **TARGETS[26]}
    # rough 2026 order: predecessors' 2022 strength
    weight = {e["k26"]: sum(votes22.get(p, 0) for p in (e.get("predecessors") or [e.get("split_from") or ""]))
              for e in lineage.running}
    order26 = sorted(targets26, key=lambda k: -weight.get(k, 0))
    c26 = solve(targets26, pairs_2026(p22), order26, fixed26)

    for n, chosen, targets in ((25, c22, TARGETS[25]), (26, c26, targets26)):
        print(f"k{n}:")
        for k, c in chosen.items():
            moved = delta_e2000(c, targets[k])
            print(f"  {k:4} target {targets[k]} -> {c}" + (f"  (moved ΔE {moved:.1f})" if moved > 1 else ""))
    if args.write:
        path = ROOT / "data/parties/colors.yaml"
        lines = path.read_text(encoding="utf-8").splitlines()
        out, section = [], None
        for line in lines:
            if line.startswith("k25:"):
                section = 25
            elif line.startswith("k26:"):
                section = 26
            elif line and not line.startswith(" "):
                section = None
            m = re.match(r'^  (\S+): "#[0-9a-fA-F]{6}"\s*(?:#\s*(.*))?$', line)
            if section and m:
                key, comment = m.group(1), (m.group(2) or "").strip()
                chosen = c22 if section == 25 else c26
                if key in chosen:
                    line = f'  {key}: "{chosen[key]}"' + (f"  # {comment}" if comment else "")
            out.append(line)
        path.write_text("\n".join(out) + "\n", encoding="utf-8")
        print("updated", path.relative_to(ROOT))


if __name__ == "__main__":
    main()
