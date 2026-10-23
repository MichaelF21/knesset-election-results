# תוצאות הבחירות לכנסת — 25 ← 26: Implementation Plan for Claude Code

> Hand this file to a Claude Code session in an empty repository, together with the two CSV files
> (`expc.csv`, `expb.csv`). Work phase by phase. At the end of each phase, run its checks and commit.
> Where this plan says **ASK**, stop and ask the user. Do not guess.

---

## 0. Goal and scope

A static, Hebrew-only (RTL) website that:

1. Shows the results of the 25th Knesset election (1.11.2022) now, and is ready to ingest the 26th Knesset
   results (27.10.2026) as soon as the Central Elections Committee (ועדת הבחירות המרכזית) publishes its files.
   Election night results arrive in stages, so partial results must also be supported.
2. Shows a map of Israel divided into municipalities/localities. Each unit is colored by its largest party.
   Where data allows, the map goes down to neighborhoods (statistical areas).
3. Shows party and bloc swing (change in vote share, in percentage points) at every level:
   national → municipality → locality → neighborhood.
4. Handles party lineage: new parties are labeled "חדשה". Mergers and splits are compared against
   the right 2022 predecessors (rules in §4).
5. Uses the official list names and ballot letters as published by the committee on gov.il.

Out of scope for v1: candidate-level pages, turnout forecasting, historical elections before 2022.

---

## 1. What the attached data contains (already verified)

| File | Rows | Granularity | Key columns |
|---|---|---|---|
| `expc.csv` | 1,216 | One row per locality (ישוב) | `סמל ועדה`, `שם ישוב`, `סמל ישוב`, `בזב` (eligible), `מצביעים` (voters), `פסולים` (invalid), `כשרים` (valid), then **40 party columns keyed by ballot letters** (`מחל`, `פה`, `ט`, `כן`, `שס`, `ג`, `ל`, `עם`, `ום`, `אמת`, `מרצ`, `ד`, `ב`, …) |
| `expb.csv` | 12,545 | One row per polling station (קלפי) | Same, plus `ברזל` (unique station id), `קלפי` (station number, may be decimal like `3.1`), `ריכוז`, `שופט` (0/1) |

Verified facts the pipeline must preserve. These are good regression tests:

- National valid votes: **4,764,742**. Eligible voters: 6,788,804. Voters: 4,794,593.
- National shares: מחל 23.41%, פה 17.79%, ט 10.84%, כן 9.08%, שס 8.25%, ג 5.88%, ל 4.48%, עם 4.07%, ום 3.75%, אמת 3.69%, מרצ 3.16%, ד 2.91%, ב 1.19%.
- Station rows sum exactly to the locality rows for every locality (0 mismatches).
- **`מעטפות חיצוניות` (code 9999)** holds 458,714 valid votes (~9.6%): soldiers, diplomats, prisoners, hospitals and similar.
  These votes count in national totals but cannot be placed on the map. Show them as a separate "מעטפות חיצוניות" row.
- 18 rows are Bedouin tribes (`… שבט`). They have no municipal polygon and must be shown as points.
- Locality names in the CSV are corrupted: hyphens are dropped (`תל אביב  יפו` has a double space, `בנימינהגבעת עדה` is merged).
  **Always join on `סמל ישוב` (CBS locality code)**. Take display names from the CBS locality list, not from the CSV.
- `ריכוז` appears to be the polling *place* (building) code. Tel Aviv has 736 stations spread over 165 `ריכוז` values.
  Verify this. If it holds, geocoding is needed per building, not per station.
- **The CSV has no addresses or coordinates.** Neighborhood placement needs an external station-address file (§3.3).

### ⚠️ Ballot letters are NOT stable identities across elections
Letters are reused by different parties. Examples from the 2026 letter list:
- `פה` was Yesh Atid in 2022. In 2026 it belongs to "אני ואתה – מפלגת העם הישראלית".
- `ב` was the Jewish Home in 2022. In 2026 it is עוצמה יהודית.

The code must never infer continuity from letters. Continuity comes only from the hand-maintained lineage file (§4).

---

## 2. Tech stack

- **Data pipeline:** Python 3.11+ with `pandas`, `geopandas`, `shapely`, `pyproj`, plus `mapshaper` (npm) for simplification and TopoJSON output.
  The pipeline writes static JSON/TopoJSON into `site/public/data/`.
- **Front end:** Vite, React and TypeScript, with **MapLibre GL JS**. Polygons are drawn from local GeoJSON/TopoJSON, so no tile server is needed.
  Use no third-party basemap by default (avoids licensing and keeps the colors readable). Add an optional faint outline layer.
