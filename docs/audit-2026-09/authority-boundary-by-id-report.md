# Authority Boundaries by known relation ID — Stage A + Stage B Report

Stage A generated 2026-10-02T17:56:21.177Z. Relation IDs from the Nominatim scan (not name search) — no normalization logic runs in this path.

PASS: 1 · FLAG: 26 · FAIL: 0 · RETRY: 0 · total 27

## Containment check — the write gate for this batch (02.10.2026)

David's explicit spec: area is a proxy, containment is the real thing. For each of the 27, checked whether the fetched polygon contains the point Nominatim returned when it originally resolved that name to this relation ID — reusing `isPointInPolygon` (`src/lib/route-collections/authority-resolution.ts`, `@turf/boolean-point-in-polygon`, has its own regression test) rather than a new implementation. Caught and fixed a real bug in my own check before trusting it: passed an already-parsed object to `parseBoundaryGeoJSON`, which expects the raw JSON string and correctly rejected it — all 27 came back "INCONCLUSIVE" on the first pass; fixed the double-parse, re-ran clean.

**Result: 27/27 CONTAINS.** Including both regional councils that looked suspicious against the (city-calibrated) area floor — אל-בטוף and בוסתן אל-מרג' both pass containment cleanly, confirming David's read: small Arab regional councils of a few villages, not a wrong floor masking a wrong match.

## Stage B — executed, all 27 written

`npx tsx scripts/backfill-authority-boundaries-by-id.ts --apply` — gate changed from FLAG-approval-by-id to containment: `CONTAINS` → write regardless of name/area FLAG reasons; anything else → never write. No entry needed the fallback (0 skipped for failed containment).

**Written: 27 of 27. Authorities now carrying a boundary: 241.**

🔴 **Count discrepancy, flagged not silently resolved:** the task stated a target of "215 → 242." My own tracked running total going into this batch was **214**, not 215 — 214 + 27 = **241**, which matches Stage B's own live count exactly (independently re-confirmed via a fresh `authorities` collection scan after the write, not just the script's internal counter). The 215/242 figures don't reconcile with any number I can independently verify. Not chasing this further without direction — flagging it plainly rather than quietly adopting either number.

**Live verification (field count + `parseBoundaryGeoJSON` round-trip, 3 selected):**

| | fields before (Stage A snapshot) | fields now | delta | parses as |
|---|---|---|---|---|
| ירושלים | 19 | 20 | +1 | MultiPolygon ✅ |
| אל-בטוף | 18 | 19 | +1 | MultiPolygon ✅ |
| סח'נין | 18 | 19 | +1 | Polygon ✅ |

Delta is exactly +1 for all three — only `boundaryGeoJSON` is a genuinely new field; `updatedAt` already existed on every doc, so its value changing doesn't add a field. Additive, single-field merge confirmed empirically, not just by code reading this time.

