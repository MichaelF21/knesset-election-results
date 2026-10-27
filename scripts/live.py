"""Election-night live loop (§8): poll the committee, ingest, publish.

Every --interval seconds:
  1. download expc.csv and expb.csv (committee) and the GovMap neighborhood results for 2026;
  2. if anything changed since the last cycle: run the ingest, sanity-check the output, then
     commit site/public/data (+ the raw files) and push. GitHub Pages redeploys in about a minute
     and open pages pick the update up by themselves (they check meta.json every minute).

  python scripts/live.py                    run until stopped (Ctrl+C)
  python scripts/live.py --final            the committee declared final results: one final run
  python scripts/live.py --no-push          everything except git (try it out)
  MOCK=1 python scripts/live.py --url-base http://localhost:8765 --no-push   rehearsal

Results stay "partial" until --final or a file data/raw/k26/FINAL exists. Errors never stop the
loop: they are logged and the next cycle tries again. The GitHub action "Ingest 26th Knesset results"
is the backup; don't run both at once.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline import export as E  # noqa: E402
from scripts import ingest  # noqa: E402

ELECTION = 26
RAW = ROOT / "data" / "raw" / f"k{ELECTION}"
FINAL_FLAG = RAW / "FINAL"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
FILES = ("expc.csv", "expb.csv")


def log(msg: str) -> None:
    print(f"[{datetime.now():%H:%M:%S}] {msg}", flush=True)


def download(url_base: str) -> dict[str, bytes] | None:
    """Both committee files, or None while they are not published yet (404)."""
    out = {}
    for name in FILES:
        r = requests.get(f"{url_base.rstrip('/')}/{name}", headers={"User-Agent": UA}, timeout=60,
                         params={"t": int(time.time())})  # past any cache
        if r.status_code == 404:
            return None
        r.raise_for_status()
        # before publication the committee serves an HTML "page not found" with status 200
        if r.content.lstrip()[:15].lower().startswith((b"<!doctype", b"<html")):
            return None
        if b"," not in r.content[:300] or len(r.content) < 200:
            raise ingest.IngestError(f"{name} does not look like the committee CSV ({r.content[:60]!r})")
        out[name] = r.content
    return out


def govmap_fingerprint(mock: bool) -> str:
    """Refresh GovMap 2026 neighborhoods (if published) and fingerprint them."""
    if not mock:
        try:
            from scripts.fetch_geo import fetch_govmap
            fetch_govmap(ELECTION, force=True)
        except Exception as e:  # GovMap trouble must not stop the night
            log(f"GovMap: {e}")
    base = ROOT / "data" / ("mock/govmap" if mock else "raw/govmap") / str(ELECTION) / "neighborhood_data.json"
    return hashlib.sha256(base.read_bytes()).hexdigest() if base.exists() else ""


def sanity_check(out: Path) -> str:
    """Refuse to publish obviously broken output. Returns a one-line summary."""
    nat = json.loads((out / "results" / f"k{ELECTION}" / "national.json").read_text(encoding="utf-8"))
    meta = json.loads((out / "meta.json").read_text(encoding="utf-8"))["elections"][str(ELECTION)]
    n = nat["national"]
    if n["valid"] <= 0:
        raise ingest.IngestError("no valid votes in the national total")
    if sum(nat["seats"].values()) not in (0, 120):
        raise ingest.IngestError(f"seats add up to {sum(nat['seats'].values())}")
    top = sorted(nat["seats"].items(), key=lambda kv: -kv[1])[:4]
    return (f"{meta['status']} {meta['counted_pct']}% ({meta.get('counted_source')}), "
            f"valid {n['valid']:,}, seats " + ", ".join(f"{k} {v}" for k, v in top))


def git(*args: str) -> str:
    r = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)}: {r.stderr.strip() or r.stdout.strip()}")
    return r.stdout


def publish(summary: str) -> None:
    git("add", "site/public/data", "data/raw/k26", "data/raw/govmap", "data/parties/lineage_review.md")
    if not git("diff", "--cached", "--name-only").strip():
        log("nothing to commit")
        return
    # the commit message prefix tells the deploy workflow to skip the test suites (already checked here)
    git("commit", "-m", f"Live update {datetime.now():%H:%M}: {summary}")
    try:
        git("push")
    except RuntimeError:
        # someone else pushed (e.g. the backup action): replay ours on top, ours wins for generated data
        git("pull", "--rebase", "-X", "theirs")
        git("push")
    log("pushed: the site redeploys in about a minute")


def cycle(args, state: dict, mock: bool) -> None:
    files = download(args.url_base)
    if files is None:
        log("committee files not published yet")
        return
    final = args.final or FINAL_FLAG.exists()
    fp = hashlib.sha256(b"".join(files[n] for n in FILES)).hexdigest() + govmap_fingerprint(mock) + str(final)
    if fp == state.get("fp"):
        log("no change")
        return
    src = ROOT / "data" / "mock" / "k26" if mock else RAW
    src.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (src / name).write_bytes(data)
    t0 = time.time()
    r = ingest.run(ELECTION, src / "expc.csv", src / "expb.csv", final=final, fetch_areas=False)
    out = E.MOCK if mock else E.PUBLIC
    summary = sanity_check(out)
    for w in r["warnings"]:
        log(f"warning: {w}")
    log(f"ingested in {time.time() - t0:.1f}s: {summary}")
    if args.push and not mock:
        publish(summary)
    state["fp"] = fp
    if final:
        state["done"] = True


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--interval", type=int, default=120, help="seconds between checks (default 120)")
    ap.add_argument("--url-base", default=ingest.DEFAULT_URL_BASE, help="committee files URL")
    ap.add_argument("--final", action="store_true", help="mark results final, publish once and stop")
    ap.add_argument("--no-push", dest="push", action="store_false", help="don't commit or push")
    ap.add_argument("--once", action="store_true", help="run one cycle and exit")
    args = ap.parse_args()
    mock = os.environ.get("MOCK") == "1"
    if mock:
        args.push = False  # mock data must never be published
        log("MOCK=1: writing site/mock-data, never pushing")
    elif args.push:
        branch = git("rev-parse", "--abbrev-ref", "HEAD").strip()
        if branch != "main":
            sys.exit(f"on branch {branch!r}: switch to main first (the site deploys from main)")
        if git("status", "--porcelain", "--untracked-files=no").strip():
            sys.exit("uncommitted changes in the repo: commit or stash them first")
        git("pull", "--ff-only")
    log(f"polling {args.url_base} every {args.interval}s{' (no push)' if not args.push else ''}")

    state: dict = {}
    failures = 0
    while True:
        try:
            cycle(args, state, mock)
            failures = 0
        except KeyboardInterrupt:
            raise
        except Exception as e:  # keep going: the next cycle may succeed
            failures += 1
            log(f"ERROR ({failures} in a row): {e}")
        if args.once or state.get("done"):
            break
        time.sleep(min(args.interval * (1 + failures), 600))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("stopped")