- **Styling:** plain CSS with logical properties (`margin-inline-start` etc.). Set `<html lang="he" dir="rtl">`.
  Use the Google Fonts "Assistant" or "Heebo" font. Format numbers with `Intl.NumberFormat('he-IL')`.
- **Charts:** a small hand-built SVG or `d3-shape`/`d3-scale` for bars, the seat parliament chart and the swing chart.
- **Tests:** `pytest` for the pipeline. `vitest` for the swing and seat-allocation logic. Playwright smoke test for the site.
- **Hosting:** static output (`npm run build`), so it can be deployed to GitHub Pages, Netlify or Cloudflare Pages.

---

## 3. Data sources

The session must verify each URL before relying on it. If a source is unreachable, follow the fallback and tell the user.

### 3.1 Party names and ballot letters (official)
- 25th Knesset: https://www.gov.il/he/pages/candidates-lists-25
- 26th Knesset: https://www.gov.il/he/pages/candidates-lists-26

These gov.il pages are rendered by JavaScript. A plain HTTP fetch returns an empty shell, as confirmed while drafting this plan.
Try the following in order:
1. Render with Playwright (headless Chromium), extract the list table and any linked PDF/Excel attachments.
2. Download the official PDF of the approved lists if one is linked, and parse it with `pdfplumber`.
3. **ASK** the user to save the page (Ctrl+S, "Webpage, complete") or the PDF into `data/raw/`.

Output: `data/parties/k25.json` and `data/parties/k26.json`, one entry per list:
`{ letters, official_name, short_name, leader, status: "approved" | "disqualified" | "pending" }`.

Cross-check seed (secondary source, Knesset Channel, 27.9.2026; **not official**, use only to validate the scrape).
These are the 38 submitted lists:
`רק` ביחד בראשות נפתלי בנט · `דרך` בראשות גדי איזנקוט · `צדק` · `ד` השותפות לכולם · `צף` הפיראטים · `ך` עמך ישראל בראשות עופר וינטר ·
`י` ישראל תחילה · `ה` גן עדן · `קה` קול הנשים · `בד` ביחד נצליח · `ל` ישראל ביתנו · `קץ` משפט צדק · `נף` שמע · `ב` עוצמה יהודית ·
`קך` סדר חדש · `די` המילואימניקים והכלכלית · `אמת` הדמוקרטים · `עם` רע"ם · `שס` · `זך` הציבור החרדי · `פה` אני ואתה · `זץ` ברית עולם ·
`נקי` התיקון לשיטת הבחירות · `יק` גה"ת · `ז` בטח · `בקר` אורות השחר · `נץ` ביטחון אישי · `נר` צבע שחור · `מחל` הליכוד ·
`כן` כחול לבן · `ט` הציונות הדתית וזהות · `צבי` תנועת אחי · `בי` צומת · `ק` תקומה · `ודם` הרשימה המשותפת · `רץ` הקהל · `ג` יהדות התורה · `ני` נעם.

At that date, `ודם` was pending a Supreme Court ruling. **Re-check the final approved list status on gov.il.**
Note that `ד` in 2026 is a different party from Balad, which held `ד` in 2022.

### 3.2 Geography
| Layer | Source (verify) | Use |
|---|---|---|
| Statistical areas (אזורים סטטיסטיים), with locality code | CBS geo layers: https://www.cbs.gov.il/he/Pages/geo-layers.aspx (2011 SA layer with 2020 data, `.gdb` in ZIP). Also check whether a 2022-census SA layer has been published since. | Neighborhood polygons. Dissolve by locality code to get built-up locality polygons. |
| Municipal jurisdiction boundaries (גבולות שיפוט) | data.gov.il (Ministry of Interior) or GovMap export | Municipality layer, including the open land of regional councils |
| CBS locality list (רשימת יישובים) | data.gov.il / CBS | Hebrew display names, locality → municipality/regional council, ITM coordinates for point fallback |

All Israeli government layers use ITM (**EPSG:2039**). Reproject to **EPSG:4326** for the web.
Simplify with mapshaper, aiming for under 3 MB per layer gzipped.

### 3.3 Polling-station locations (needed for neighborhoods)
The attached files contain no station addresses. To place stations in neighborhoods:
1. Find the committee's polling-place list for the 25th Knesset (address per `סמל ישוב` + `קלפי`).
   Look on the committee results site for the 25th Knesset, on data.gov.il and in the committee's published files.
2. If found, geocode each address (once per building/`ריכוז`). Use GovMap or the Nominatim API at 1 request/second, and cache results in `data/cache/geocode.json`.
   Then assign each station to a statistical area by point-in-polygon.
