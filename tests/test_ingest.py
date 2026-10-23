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


def test_partial_files_with_only_counted_rows(out, tmp_path):
    """The committee's partial files may list only counted stations and localities, with full
    eligible-voter counts per locality. That must ingest (no sum failure), add the missing localities
    as not counted, and report a sane counted share."""
    lp, sp = _mock(40, tmp_path)
    st = pd.read_csv(sp, encoding="utf-8-sig")
    loc = pd.read_csv(lp, encoding="utf-8-sig")
    (tmp_path / "in").mkdir()
    st[st["מצביעים"] > 0].to_csv(tmp_path / "in/expb.csv", index=False, encoding="utf-8-sig")
    # locality rows keep the full eligible count even though only counted stations are listed
    loc[loc["מצביעים"] > 0].to_csv(tmp_path / "in/expc.csv", index=False, encoding="utf-8-sig")
    r = ingest.run(26, tmp_path / "in/expc.csv", tmp_path / "in/expb.csv", final=False, out=out, fetch_areas=False)
    assert any("not in the file yet" in w for w in r["warnings"])
    res = json.loads((out / "results/k26/localities.json").read_text(encoding="utf-8"))
    assert len(res) == 1215 and sum(not u["counted"] for u in res.values()) > 0
    e = json.loads((out / "meta.json").read_text(encoding="utf-8"))["elections"]["26"]
    assert 35 < e["counted_pct"] < 50 and e["counted_source"] == "files"


def test_partial_station_mismatch_warns_final_fails(out, tmp_path):
    lp, sp = _mock(40, tmp_path)
    st = pd.read_csv(sp, encoding="utf-8-sig")
    i = st.index[st["מצביעים"] > 0][0]
    st.loc[i, ["מחל", "כשרים", "מצביעים"]] += 1  # stations file fetched a moment later
    st.to_csv(tmp_path / "expb.csv", index=False, encoding="utf-8-sig")
    r = ingest.run(26, lp, tmp_path / "expb.csv", final=False, out=out, fetch_areas=False)
    assert any("station sums differ" in w for w in r["warnings"])
    with pytest.raises(ingest.IngestError, match="station sums"):
        ingest.run(26, lp, tmp_path / "expb.csv", final=True, out=out, fetch_areas=False)


def test_counted_share_prefers_govmap_totals():
    loc = pd.DataFrame({L.ELIGIBLE: [100, 100], L.VOTERS: [50, 0]})
    pct, src = ingest.counted_share(loc, None, {"totals": {"kalpi": 200, "kalpi_counted": 50}}, 0)
    assert (round(pct), src) == (25, "govmap")
    pct, src = ingest.counted_share(loc, None, None, 400)  # floor: previous election's eligible
    assert (round(pct), src) == (25, "files")
