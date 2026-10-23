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

### חזרה גנרלית (לפני ליל הבחירות)

מריצה את כל השרשרת חוץ מהפרסום ל-GitHub: שרת "ועדה" מקומי מפרסם תוצאות דמה בשלבים (10%, 40%, 85%, סופי), הלולאה החיה קולטת אותן, ודפדפן פתוח צריך להתעדכן לבד. בסוף מודפס PASS/FAIL לכל בדיקה.

</div>

```bash
.venv/Scripts/python scripts/rehearse.py
```

<div dir="rtl" lang="he">

### 1. בליל הבחירות: הלולאה החיה

מ-22:00 (סגירת הקלפיות), במחשב שיש לו הרשאת דחיפה ל-GitHub, בענף `main` ובלי שינויים פתוחים:

</div>

```bash
.venv/Scripts/python scripts/live.py
```

<div dir="rtl" lang="he">

כל 2 דקות הסקריפט מוריד את `expc.csv` ו-`expb.csv` מהוועדה ואת תוצאות השכונות מ-GovMap. כשמשהו השתנה הוא מעבד (כשנייה), בודק שהתוצאה סבירה (קולות כשרים, 120 מנדטים), שומר ודוחף ל-GitHub. האתר מתפרסם מחדש תוך כדקה וחצי, ודפים פתוחים אצל הגולשים מתעדכנים לבד תוך דקה, בלי רענון, עם הודעה "התוצאות עודכנו".
כל עדכון נכנס ל-GitHub כ-commit שמתחיל ב-`Live update`, עם אחוז הספירה ומנדטים מובילים.

- עד פרסום הקבצים יופיע `committee files not published yet` — זה תקין.
- שגיאה לא עוצרת את הלולאה: היא נרשמת ביומן, והסבב הבא מנסה שוב.
- אחוז "נספרו" נלקח מנתוני GovMap (קלפיות שנספרו מתוך כל הקלפיות) כשהם זמינים, אחרת לפי בעלי זכות הבחירה בקלפיות שנספרו.
- כתובת הקבצים של 2026 (`media26.bechirot.gov.il/files/`) נגזרה מזו של 2022 — השרת קיים, אבל **הקבצים עצמם לא אומתו** עד הערב. אם הכתובת אחרת: `--url-base <כתובת>`.
- רוצים לבדוק בלי לפרסם? `--no-push`, או סבב אחד: `--once --no-push`.

### 2. גיבוי מהטלפון

אם המחשב או החיבור נופלים: ב-GitHub ← Actions ← **Ingest 26th Knesset results** ← Run workflow (ההורדה מסומנת כברירת מחדל). אותו עיבוד רץ בענן ומפרסם. אל תריצו אותו במקביל ללולאה החיה.

### 3. תוצאות סופיות

כשהוועדה מכריזה על תוצאות סופיות, עצרו את הלולאה (Ctrl+C) והריצו פעם אחת:

</div>

```bash
.venv/Scripts/python scripts/live.py --final
```

<div dir="rtl" lang="he">

או ב-GitHub Actions: Run workflow עם `final` מסומן. אחרי שהתוצאות סופיות הדפים מפסיקים לבדוק עדכונים.

### פרסום באחסון אחר

**Netlify / Cloudflare Pages:** תיקיית בסיס `site`, פקודת בנייה `npm run build`, תיקיית פרסום `dist` (ראו `netlify.toml`). הלולאה החיה דוחפת ל-`main`, וכל אחסון שמחובר לריפו יבנה מחדש.

## כשמשהו נכשל

| הודעה | מה לעשות |
|---|---|
| `unknown ballot letters` | בקובץ יש עמודת אותיות שאינה ברשימה הרשמית. אם הוועדה שינתה שם עמודה — מפו אותו ב-`data/parties/k26_columns.yaml`. אם נוספה רשימה — עדכנו את `data/parties/k26.json` ואת `lineage.yaml`. |
| `missing column` | שם עמודה בסיסית השתנה (למשל `סמל ישוב`). מפו ב-`k26_columns.yaml`. |
| `station sums differ` | בתוצאות חלקיות: אזהרה בלבד (הקבצים נמשכו ברגעים שונים; הסבב הבא יתקן). בתוצאות סופיות: שגיאה — משכו שוב את שני הקבצים. |
| `N localities not in the file yet` | אזהרה בתוצאות חלקיות: יישובים שעוד לא נספרו לא מופיעים בקובץ. הם מוצגים כ"טרם נספר". |
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