3. If no official list can be found, **ASK** the user whether they have one.
   Otherwise ship v1 with neighborhoods disabled (feature-flagged) and keep the pipeline stage in place.

The 2026 stations will be renumbered and partly relocated. **Neighborhood swing must be computed per statistical area**,
by mapping *both* elections' stations into the same areas. Never match station numbers between elections.
For the 2026 station-address file, use the same procedure as soon as the committee publishes it.

Report the geocoding hit rate per city. Show a neighborhood map only for cities above about 90% of votes placed,
and show the unplaced share in the UI.

---

## 4. Party lineage and swing rules

### 4.1 Lineage file: `data/parties/lineage.yaml` (hand-edited, reviewed by the user)
```yaml
- id: likud
  k26: "מחל"
  predecessors: ["מחל"]          # ASK: also count New Hope's share of 2022 "כן"? (see 4.3)
  kind: continuing
- id: together                  # Bennett + Yesh Atid
  k26: "רק"
  predecessors: ["פה"]           # existing + new → compare to the existing party only
  kind: merger_existing_new
- id: democrats                 # Labor + Meretz
  k26: "אמת"
  predecessors: ["אמת", "מרצ"]
  kind: merger_existing_existing
- id: joint_list                # Hadash-Ta'al + Balad
  k26: "ודם"
  predecessors: ["ום", "ד"]
  kind: merger_existing_existing
- id: reservists_economic       # Hendel (new) + New Economic Party (ran in 2022)
  k26: "די"
  predecessors: ["<2022 letter of הכלכלית החדשה — take from k25.json>"]
  kind: merger_existing_new
- id: rzp_zehut
  k26: "ט"
  split_from: "ט"                # 2022 ט = RZP + Otzma + Noam joint list
  kind: split                    # ASK (4.3)
- id: otzma   ; k26: "ב"  ; split_from: "ט" ; kind: split
- id: noam    ; k26: "ני" ; split_from: "ט" ; kind: split
- id: blue_white ; k26: "כן" ; split_from: "כן" ; kind: split   # 2022 כן = National Unity
- id: yashar     ; k26: "דרך" ; kind: new                         # ASK: Eisenkot ran inside National Unity in 2022
- { id: shas, k26: "שס", predecessors: ["שס"], kind: continuing }
- { id: utj,  k26: "ג",  predecessors: ["ג"],  kind: continuing }
- { id: yb,   k26: "ל",  predecessors: ["ל"],  kind: continuing }
- { id: raam, k26: "עם", predecessors: ["עם"], kind: continuing }
- { id: amcha, k26: "ך", kind: new }
# … every other 2026 list: match against k25.json by official name. If a match is found, kind: continuing;
#   otherwise kind: new. Produce a review table (data/parties/lineage_review.md) for the user to approve.
```
The pipeline must fail if any 2026 list is missing from `lineage.yaml`.

### 4.2 Swing computation (identical at every level)
- Share = party votes / `כשרים` of that unit. Swing = share₂₆ − share₂₂, in percentage points.
- `continuing`: compare with the single predecessor.
- `merger_existing_existing`: the headline swing is against the **sum** of both predecessors.
  The tooltip and detail view also show each predecessor's 2022 share separately. For example:
  "אמת 3.7% + מרצ 3.2% = 6.9% → 8.1% (‎+1.2)". (**ASK**: confirm this is what "swing in relation to both" means.)
- `merger_existing_new`: compare with the existing predecessor only. Label it "כולל רשימה חדשה".
- `new`: show the badge "חדשה" and no swing number.
- 2022 lists with no 2026 successor (e.g. 2022 `ב`, the Jewish Home): list them under "לא התמודדו הפעם" with their 2022 share, so the shares add up.
- **National level:** include external envelopes. **Local levels:** the locality's own votes only.
- Units where a party got 0 in 2022 and >0 in 2026 still show a pp swing (from 0). Do not show ratios.
- Small-sample guard: flag units with fewer than 100 valid votes in either election as "מדגם קטן".

### 4.3 Open lineage cases (ASK before Phase 3)
1. **Splits:** the 2022 Religious Zionism list (`ט`) is now three lists: `ט`, `ב` and `ני`.
   2022 National Unity (`כן`) is now `כן`, `דרך` and the New Hope part of `מחל`.
   Default proposal: show swing for the *family* (the sum of the successors vs the 2022 joint list) and mark each successor "פוצלה מ…" without its own swing.
2. **Likud + New Hope:** compare with `מחל` only (default), or with `מחל` plus an estimated New Hope share? A share estimate cannot be derived from the data, so the default is `מחל` only.
3. **Yashar (Eisenkot):** "חדשה" (default) or "split from כן"?

