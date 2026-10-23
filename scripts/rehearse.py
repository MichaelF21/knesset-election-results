"""Election-night rehearsal: everything except the GitHub push, against a fake committee server.

A local server publishes synthetic 2026 results in stages (nothing → 10% → 40% with only counted
rows listed → 85% → final). scripts/live.py (MOCK=1) polls it, and a browser page that stays open
must pick up every stage by itself, keep the visitor's selection, and end on "סופי".

  python scripts/rehearse.py

Uses ports 8765 (fake committee) and 5179 (mock dev server, started if not running). Writes only
mock data (data/mock/, site/mock-data/), screenshots go to data/mock/rehearsal/.
"""
from __future__ import annotations

import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ["MOCK"] = "1"
from scripts.mock_k26 import build  # noqa: E402

MOCK = ROOT / "data" / "mock"
STAGE = MOCK / "committee"
SHOTS = MOCK / "rehearsal"
COMMITTEE_PORT, SITE_PORT = 8765, 5179
ENV = {**os.environ, "MOCK": "1", "PYTHONIOENCODING": "utf-8"}
NPX = "npx.cmd" if os.name == "nt" else "npx"


def port_open(port: int) -> bool:
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def stage(counted: float, only_counted: bool = False) -> None:
    lp, sp = build(26, counted)
    loc, st = pd.read_csv(lp, encoding="utf-8-sig"), pd.read_csv(sp, encoding="utf-8-sig")
    if only_counted:  # partial files that list only counted stations / localities
        loc, st = loc[loc["מצביעים"] > 0], st[st["מצביעים"] > 0]
    for name, df in (("expc.csv", loc), ("expb.csv", st)):
        df.to_csv(STAGE / f"{name}.tmp", index=False, encoding="utf-8-sig")
        os.replace(STAGE / f"{name}.tmp", STAGE / name)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    from playwright.sync_api import sync_playwright

    for d in (STAGE, SHOTS, ROOT / "site" / "mock-data", MOCK / "k26", MOCK / "govmap"):
        shutil.rmtree(d, ignore_errors=True)
    STAGE.mkdir(parents=True)
    SHOTS.mkdir(parents=True)

    procs = [subprocess.Popen([sys.executable, "-m", "http.server", str(COMMITTEE_PORT), "--directory", str(STAGE)],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)]
    if not port_open(SITE_PORT):
        procs.append(subprocess.Popen([NPX, "vite", "--port", str(SITE_PORT), "--strictPort"], cwd=ROOT / "site",
                                      env=ENV, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
        for _ in range(60):
            if port_open(SITE_PORT):
                break
            time.sleep(0.5)
    log = open(MOCK / "rehearsal-live.log", "w", encoding="utf-8")
    url = f"http://localhost:{COMMITTEE_PORT}"
    live = subprocess.Popen([sys.executable, "scripts/live.py", "--url-base", url, "--interval", "4"],
                            cwd=ROOT, env=ENV, stdout=log, stderr=subprocess.STDOUT)
    procs.append(live)
    checks: list[tuple[str, bool]] = []

    def state(pg):
        return pg.evaluate("""() => ({
          chip: document.querySelector('.chip')?.innerText ?? '',
          view: document.querySelector('[role=radio][aria-checked=true]')?.innerText ?? '',
          title: document.querySelector('.unit-title')?.innerText ?? '',
          toast: document.querySelector('.toast')?.innerText ?? '',
        })""")

    def wait_for(pg, pred, seconds=40):
        t0 = time.time()
        while time.time() - t0 < seconds:
            s = state(pg)
            if pred(s):
                return s, time.time() - t0
            pg.wait_for_timeout(1000)
        return state(pg), None

    try:
        with sync_playwright() as p:
            b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
            pg = b.new_page(viewport={"width": 1400, "height": 900})
            errors: list[str] = []
            pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(f"http://localhost:{SITE_PORT}/?poll=3")
            pg.wait_for_timeout(4000)
            s = state(pg)
            checks.append(("before results: 2022 view", s["view"] == "כנסת 25"))
            pg.locator("#search-input").fill("חיפה")
            pg.keyboard.press("Enter")
            pg.wait_for_timeout(1500)

            prev = ""
            for i, (counted, only, label) in enumerate([(10, False, "10%"), (40, True, "40%, only counted rows"),
                                                        (85, False, "85%")], 1):
                stage(counted, only)
                s, secs = wait_for(pg, lambda s: "נספרו" in s["chip"] and s["chip"] != prev)
                prev = s["chip"]
                print(f"stage {label}: {'updated after %.0fs' % secs if secs is not None else 'NOT updated'} — "
                      f"{s['chip'].splitlines()[0]}")
                checks.append((f"stage {label}: page updated by itself", secs is not None))
                pg.screenshot(path=str(SHOTS / f"stage{i}.png"))
            checks.append(("switched to the comparison view", state(pg)["view"] == "השוואה"))
            checks.append(("selection kept (חיפה)", state(pg)["title"] == "חיפה"))

            live.terminate()
            stage(100)
            subprocess.run([sys.executable, "scripts/live.py", "--url-base", url, "--final", "--once"],
                           cwd=ROOT, env=ENV, stdout=log, stderr=subprocess.STDOUT, check=False)
            s, secs = wait_for(pg, lambda s: s["chip"] == "סופי")
            checks.append(("final results shown", secs is not None))
            pg.screenshot(path=str(SHOTS / "final.png"))
            checks.append(("no page errors", not errors))
            b.close()
    finally:
        for proc in procs:
            proc.terminate()
        log.close()

    print()
    for name, ok in checks:
        print(f"{'PASS' if ok else 'FAIL'}  {name}")
    print(f"\nlive.py log: {MOCK / 'rehearsal-live.log'}\nscreenshots: {SHOTS}")
    sys.exit(0 if all(ok for _, ok in checks) else 1)


if __name__ == "__main__":
    main()