| שם רשות | סוג | relation id | שדות לפני | שם ב-OSM | התאמת שם | גאומטריה | שטח קמ"ר | טבעות | verdict | תוצאת בדיקת הכלה | reasons |
|---|---|---|---|---|---|---|---|---|---|---|---|
| אל קסום | regional_council | 10052487 | 18 | מועצה אזורית אל-קסום | 🔴 MISMATCH | MultiPolygon | 38.8 | 5 | FLAG | ✅ CONTAINS | OSM name "מועצה אזורית אל-קסום" != our label "אל קסום" |
| אל-בטוף | regional_council | 1386838 | 18 | מועצה אזורית אל בטוף | 🔴 MISMATCH | MultiPolygon | 4.2 | 2 | FLAG | ✅ CONTAINS | area 4.2km² < 20km² for regional_council; OSM name "מועצה אזורית אל בטוף" != our label "אל-בטוף" |
| באקה אל-גרביה | city | 1398019 | 18 | באקה אל-גרבייה | 🔴 MISMATCH | Polygon | 9.7 | 1 | FLAG | ✅ CONTAINS | OSM name "באקה אל-גרבייה" != our label "באקה אל-גרביה" |
| בוסתן אל-מרג' | regional_council | 1380227 | 18 | מועצה אזורית בוסתן-אל-מרג' | 🔴 MISMATCH | MultiPolygon | 9.0 | 3 | FLAG | ✅ CONTAINS | area 9.0km² < 20km² for regional_council; OSM name "מועצה אזורית בוסתן-אל-מרג'" != our label "בוסתן אל-מרג'" |
| ביר אל-מכסור | local_council | 1386839 | 19 | ביר אל מכסור | 🔴 MISMATCH | Polygon | 5.9 | 1 | FLAG | ✅ CONTAINS | OSM name "ביר אל מכסור" != our label "ביר אל-מכסור" |
| בית אריה-עופרים | local_council | 11993994 | 18 | בית אריה - עופרים | 🔴 MISMATCH | MultiPolygon | 7.8 | 10 | FLAG | ✅ CONTAINS | OSM name "בית אריה - עופרים" != our label "בית אריה-עופרים" |
| בנימינה-גבעת עדה | local_council | 1392847 | 19 | בנימינה - גבעת עדה | 🔴 MISMATCH | Polygon | 24.5 | 1 | FLAG | ✅ CONTAINS | OSM name "בנימינה - גבעת עדה" != our label "בנימינה-גבעת עדה" |
| דאלית אל-כרמל | local_council | 1403095 | 19 | דלית אל-כרמל | 🔴 MISMATCH | Polygon | 12.8 | 1 | FLAG | ✅ CONTAINS | OSM name "דלית אל-כרמל" != our label "דאלית אל-כרמל" |
| טובא-זנגרייה | local_council | 1379262 | 18 | טובא זנגריה | 🔴 MISMATCH | Polygon | 3.6 | 1 | FLAG | ✅ CONTAINS | OSM name "טובא זנגריה" != our label "טובא-זנגרייה" |
| יאנוח-ג'ת | local_council | 1401793 | 18 | יאנוח - ג'ת | 🔴 MISMATCH | Polygon | 13.6 | 1 | FLAG | ✅ CONTAINS | OSM name "יאנוח - ג'ת" != our label "יאנוח-ג'ת" |
| יהוד-מונוסון | city | 1382466 | 18 | יהוד מונוסון | 🔴 MISMATCH | Polygon | 6.5 | 1 | FLAG | ✅ CONTAINS | OSM name "יהוד מונוסון" != our label "יהוד-מונוסון" |
| כאוכב אבו אל-היג'א | local_council | 1386843 | 18 | כווכב אבו אל-היג'א | 🔴 MISMATCH | Polygon | 2.7 | 1 | FLAG | ✅ CONTAINS | OSM name "כווכב אבו אל-היג'א" != our label "כאוכב אבו אל-היג'א" |
| כסיפה | local_council | 1376911 | 19 | כסייפה | 🔴 MISMATCH | Polygon | 13.6 | 1 | FLAG | ✅ CONTAINS | OSM name "כסייפה" != our label "כסיפה" |
| כעביה-טבאש-חג'אג'רה | local_council | 1933846 | 19 | כעביה טבאש חג'אג'רה | 🔴 MISMATCH | MultiPolygon | 1.9 | 2 | FLAG | ✅ CONTAINS | OSM name "כעביה טבאש חג'אג'רה" != our label "כעביה-טבאש-חג'אג'רה" |
| מג'ד אל-כרום | local_council | 1387992 | 19 | מג'ד אל כרום | 🔴 MISMATCH | Polygon | 9.5 | 1 | FLAG | ✅ CONTAINS | OSM name "מג'ד אל כרום" != our label "מג'ד אל-כרום" |
| מג'דל שמס | local_council | 1375242 | 19 | מג'דל א-שמס | 🔴 MISMATCH | Polygon | 15.9 | 1 | FLAG | ✅ CONTAINS | OSM name "מג'דל א-שמס" != our label "מג'דל שמס" |
| מגאר | city | 1387400 | 19 | מר'אר | 🔴 MISMATCH | MultiPolygon | 21.2 | 2 | FLAG | ✅ CONTAINS | OSM name "מר'אר" != our label "מגאר" |
| מעלות-תרשיחא | city | 1404529 | 19 | מעלות תרשיחא | 🔴 MISMATCH | MultiPolygon | 9.3 | 2 | FLAG | ✅ CONTAINS | OSM name "מעלות תרשיחא" != our label "מעלות-תרשיחא" |
| סאג'ור | local_council | 1388015 | 19 | סג'ור | 🔴 MISMATCH | Polygon | 3.6 | 1 | FLAG | ✅ CONTAINS | OSM name "סג'ור" != our label "סאג'ור" |
| סח'נין | city | 1392988 | 18 | סכנין | 🔴 MISMATCH | Polygon | 11.2 | 1 | FLAG | ✅ CONTAINS | OSM name "סכנין" != our label "סח'נין" |
| עספיא | local_council | 1403485 | 19 | עוספייא | 🔴 MISMATCH | Polygon | 11.1 | 1 | FLAG | ✅ CONTAINS | OSM name "עוספייא" != our label "עספיא" |
| ערערה-בנגב | local_council | 1376931 | 18 | ערערה בנגב | 🔴 MISMATCH | Polygon | 14.1 | 1 | FLAG | ✅ CONTAINS | OSM name "ערערה בנגב" != our label "ערערה-בנגב" |
| פרדס חנה-כרכור | local_council | 1392849 | 16 | פרדס חנה - כרכור | 🔴 MISMATCH | Polygon | 22.9 | 1 | FLAG | ✅ CONTAINS | OSM name "פרדס חנה - כרכור" != our label "פרדס חנה-כרכור" |
| קדימה-צורן | local_council | 1395617 | 16 | קדימה - צורן | 🔴 MISMATCH | Polygon | 10.9 | 1 | FLAG | ✅ CONTAINS | OSM name "קדימה - צורן" != our label "קדימה-צורן" |
| שגב-שלום | local_council | 1377266 | 18 | שגב שלום | 🔴 MISMATCH | Polygon | 13.6 | 1 | FLAG | ✅ CONTAINS | OSM name "שגב שלום" != our label "שגב-שלום" |
| שוהם | local_council | 1406086 | 16 | שהם | 🔴 MISMATCH | MultiPolygon | 7.2 | 2 | FLAG | ✅ CONTAINS | OSM name "שהם" != our label "שוהם" |
| ירושלים | city | 1381350 | 19 | ירושלים | ok | MultiPolygon | 126.1 | 4 | PASS | ✅ CONTAINS |  |
