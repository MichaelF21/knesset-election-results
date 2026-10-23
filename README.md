<div dir="rtl" lang="he">

# תוצאות הבחירות לכנסת — 25 ← 26

אתר סטטי בעברית שמציג את תוצאות הבחירות לכנסת ה-25 (1.11.2022), ומוכן לקלוט את תוצאות הכנסת ה-26 (27.10.2026) — גם חלקיות, תוך כדי ספירה.
המפה צובעת רשויות, יישובים ושכונות לפי המפלגה המובילה, לפי תנודה (בנקודות אחוז) למפלגה או לגוש, או לפי אחוז הצבעה.

- התוכנית המלאה: `PLAN.md` · כללי הפרויקט: `CLAUDE.md`
- שושלת הרשימות (מי ממשיכה את מי): `data/parties/lineage.yaml` — טבלת סקירה ב-`data/parties/lineage_review.md`
- כיסוי גאוגרפי: `data/geo/geo_report.md`

## מדריך לליל הבחירות

### לפני הערב (פעם אחת)

</div>

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
cd site && npm ci
```

<div dir="rtl" lang="he">

בדיקה שהכול תקין (כל הבדיקות צריכות לעבור):

</div>

```bash
.venv/Scripts/python -m pytest -q
```

```bash
cd site && npm test && npm run e2e
```

<div dir="rtl" lang="he">

### 1. משיכת הקבצים מוועדת הבחירות

הוועדה מפרסמת שני קבצים: `expc.csv` (לפי יישובים) ו-`expb.csv` (לפי קלפיות).
ב-2022 הם פורסמו בכתובת `media25.bechirot.gov.il/files/`. ב-2026 צפויה הכתובת `media26.bechirot.gov.il/files/` — **הכתובת לא אומתה**; בדקו באתר הוועדה ותקנו עם `--url-base` אם צריך.

אפשרות א — הורדה אוטומטית ועיבוד:

</div>

```bash
.venv/Scripts/python scripts/ingest.py --election 26 --download --partial
```

<div dir="rtl" lang="he">

אפשרות ב — שמירה ידנית של שני הקבצים בתיקייה `data/raw/k26/`, ואז:

</div>

```bash
.venv/Scripts/python scripts/ingest.py --election 26 --partial
```

<div dir="rtl" lang="he">

העיבוד לוקח פחות משנייה, ואפשר להריץ אותו שוב ושוב (התוצאה זהה לאותו קלט).
הוא כותב את `site/public/data/`, מחשב מנדטים (אחוז חסימה 3.25%, בדר-עופר עם הסכמי עודפים) ומושך את תוצאות השכונות מ-GovMap אם פורסמו.

### 2. בדיקה מקומית

</div>

```bash
cd site && npx vite
```

<div dir="rtl" lang="he">

בדקו: תווית "נספרו X% מהקולות", מנדטים, תנודה ברמה הארצית וביישוב לדוגמה.

### 3. פרסום

- **GitHub Pages (מומלץ):** דחפו ל-`main` את הקבצים ב-`data/raw/k26/`. ה-Action ‏`ingest.yml` מריץ את העיבוד, את הבדיקות, שומר את התוצאות ומפרסם. אפשר גם להריץ אותו ידנית מלשונית Actions (עם הורדה אוטומטית).
- **Netlify / Cloudflare Pages:** תיקיית בסיס `site`, פקודת בנייה `npm run build`, תיקיית פרסום `dist` (ראו `netlify.toml`). דחפו את `site/public/data` אחרי העיבוד.

### 4. תוצאות סופיות

כשהוועדה מכריזה על תוצאות סופיות:

</div>

```bash
.venv/Scripts/python scripts/ingest.py --election 26 --final
```

<div dir="rtl" lang="he">

או ב-GitHub: צרו קובץ ריק `data/raw/k26/FINAL` ודחפו.

## כשמשהו נכשל

| הודעה | מה לעשות |
|---|---|
| `unknown ballot letters` | בקובץ יש עמודת אותיות שאינה ברשימה הרשמית. אם הוועדה שינתה שם עמודה — מפו אותו ב-`data/parties/k26_columns.yaml`. אם נוספה רשימה — עדכנו את `data/parties/k26.json` ואת `lineage.yaml`. |
| `missing column` | שם עמודה בסיסית השתנה (למשל `סמל ישוב`). מפו ב-`k26_columns.yaml`. |
| `station sums differ` | סכומי הקלפיות לא מסתכמים לקובץ היישובים — כנראה הקבצים נמשכו ברגעים שונים. משכו שוב את שניהם. |
| `lineage.yaml invalid` | כל רשימה של 2026 חייבת להופיע בשושלת. הוסיפו אותה (בדרך כלל `kind: new`). |
| `GovMap neighborhood fetch failed` | אזהרה בלבד: האתר יעבוד בלי שכונות 2026. נסו שוב מאוחר יותר. |
| `N localities not in the CBS list` | אזהרה: יישוב חדש שאין לו צורה במפה. הוא יופיע בטבלה ובחיפוש, לא במפה. |

## נתוני דמה (לפיתוח בלבד)

`scripts/mock_k26.py` מייצר תוצאות 2026 מדומות מתוך תוצאות 2022 תחת אותיות 2026, כדי לבנות ולבדוק את הממשק לפני ליל הבחירות.

</div>

```bash
MOCK=1 .venv/Scripts/python scripts/mock_k26.py --counted 40
```

```bash
cd site && MOCK=1 npx vite
```

<div dir="rtl" lang="he">

נתוני הדמה נכתבים ל-`site/mock-data/` (לא נשמרים ב-git), מוגשים רק על ידי שרת הפיתוח, ומוצג באנר "נתוני דמה". בנייה עם `MOCK=1` נחסמת, וה-Action של הפרסום נכשל אם נתוני דמה הגיעו לבנייה.

## מקורות

- תוצאות, שמות רשימות ואותיות: ועדת הבחירות המרכזית (gov.il, votes25.bechirot.gov.il). עמוד רשימות 2026 נשמר ב-`data/raw/parties/` כי gov.il חוסם דפדפן אוטומטי.
- יישובים ואזורים סטטיסטיים: הלשכה המרכזית לסטטיסטיקה (data.gov.il, cbs.gov.il) — הורדה עם `scripts/fetch_geo.py`.
- גבולות שיפוט: GovMap, שכבת `opendata:muni_il`.
- שכונות ותוצאות לפי שכונה: אתר הבחירות של GovMap (elections.govmap.gov.il), שכבת שכונות קבועה לכל מערכות הבחירות.

## מבנה

</div>

```
data/raw/k25/        קבצי הוועדה 2022 (לא לשנות)
data/raw/k26/        קבצי 2026 (ריק עד ליל הבחירות)
data/parties/        רשימות, שושלת, גושים, צבעים, הסכמי עודפים
data/geo/            טבלת יישובים, תיקונים ידניים, דוח כיסוי
pipeline/            load, geo, stations, aggregate, swing, seats, export
scripts/             fetch_parties, fetch_geo, ingest, mock_k26, neighbor_pairs
tests/               pytest
site/                Vite + React + MapLibre; מחרוזות ב-src/i18n/he.ts
```
