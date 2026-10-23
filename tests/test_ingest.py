"""Election-night ingest (§8): validation, partial results, mock end-to-end, idempotence."""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import pandas as pd
import pytest

from pipeline import load as L
from scripts import ingest

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture
def out(tmp_path, monkeypatch):
    """Run ingests into a temp dir; 2022 results come from the real public data."""
    monkeypatch.delenv("MOCK", raising=False)
    return tmp_path


def _mock(counted: float, tmp: Path) -> tuple[Path, Path]:
    env = {**os.environ, "MOCK": "1"}
    subprocess.run([sys.executable, "-c",
                    f"import sys; sys.path.insert(0, '.'); from scripts.mock_k26 import build; build(26, {counted})"],
                   cwd=ROOT, env=env, check=True)
    return ROOT / "data/mock/k26/expc.csv", ROOT / "data/mock/k26/expb.csv"


def test_unknown_letter_fails_loudly(out, tmp_path):
    loc = pd.read_csv(ROOT / "data/raw/k25/expc.csv", encoding="utf-8-sig")
    loc = loc.rename(columns={"מחל": "XYZ"})
    bad = tmp_path / "bad.csv"
    loc.to_csv(bad, index=False, encoding="utf-8-sig")
    with pytest.raises(ingest.IngestError, match="unknown ballot letters"):
        ingest.run(25, bad, ROOT / "nonexistent.csv", out=out, fetch_areas=False)


def test_station_sum_mismatch_fails(out, tmp_path):
    st = pd.read_csv(ROOT / "data/raw/k25/expb.csv", encoding="utf-8-sig")
    st.loc[0, "מחל"] += 1
    st.loc[0, "כשרים"] += 1
    bad = tmp_path / "expb.csv"
    st.to_csv(bad, index=False, encoding="utf-8-sig")
    with pytest.raises(ingest.IngestError, match="station sums"):
        ingest.run(25, None, bad, out=out, fetch_areas=False)


def test_mock_final_end_to_end(out, monkeypatch, tmp_path):
    lp, sp = _mock(100, tmp_path)
    t0 = time.time()
    ingest.run(26, lp, sp, final=True, out=out, fetch_areas=False)
    assert time.time() - t0 < 120
    meta = json.loads((out / "meta.json").read_text(encoding="utf-8"))
    assert meta["elections"]["26"]["status"] == "final"
    # swing at every level
    for level in ("national", "municipalities", "localities"):
        s = json.loads((out / "swing" / f"{level}.json").read_text(encoding="utf-8"))
        assert s, level
        some = next(iter(s.values()))
        assert some["comparable"]
        assert some["parties"]["מחל"]["swing"] is not None
        assert some["parties"]["אמת"]["kind"] == "merger_existing_existing"
        assert some["parties"]["דרך"]["swing"] is None  # new
    nat = json.loads((out / "swing" / "national.json").read_text(encoding="utf-8"))["IL"]
    assert nat["families"]["ט"]["swing"] is not None
    assert "כן" in nat["gone"]  # National Unity has no running successor
    parties = json.loads((out / "parties.json").read_text(encoding="utf-8"))
    kinds = {p["letters"]: p["lineage"]["kind"] for p in parties["k26"]}
    assert kinds["דרך"] == "new" and kinds["רק"] == "merger_existing_new" and kinds["ב"] == "split"


def test_mock_partial_compares_counted_units_only(out, tmp_path):
    lp, sp = _mock(40, tmp_path)
    ingest.run(26, lp, sp, final=False, out=out, fetch_areas=False)
    meta = json.loads((out / "meta.json").read_text(encoding="utf-8"))
    e = meta["elections"]["26"]
    assert e["status"] == "partial" and 30 < e["counted_pct"] < 50
    locs = json.loads((out / "swing" / "localities.json").read_text(encoding="utf-8"))
    res26 = json.loads((out / "results/k26/localities.json").read_text(encoding="utf-8"))
    for code, s in locs.items():
        if code in res26 and not res26[code]["counted"]:
            assert not s["comparable"] and s["parties"]["מחל"]["swing"] is None


def test_idempotent(out):
    ingest.run(25, out=out, fetch_areas=False)
    a = (out / "results/k25/localities.json").read_bytes()
    ingest.run(25, out=out, fetch_areas=False)
    assert (out / "results/k25/localities.json").read_bytes() == a