### 4.4 Blocs: `data/parties/blocs.yaml` (ASK to confirm)
Default proposal:
- **גוש הקואליציה:** 2022: מחל, ט, שס, ג. 2026: מחל, ט, ב, ני, שס, ג.
- **גוש האופוזיציה:** 2022: פה, כן, ל, אמת, מרצ. 2026: רק, כן, ל, אמת, דרך, די.
- **מפלגות ערביות:** 2022: עם, ום, ד. 2026: עם, ודם.
- **אחרות:** everything else (including 2022 `ב`).

Bloc swing = bloc share₂₆ − bloc share₂₂ at every level. Show it with the same UI component as party swing.

---

## 5. Seat allocation
Implement the Israeli method: a 3.25% threshold, then Bader-Ofer (D'Hondt) with surplus-vote agreements (הסכמי עודפים).
- `data/parties/surplus_k25.yaml` and `surplus_k26.yaml`. The 2026 agreements are published by the committee. **ASK** if they cannot be found.
- Regression test: 2022 must yield מחל 32, פה 24, ט 14, כן 12, שס 11, ג 7, ל 6, עם 5, ום 5, אמת 4. Every other list gets 0.

---

## 6. Data model (pipeline output in `site/public/data/`)
```
meta.json                      # elections, status ("final" | "partial" | "not_published"), % counted, timestamps
parties.json                   # merged k25/k26 party info + lineage + colors + blocs
results/k25/national.json
results/k25/municipalities.json   # keyed by municipality id
results/k25/localities.json       # keyed by סמל ישוב
results/k25/areas.json            # keyed by stat-area id (only if §3.3 succeeded)
results/k26/…                     # same shape; absent or partial before/during election night
swing/{level}.json                # precomputed swing per unit, per party and per bloc
geo/municipalities.topojson
geo/localities.topojson
geo/areas.topojson
geo/points.json                   # Bedouin tribes and anything without a polygon
```
Store each unit as: `{ id, name, eligible, voters, invalid, valid, turnout, votes: {letter: n}, winner, winner_share, margin }`.

Municipality aggregation: cities and local councils map 1:1 to localities.
**Regional councils = sum of their member localities** (from the CBS locality list).
Small localities inside a regional council are shown as their own polygons or points when zoomed in.

---

## 7. Front end (Hebrew, RTL)

### Layout
- Header: "תוצאות הבחירות לכנסת ה-26 בהשוואה לכנסת ה-25". Election selector: כנסת 25 / כנסת 26 / השוואה (swing). Status chip: "סופי" / "נספרו X% מהקולות" / "טרם פורסמו תוצאות".
- Main: the map takes about 60% of the width on desktop and the full width on mobile. A side panel sits on the inline-start side (the right side in RTL).
- National summary at the top of the panel: seat chart (half-circle), party bars with swing arrows, and bloc totals with swing.

### Map
- Zoom levels: national view shows municipalities; zooming in shows localities; zooming further into a city shows statistical areas (when available).
- Color modes (toggle):
  1. **Largest party:** the party color, with opacity scaled by winner share (light ≤30%, solid ≥60%).
  2. **Swing for party X:** a diverging scale (red ↔ neutral ↔ green, colorblind-safe) in pp, capped at ±20.
  3. **Bloc swing:** the same diverging scale.
  4. **Turnout** (optional).
- Hover: tooltip with the name, winner, top 3 parties and their swing. Click: the side panel shows the unit's full table and breadcrumbs (ארצי ← מועצה ← יישוב ← שכונה).
- The legend always shows the scale. Units without data are hatched grey and labeled "אין נתונים".
- Search box: find a locality by Hebrew name (normalize final letters and hyphens/spaces).

### Party presentation
- Each party is shown as a **ballot chip**: a white card with the letters large and the official name below, imitating the paper ballot (פתק).
- Badges: "חדשה", "איחוד של אמת + מרצ", "פוצלה מ־ט".
- Colors live in `data/parties/colors.yaml`, with defaults close to each party's own campaign color. Check that neighboring big parties on the map are distinguishable.
  Run a contrast check (WCAG AA for text on chips). **ASK** if the user wants to supply colors.

### Accessibility and quality
- Every map interaction has a table alternative ("הצג כטבלה") listing all units, sortable.
- Keyboard focus works for the selector, search and table.
- Performance: first load under 2 MB (lazy-load stat-area geometry per city).
- No English text in the UI. Code and comments may be in English.

---

## 8. Election-night readiness (the 26th Knesset)
- `scripts/ingest.py --election 26 --locality expc.csv --stations expb.csv` runs the full pipeline. It must be idempotent and finish in under 2 minutes.
- Validate on ingest: unknown ballot letters (fail loudly), missing localities, and sums (station → locality → national).
- Partial results: show the counted share and the timestamp. Swing is computed only on counted units, and the UI says so.
- Committee column names for 2026 may differ. Map them in `data/parties/k26_columns.yaml` rather than in code.
- Generate a **synthetic 2026 dataset** (`scripts/mock_k26.py`) that perturbs the 2022 results under the 2026 letters. Use it to build and test the UI before real data exists.
  The mock must never be deployed. Gate it behind `MOCK=1` and show a visible "נתוני דמה" banner.
- Optional: a GitHub Action that runs the ingest when new CSVs are committed to `data/raw/k26/`, then rebuilds and deploys.

---

## 9. Repository layout
```
/data/raw/k25/expc.csv, expb.csv          # attached files (do not modify)
/data/raw/k26/                            # empty until election night
/data/raw/geo/                            # downloaded layers (gitignored if large; document download script)
/data/parties/{k25,k26}.json, lineage.yaml, blocs.yaml, colors.yaml, surplus_k25.yaml, surplus_k26.yaml
/data/cache/                              # geocoding cache
/pipeline/  load.py  geo.py  stations.py  aggregate.py  swing.py  seats.py  export.py
/scripts/   fetch_parties.py  fetch_geo.py  ingest.py  mock_k26.py
/tests/     test_totals.py  test_swing.py  test_seats.py  test_lineage.py
/site/      (Vite app) src/{components,map,lib,i18n}/  public/data/
CLAUDE.md                                 # short project rules: join on סמל ישוב, letters ≠ identity, Hebrew-only UI
```

---

## 10. Phases (each ends with checks and a commit)

**Phase 1: Scaffold and load the 2022 data**
- Set up the repo, Python environment and Vite app. Copy the CSVs to `data/raw/k25/`. Write `CLAUDE.md`.
- `load.py`: read with `encoding="utf-8-sig"`, typed columns. Party columns are everything after `כשרים`.
- ✅ Tests: the national totals and shares in §1 match. Station sums equal locality sums.

**Phase 2: Official party data**
- `fetch_parties.py` per §3.1, producing `k25.json` and `k26.json`. Cross-check k26 against the seed list. Cross-check k25 letters against the CSV columns (all 40 must resolve).
- ✅ Every CSV letter column has an official name. The user reviews the name table.

**Phase 3: Lineage and blocs** (blocked on the §4.3 and §4.4 answers)
- Write `lineage.yaml`, `blocs.yaml` and `lineage_review.md`. Implement `swing.py` with unit tests for each `kind`.
- ✅ Tests for continuing, merger (2+2), merger (existing+new), new, split and "did not run".

**Phase 4: Geography**
- `fetch_geo.py`: download, reproject and simplify the layers. Join localities on `סמל ישוב`. Report unmatched codes in both directions.
- ✅ At least 99% of valid votes (excluding external envelopes) land on a polygon or point. The list of unmatched items is reviewed.

**Phase 5: Neighborhoods (polling stations)**
- Per §3.3. Produce `areas.json` and a hit-rate report.
- ✅ For Tel Aviv, Jerusalem and Haifa, at least 90% of votes are placed. Otherwise flag and **ASK**.

**Phase 6: Seats**
- `seats.py` and the 2022 regression test from §5.

**Phase 7: Front end**
- Map with zoom levels and color modes, side panel, national summary, ballot chips, search and the table view. Hebrew strings in `src/i18n/he.ts`.
- ✅ Playwright smoke test (load, click a city, switch mode). Manual RTL review on desktop and mobile widths.

**Phase 8: 2026 readiness**
- `ingest.py`, `mock_k26.py`, the partial-results UI and the "טרם פורסמו" empty state.
- ✅ Run the mock end-to-end: swing appears at every level and merger/new badges render correctly.

**Phase 9: Deploy**
- Static build and deploy config. Add a README in Hebrew for operating it on election night.

---

## 11. Risks
| Risk | Mitigation |
|---|---|
| gov.il pages are JS-only or bot-protected | Playwright → PDF → ask the user to save the page |
| No 2022 station address file | Ship with neighborhoods feature-flagged off and keep the pipeline stage |
| CBS layer vintage (2011 SAs) vs new localities | Fall back to points from the locality list and report them |
| 2026 file format changes | Column map in YAML, validation on ingest |
| Letter reuse misleading the swing | Lineage file only, test that fails on unmapped lists |
| Disputed lineage choices | All choices in YAML, shown in UI badges, approved by the user |
