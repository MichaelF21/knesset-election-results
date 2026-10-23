"""Fetch official list names and ballot letters from gov.il (§3.1).

Order of attempts per election:
  1. Render https://www.gov.il/he/pages/candidates-lists-{n} with headless Chromium (Playwright)
     and save the page text to data/raw/parties/k{n}_page.txt.
  2. If the render is blocked (gov.il sits behind Cloudflare and sometimes blocks headless browsers),
     fall back to an existing data/raw/parties/k{n}_page.txt saved from a normal browser.
  3. Otherwise stop and ask the user to save the page into data/raw/parties/.

Writes data/parties/k25.json and k26.json and cross-checks them against the CSV columns (k25)
and the Knesset Channel seed list (k26).

Usage: python scripts/fetch_parties.py [--offline]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline import load as L  # noqa: E402

RAW = ROOT / "data" / "raw" / "parties"
OUT = ROOT / "data" / "parties"
URL = "https://www.gov.il/he/pages/candidates-lists-{n}"

# Knesset Channel, 27.9.2026: the 38 submitted lists. Not official, used only as a cross-check.
SEED_K26 = set("רק דרך צדק ד צף ך י ה קה בד ל קץ נף ב קך די אמת עם שס זך פה זץ נקי יק ז בקר נץ נר "
               "מחל כן ט צבי בי ק ודם רץ ג ני".split())

ROW = re.compile(r"^\s*([א-ת]{1,4})\t(.+?)\s*$")
WITHDRAWN = "אינה מתמודדת"
DISQUALIFIED = ("נפסלה", "פסולה")
PENDING = ("ממתינה", "בהמתנה")


def render(n: int) -> str | None:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return None
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(locale="he-IL")
            resp = page.goto(URL.format(n=n), wait_until="networkidle", timeout=60_000)
            page.wait_for_timeout(2_000)
            text = page.inner_text("body")
            browser.close()
    except Exception as e:  # network, timeout
        print(f"  k{n}: render failed: {e}")
        return None
    if resp is None or resp.status != 200 or "אות/אותיות" not in text:
        print(f"  k{n}: render blocked (HTTP {resp.status if resp else '?'})")
        return None
    return text


def parse(text: str) -> list[dict]:
    start = text.find("אות/אותיות")
    if start < 0:
        raise ValueError("list table header not found")
    rows = []
    for line in text[start:].splitlines()[1:]:
        m = ROW.match(line)
        if not m:
            if rows and line.strip() and "\t" not in line:
                break  # end of table
            continue
        letters, name = m.group(1), m.group(2).strip()
        status = "approved"
        if WITHDRAWN in name:
            status = "withdrawn"
            name = re.split(r"\s+[–-]\s+הרשימה אינה", name)[0].strip()
        elif any(s in name for s in DISQUALIFIED):
            status = "disqualified"
        elif any(s in name for s in PENDING):
            status = "pending"
        rows.append({"letters": letters, "official_name": name, "status": status})
    return rows


def build(n: int, offline: bool) -> list[dict]:
    RAW.mkdir(parents=True, exist_ok=True)
    saved = RAW / f"k{n}_page.txt"
    text = None if offline else render(n)
    if text:
        saved.write_text(f"# Rendered from {URL.format(n=n)} by scripts/fetch_parties.py\n{text}",
                         encoding="utf-8")
    elif saved.exists():
        print(f"  k{n}: using saved page {saved.relative_to(ROOT)}")
        text = saved.read_text(encoding="utf-8")
    else:
        sys.exit(f"k{n}: could not fetch {URL.format(n=n)}. Open it in a browser, save the page "
                 f"(Ctrl+S) or copy its text into {saved}, then rerun.")
    rows = parse(text)
    curated = (yaml.safe_load((OUT / "curated.yaml").read_text(encoding="utf-8")) or {}).get(f"k{n}", {})
    for r in rows:
        short, leader = curated.get(r["letters"], [None, None])
        r["short_name"] = short or re.split(r"\s+(?:בראשות|בהנהגת|[–-])\s+", r["official_name"])[0]
        r["leader"] = leader
    missing = sorted(set(curated) - {r["letters"] for r in rows})
    if missing:
        print(f"  k{n}: WARNING curated letters not on gov.il: {missing}")
    return [{k: r[k] for k in ("letters", "official_name", "short_name", "leader", "status")} for r in rows]


def check_k25(rows: list[dict]) -> list[str]:
    loc, _ = L.load_election(25)
    csv_letters = set(L.party_columns(loc))
    official = {r["letters"] for r in rows}
    errs = []
    if csv_letters - official:
        errs.append(f"k25 CSV letters without official name: {sorted(csv_letters - official)}")
    if official - csv_letters:
        errs.append(f"k25 official letters missing from CSV: {sorted(official - csv_letters)}")
    return errs


def check_k26(rows: list[dict]) -> list[str]:
    official = {r["letters"] for r in rows}
    notes = []
    if official != SEED_K26:
        notes.append(f"k26 differs from seed: only on gov.il {sorted(official - SEED_K26)}, "
                     f"only in seed {sorted(SEED_K26 - official)}")
    return notes


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true", help="use saved pages only")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    for n in (25, 26):
        print(f"k{n}:")
        rows = build(n, args.offline)
        problems = check_k25(rows) if n == 25 else check_k26(rows)
        (OUT / f"k{n}.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        by_status: dict[str, int] = {}
        for r in rows:
            by_status[r["status"]] = by_status.get(r["status"], 0) + 1
        print(f"  {len(rows)} lists {by_status} -> data/parties/k{n}.json")
        for p in problems:
            print("  " + p)
        if n == 25 and problems:
            sys.exit(1)


if __name__ == "__main__":
    main()
