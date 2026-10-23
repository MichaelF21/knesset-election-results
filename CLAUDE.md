# Election site — project rules

Static Hebrew (RTL) site for 25th vs 26th Knesset results. Full spec: `PLAN.md`.

- **Join on `סמל ישוב` (CBS locality code), never on names.** CSV locality names are corrupted
  (hyphens dropped, words merged). Display names come from the CBS locality list.
- **Ballot letters are not identities.** Letters are reused across elections (`פה`, `ב`, `ד`…).
  Continuity between 2022 and 2026 comes only from `data/parties/lineage.yaml`. Never infer it from letters.
- `סמל ישוב` 9999 = `מעטפות חיצוניות`: counts nationally, never on the map.
- **Hebrew-only UI.** Every user-visible string lives in `site/src/i18n/he.ts`. Code and comments in English.
- Use CSS logical properties (`margin-inline-start`), not left/right.
- `data/raw/k25/*.csv` are the committee's files: never modify them.
- Mock 2026 data (`scripts/mock_k26.py`) is only built with `MOCK=1` and must never be deployed.
- Commands: `python scripts/ingest.py --election 25` (pipeline), `pytest` (pipeline tests),
  `cd site && npm test` (vitest), `npm run e2e` (Playwright), `npm run build`.
