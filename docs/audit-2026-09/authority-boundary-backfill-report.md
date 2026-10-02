# Authority Boundary Backfill — Stage A Report

Generated 2026-10-01T16:17:20.320Z. Dry-run only — zero Firestore writes.

PASS: 165 · FLAG: 43 · FAIL: 47 · RETRY: 0 · total 255

## Name normalization (01.10-02.10.2026)

David's spec: deterministic transformations only (no fuzzy/Levenshtein/
best-score), applied to generate literal search candidates — never to
loosen the match itself. Still requires exactly one match after
normalization; still FAIL on ambiguity or zero matches. Implemented 4
rules (prefix removal, yod קריית↔קרית, hyphen variants - ־ –, quote
variants '/׳ and "/״) plus searching all 5 requested OSM fields (name,
name:he, name:ar, alt_name, official_name) — up to 12 literal candidates
per authority in the worst case (tested in isolation before the real run:
`גולן`→4, `קריית אונו`→8, `בנימינה-גבעת עדה`→12 — bounded, not
combinatorial explosion, since real names rarely combine every dimension
at once).

**Before → after (fully converged, RETRY: 0, same single-match discipline):**

| | before | after |
|---|---|---|
| FAIL | 89 | **47** |
| FLAG | 1 | **43** |
| PASS | 165 | 165 (unchanged — normalization only widens the search, it doesn't re-touch already-resolved matches) |

**42 flipped from FAIL to FLAG — all auditable, not PASS**, since a
normalization-assisted match by definition differs from our stored label
in some way; the existing area/ring/name-mismatch sanity checks correctly
surface that difference for human review rather than silently accepting
it as a clean PASS. None were promoted to PASS automatically.

### Normalization rule breakdown (PASS + FLAG only)

- **34** matched via `prefix+מועצה אזורית`
- **6** matched via `yod:קריית→קרית`
- **1** matched via `quote:'→׳`
- **1** matched via `yod:קרית→קריית`

| שם רשות | סוג | relation id | שם ב-OSM | normalization rule | שדה OSM | שטח קמ"ר | טבעות | verdict | reasons |
|---|---|---|---|---|---|---|---|---|---|
| wix | city |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| אכסאל | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| אל קסום | regional_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| אל-בטוף | regional_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| באקה אל-גרביה | city |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| בוסתן אל-מרג' | regional_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| בועיינה-נוג'ידאת | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| ביר אל-מכסור | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| בית אריה-עופרים | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| בנימינה-גבעת עדה | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| ג'ולס | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| ג'ש (גוש חלב) | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| דאלית אל-כרמל | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| דבורייה | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| דייר אל-אסד | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| דייר חנא | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| הגלבוע | regional_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| הגליל העליון | regional_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| הגליל התחתון | regional_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| טובא-זנגרייה | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| טירת כרמל | city |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| יאנוח-ג'ת | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| יהוד-מונוסון | city |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| ירושלים | city |  |  |  |  |  |  | FAIL | 2 relations matched the name — ambiguous, not choosing (relation ids+rules: 1381350 via exact/name:he, 6502363 via exact/name) |
| כאוכב אבו אל-היג'א | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| כסיפה | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| כסרא-סמיע | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| כעביה-טבאש-חג'אג'רה | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| מג'ד אל-כרום | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| מג'דל שמס | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| מגאר | city |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| מודיעין עילית | city |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| מועצה אזורית גליל עמקים | regional_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| מעלות-תרשיחא | city |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| סאג'ור | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| סח'נין | city |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| עיילבון | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| עספיא | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| ערערה-בנגב | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| פרדס חנה-כרכור | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| פרדסייה | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| קדימה-צורן | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| רמת הנגב | regional_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| שבלי - אום אל-גנם | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| שגב-שלום | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| שוהם | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| שער שומרון | local_council |  |  |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| אלונה | regional_council | 1392829 | מועצה אזורית אלונה | prefix+מועצה אזורית | name | 27.7 | 1 | FLAG | OSM name "מועצה אזורית אלונה" != our label "אלונה" |
| באר טוביה | regional_council | 1380003 | מועצה אזורית באר טוביה | prefix+מועצה אזורית | name | 127.5 | 3 | FLAG | OSM name "מועצה אזורית באר טוביה" != our label "באר טוביה" |
| בני שמעון | regional_council | 1376824 | מועצה אזורית בני שמעון | prefix+מועצה אזורית | name | 371.4 | 6 | FLAG | OSM name "מועצה אזורית בני שמעון" != our label "בני שמעון" |
| ברנר | regional_council | 1380426 | מועצה אזורית ברנר | prefix+מועצה אזורית | name | 37.0 | 2 | FLAG | OSM name "מועצה אזורית ברנר" != our label "ברנר" |
| ג'סר א-זרקא | local_council | 1392894 | ג׳סר א-זרקא | quote:'→׳ | name:he | 2.1 | 1 | FLAG | OSM name "ג׳סר א-זרקא" != our label "ג'סר א-זרקא" |
| גדרות | regional_council | 1380012 | מועצה אזורית גדרות | prefix+מועצה אזורית | name | 13.8 | 2 | FLAG | area 13.8km² < 20km² for regional_council; OSM name "מועצה אזורית גדרות" != our label "גדרות" |
| גן רווה | regional_council | 1380425 | מועצה אזורית גן רווה | prefix+מועצה אזורית | name | 43.5 | 1 | FLAG | OSM name "מועצה אזורית גן רווה" != our label "גן רווה" |
| הערבה התיכונה | regional_council | 1376929 | מועצה אזורית הערבה התיכונה | prefix+מועצה אזורית | name | 1661.1 | 1 | FLAG | OSM name "מועצה אזורית הערבה התיכונה" != our label "הערבה התיכונה" |
| הר חברון | regional_council | 21424309 | מועצה אזורית הר חברון | prefix+מועצה אזורית | name | 611.6 | 1 | FLAG | OSM name "מועצה אזורית הר חברון" != our label "הר חברון" |
| זבולון | regional_council | 1387455 | מועצה אזורית זבולון | prefix+מועצה אזורית | name | 54.3 | 5 | FLAG | OSM name "מועצה אזורית זבולון" != our label "זבולון" |
| חבל אילות | regional_council | 1377268 | מועצה אזורית חבל אילות | prefix+מועצה אזורית | name | 2633.7 | 6 | FLAG | OSM name "מועצה אזורית חבל אילות" != our label "חבל אילות" |
| חבל יבנה | regional_council | 1380015 | מועצה אזורית חבל יבנה | prefix+מועצה אזורית | name | 36.6 | 2 | FLAG | OSM name "מועצה אזורית חבל יבנה" != our label "חבל יבנה" |
| חוף אשקלון | regional_council | 1473951 | מועצה אזורית חוף אשקלון | prefix+מועצה אזורית | name | 181.4 | 1 | FLAG | OSM name "מועצה אזורית חוף אשקלון" != our label "חוף אשקלון" |
| חוף הכרמל | regional_council | 1391710 | מועצה אזורית חוף הכרמל | prefix+מועצה אזורית | name | 195.7 | 1 | FLAG | OSM name "מועצה אזורית חוף הכרמל" != our label "חוף הכרמל" |
| יואב | regional_council | 1379486 | מועצה אזורית יואב | prefix+מועצה אזורית | name | 198.9 | 4 | FLAG | OSM name "מועצה אזורית יואב" != our label "יואב" |
| לב השרון | regional_council | 1389557 | מועצה אזורית לב השרון | prefix+מועצה אזורית | name | 55.3 | 1 | FLAG | OSM name "מועצה אזורית לב השרון" != our label "לב השרון" |
| לכיש | regional_council | 1379423 | מועצה אזורית לכיש | prefix+מועצה אזורית | name | 378.7 | 2 | FLAG | OSM name "מועצה אזורית לכיש" != our label "לכיש" |
| מבואות החרמון | regional_council | 1377971 | מועצה אזורית מבואות החרמון | prefix+מועצה אזורית | name | 135.0 | 12 | FLAG | OSM name "מועצה אזורית מבואות החרמון" != our label "מבואות החרמון" |
| מגידו | regional_council | 1380229 | מועצה אזורית מגידו | prefix+מועצה אזורית | name | 173.4 | 2 | FLAG | OSM name "מועצה אזורית מגידו" != our label "מגידו" |
| מגילות ים המלח | regional_council | 3118385 | מועצה אזורית מגילות ים המלח | prefix+מועצה אזורית | name | 640.0 | 1 | FLAG | OSM name "מועצה אזורית מגילות ים המלח" != our label "מגילות ים המלח" |
| מזרעה | local_council | 1932154 | מזרעה |  |  | 1.0 | 1 | FLAG | area 1.0km² outside [1, 5000]km² |
| מטה אשר | regional_council | 1387432 | מועצה אזורית מטה אשר | prefix+מועצה אזורית | name | 216.0 | 6 | FLAG | OSM name "מועצה אזורית מטה אשר" != our label "מטה אשר" |
| מנשה | regional_council | 1391828 | מועצה אזורית מנשה | prefix+מועצה אזורית | name | 109.9 | 2 | FLAG | OSM name "מועצה אזורית מנשה" != our label "מנשה" |
| מעלה יוסף | regional_council | 1392186 | מועצה אזורית מעלה יוסף | prefix+מועצה אזורית | name | 93.6 | 6 | FLAG | OSM name "מועצה אזורית מעלה יוסף" != our label "מעלה יוסף" |
| מרום הגליל | regional_council | 1387370 | מועצה אזורית מרום הגליל | prefix+מועצה אזורית | name | 178.6 | 5 | FLAG | OSM name "מועצה אזורית מרום הגליל" != our label "מרום הגליל" |
| מרחבים | regional_council | 1376788 | מועצה אזורית מרחבים | prefix+מועצה אזורית | name | 492.3 | 2 | FLAG | OSM name "מועצה אזורית מרחבים" != our label "מרחבים" |
| נווה מדבר | regional_council | 1376830 | מועצה אזורית נווה מדבר | prefix+מועצה אזורית | name:he | 32.8 | 5 | FLAG | OSM name "מועצה אזורית נווה מדבר" != our label "נווה מדבר" |
| נחל שורק | regional_council | 1380374 | מועצה אזורית נחל שורק | prefix+מועצה אזורית | name | 30.8 | 3 | FLAG | OSM name "מועצה אזורית נחל שורק" != our label "נחל שורק" |
| עמק הירדן | regional_council | 1380231 | מועצה אזורית עמק הירדן | prefix+מועצה אזורית | name | 186.1 | 3 | FLAG | OSM name "מועצה אזורית עמק הירדן" != our label "עמק הירדן" |
| עמק המעיינות | regional_council | 1380254 | מועצה אזורית עמק המעיינות | prefix+מועצה אזורית | name | 246.0 | 2 | FLAG | OSM name "מועצה אזורית עמק המעיינות" != our label "עמק המעיינות" |
| ערבות הירדן | regional_council | 3118426 | מועצה אזורית ערבות הירדן | prefix+מועצה אזורית | name | 76.1 | 23 | FLAG | OSM name "מועצה אזורית ערבות הירדן" != our label "ערבות הירדן" |
| קריית ביאליק | city | 1387456 | קרית ביאליק | yod:קריית→קרית | name | 8.5 | 1 | FLAG | OSM name "קרית ביאליק" != our label "קריית ביאליק" |
| קריית יערים | local_council | 1381559 | קרית יערים | yod:קריית→קרית | name | 0.7 | 3 | FLAG | area 0.7km² outside [1, 5000]km²; OSM name "קרית יערים" != our label "קריית יערים" |
| קריית מוצקין | city | 1387964 | קרית מוצקין | yod:קריית→קרית | name | 3.8 | 2 | FLAG | OSM name "קרית מוצקין" != our label "קריית מוצקין" |
| קריית מלאכי | city | 1380385 | קרית מלאכי | yod:קריית→קרית | name | 4.6 | 2 | FLAG | OSM name "קרית מלאכי" != our label "קריית מלאכי" |
| קריית עקרון | local_council | 1381394 | קרית עקרון | yod:קריית→קרית | name | 2.8 | 1 | FLAG | OSM name "קרית עקרון" != our label "קריית עקרון" |
| קריית שמונה | city | 1378947 | קרית שמונה | yod:קריית→קרית | name | 14.4 | 1 | FLAG | OSM name "קרית שמונה" != our label "קריית שמונה" |
| קרית אונו | city | 1382894 | קריית אונו | yod:קרית→קריית | name | 5.4 | 1 | FLAG | OSM name "קריית אונו" != our label "קרית אונו" |
| שדות דן | regional_council | 1381544 | מועצה אזורית שדות דן | prefix+מועצה אזורית | name | 29.4 | 1 | FLAG | OSM name "מועצה אזורית שדות דן" != our label "שדות דן" |
| שדות נגב | regional_council | 1473953 | מועצה אזורית שדות נגב | prefix+מועצה אזורית | name | 114.2 | 3 | FLAG | OSM name "מועצה אזורית שדות נגב" != our label "שדות נגב" |
| שער הנגב | regional_council | 1473954 | מועצה אזורית שער הנגב | prefix+מועצה אזורית | name | 177.3 | 2 | FLAG | OSM name "מועצה אזורית שער הנגב" != our label "שער הנגב" |
| שפיר | regional_council | 1379484 | מועצה אזורית שפיר | prefix+מועצה אזורית | name | 76.5 | 2 | FLAG | OSM name "מועצה אזורית שפיר" != our label "שפיר" |
| תמר | regional_council | 1376912 | מועצה אזורית תמר | prefix+מועצה אזורית | name | 1496.9 | 2 | FLAG | OSM name "מועצה אזורית תמר" != our label "תמר" |
| אבו גוש | local_council | 1381564 | אבו גוש |  |  | 1.9 | 3 | PASS |  |
| אבו סנאן | local_council | 1399119 | אבו סנאן |  |  | 6.5 | 1 | PASS |  |
| אבן יהודה | local_council | 1395619 | אבן יהודה |  |  | 8.2 | 1 | PASS |  |
| אום אל-פחם | city | 1380228 | אום אל-פחם |  |  | 26.1 | 2 | PASS |  |
| אופקים | city | 1379102 | אופקים |  |  | 16.4 | 1 | PASS |  |
| אור יהודה | city | 1382464 | אור יהודה |  |  | 7.6 | 1 | PASS |  |
| אור עקיבא | city | 1392848 | אור עקיבא |  |  | 5.6 | 2 | PASS |  |
| אורנית | local_council | 2805908 | אורנית |  |  | 2.0 | 5 | PASS |  |
| אזור | local_council | 1382459 | אזור |  |  | 2.4 | 1 | PASS |  |
| אילת | city | 1377284 | אילת |  |  | 102.8 | 5 | PASS |  |
| אליכין | local_council | 1392861 | אליכין |  |  | 1.7 | 1 | PASS |  |
| אלעד | city | 1399133 | אלעד |  |  | 3.5 | 1 | PASS |  |
| אלפי מנשה | local_council | 11993345 | אלפי מנשה |  |  | 4.7 | 8 | PASS |  |
| אלקנה | local_council | 11993416 | אלקנה |  |  | 2.6 | 10 | PASS |  |
| אעבלין | local_council | 1386842 | אעבלין |  |  | 12.1 | 1 | PASS |  |
| אפרת | local_council | 11994042 | אפרת |  |  | 5.9 | 11 | PASS |  |
| אריאל | city | 10011903 | אריאל |  |  | 11.7 | 22 | PASS |  |
| אשדוד | city | 1380013 | אשדוד |  |  | 64.1 | 1 | PASS |  |
| באר יעקב | city | 1381478 | באר יעקב |  |  | 9.5 | 2 | PASS |  |
| באר שבע | city | 1377264 | באר שבע |  |  | 117.8 | 1 | PASS |  |
| בוקעאתא | local_council | 1375243 | בוקעאתא |  |  | 19.6 | 1 | PASS |  |
| בית אל | local_council | 2265371 | בית אל |  |  | 1.6 | 1 | PASS |  |
| בית ג'ן | local_council | 1393026 | בית ג'ן |  |  | 7.2 | 1 | PASS |  |
| בית דגן | local_council | 1382242 | בית דגן |  |  | 1.9 | 1 | PASS |  |
| בית שאן | city | 1380253 | בית שאן |  |  | 11.0 | 1 | PASS |  |
| בית שמש | city | 1379449 | בית שמש |  |  | 38.4 | 3 | PASS |  |
| ביתר עילית | city | 10044900 | ביתר עילית |  |  | 5.1 | 18 | PASS |  |
| בני ברק | city | 1382817 | בני ברק |  |  | 7.4 | 1 | PASS |  |
| בני עי"ש | local_council | 1380017 | בני עי"ש |  |  | 2.0 | 1 | PASS |  |
| בסמ"ה | local_council | 1391826 | בסמ"ה |  |  | 5.6 | 3 | PASS |  |
| בסמת טבעון | local_council | 1399264 | בסמת טבעון |  |  | 3.9 | 1 | PASS |  |
| בענה | local_council | 1387991 | בענה |  |  | 3.5 | 1 | PASS |  |
| בת ים | city | 1382458 | בת ים |  |  | 9.4 | 1 | PASS |  |
| ג'דיידה-מכר | local_council | 1392115 | ג'דיידה-מכר |  |  | 9.1 | 1 | PASS |  |
| ג'לג'וליה | local_council | 1405256 | ג'לג'וליה |  |  | 2.5 | 1 | PASS |  |
| ג'ת | local_council | 10072527 | ג'ת |  |  | 7.5 | 1 | PASS |  |
| גבעת זאב | local_council | 11994230 | גבעת זאב |  |  | 4.8 | 19 | PASS |  |
| גבעת שמואל | city | 1382837 | גבעת שמואל |  |  | 2.6 | 1 | PASS |  |
| גבעתיים | city | 1382923 | גבעתיים |  |  | 3.3 | 1 | PASS |  |
| גדרה | local_council | 1380016 | גדרה |  |  | 11.5 | 1 | PASS |  |
| גן יבנה | local_council | 1380014 | גן יבנה |  |  | 11.5 | 1 | PASS |  |
| גני תקווה | city | 1401193 | גני תקווה |  |  | 2.2 | 1 | PASS |  |
| דימונה | city | 1376826 | דימונה |  |  | 223.9 | 4 | PASS |  |
| הוד השרון | city | 1383629 | הוד השרון |  |  | 19.3 | 1 | PASS |  |
| הר אדר | local_council | 11994403 | הר אדר |  |  | 1.1 | 8 | PASS |  |
| זמר | local_council | 1398018 | זמר |  |  | 8.3 | 1 | PASS |  |
| זרזיר | local_council | 1933845 | זרזיר |  |  | 4.3 | 1 | PASS |  |
| חדרה | city | 1392860 | חדרה |  |  | 42.3 | 2 | PASS |  |
| חולון | city | 1382460 | חולון |  |  | 19.1 | 1 | PASS |  |
| חורה | local_council | 1376829 | חורה |  |  | 8.8 | 1 | PASS |  |
| חורפיש | local_council | 1404543 | חורפיש |  |  | 6.2 | 1 | PASS |  |
| חצור הגלילית | local_council | 1379342 | חצור הגלילית |  |  | 5.5 | 1 | PASS |  |
| חריש | city | 1398023 | חריש |  |  | 9.1 | 1 | PASS |  |
| טבריה | city | 1387273 | טבריה |  |  | 16.2 | 1 | PASS |  |
| טורעאן | local_council | 1386840 | טורעאן |  |  | 12.3 | 1 | PASS |  |
| טייבה | city | 1389571 | טייבה |  |  | 19.1 | 1 | PASS |  |
| טירה | city | 1389567 | טירה |  |  | 12.1 | 1 | PASS |  |
| טמרה | city | 1386851 | טמרה |  |  | 29.9 | 1 | PASS |  |
| יבנאל | local_council | 1387228 | יבנאל |  |  | 31.3 | 1 | PASS |  |
| יבנה | city | 1380415 | יבנה |  |  | 30.0 | 1 | PASS |  |
| יסוד המעלה | local_council | 1379121 | יסוד המעלה |  |  | 11.7 | 1 | PASS |  |
| יפיע | local_council | 1383759 | יפיע |  |  | 5.4 | 1 | PASS |  |
| יקנעם עילית | city | 1391621 | יקנעם עילית |  |  | 9.2 | 2 | PASS |  |
| ירוחם | local_council | 1376764 | ירוחם |  |  | 58.8 | 2 | PASS |  |
| ירכא | local_council | 1392113 | ירכא |  |  | 16.2 | 1 | PASS |  |
| כאבול | local_council | 1386852 | כאבול |  |  | 7.3 | 1 | PASS |  |
| כוכב יאיר | local_council | 1389566 | כוכב יאיר |  |  | 3.1 | 1 | PASS |  |
| כפר ברא | local_council | 1405260 | כפר ברא |  |  | 2.5 | 1 | PASS |  |
| כפר ורדים | local_council | 1406229 | כפר ורדים |  |  | 4.9 | 1 | PASS |  |
| כפר יאסיף | local_council | 1392114 | כפר יאסיף |  |  | 5.7 | 1 | PASS |  |
| כפר יונה | city | 1383392 | כפר יונה |  |  | 11.5 | 1 | PASS |  |
| כפר כמא | local_council | 1383755 | כפר כמא |  |  | 8.9 | 1 | PASS |  |
| כפר כנא | local_council | 1383937 | כפר כנא |  |  | 10.1 | 1 | PASS |  |
| כפר מנדא | local_council | 1386841 | כפר מנדא |  |  | 11.1 | 1 | PASS |  |
| כפר סבא | city | 1383631 | כפר סבא |  |  | 14.9 | 1 | PASS |  |
| כפר קאסם | city | 1405261 | כפר קאסם |  |  | 9.3 | 1 | PASS |  |
| כפר קרע | city | 1391829 | כפר קרע |  |  | 9.1 | 1 | PASS |  |
| כפר שמריהו | local_council | 1383632 | כפר שמריהו |  |  | 2.7 | 1 | PASS |  |
| כפר תבור | local_council | 1383762 | כפר תבור |  |  | 12.4 | 1 | PASS |  |
| כרמיאל | city | 1387990 | כרמיאל |  |  | 22.1 | 1 | PASS |  |
| להבים | local_council | 1379226 | להבים |  |  | 11.2 | 1 | PASS |  |
| לוד | city | 1381532 | לוד |  |  | 14.8 | 1 | PASS |  |
| לקיה | local_council | 1377267 | לקיה |  |  | 6.9 | 1 | PASS |  |
| מבשרת ציון | local_council | 1381348 | מבשרת ציון |  |  | 6.3 | 1 | PASS |  |
| מגדל | local_council | 1387371 | מגדל |  |  | 11.7 | 1 | PASS |  |
| מגדל העמק | city | 1383758 | מגדל העמק |  |  | 9.1 | 1 | PASS |  |
| מגדל תפן | local_council | 1406228 | מגדל תפן |  |  | 2.7 | 1 | PASS |  |
| מודיעין-מכבים-רעות | city | 1381425 | מודיעין-מכבים-רעות |  |  | 48.5 | 1 | PASS |  |
| מועצה אזורית אשכול | regional_council | 1473950 | מועצה אזורית אשכול |  |  | 739.0 | 1 | PASS |  |
| מועצה אזורית גולן | regional_council | 1379176 | מועצה אזורית גולן |  |  | 1090.2 | 3 | PASS |  |
| מועצה אזורית גוש עציון | regional_council | 21424451 | מועצה אזורית גוש עציון |  |  | 633.1 | 1 | PASS |  |
| מועצה אזורית גזר | regional_council | 1381347 | מועצה אזורית גזר |  |  | 119.9 | 2 | PASS |  |
| מועצה אזורית דרום השרון | regional_council | 1382465 | מועצה אזורית דרום השרון |  |  | 94.4 | 4 | PASS |  |
| מועצה אזורית חבל מודיעין | regional_council | 1381426 | מועצה אזורית חבל מודיעין |  |  | 128.4 | 4 | PASS |  |
| מועצה אזורית חוף השרון | regional_council | 1383640 | מועצה אזורית חוף השרון |  |  | 50.0 | 3 | PASS |  |
| מועצה אזורית מטה בנימין | regional_council | 21416353 | מועצה אזורית מטה בנימין |  |  | 917.5 | 1 | PASS |  |
| מועצה אזורית מטה יהודה | regional_council | 1379430 | מועצה אזורית מטה יהודה |  |  | 475.2 | 10 | PASS |  |
| מועצה אזורית משגב | regional_council | 1386844 | מועצה אזורית משגב |  |  | 163.4 | 7 | PASS |  |
| מועצה אזורית עמק חפר | regional_council | 1383390 | מועצה אזורית עמק חפר |  |  | 130.4 | 1 | PASS |  |
| מועצה אזורית עמק יזרעאל | regional_council | 1380233 | מועצה אזורית עמק יזרעאל |  |  | 329.1 | 8 | PASS |  |
| מועצה אזורית שומרון | regional_council | 3118471 | מועצה אזורית שומרון |  |  | 76.4 | 131 | PASS |  |
| מזכרת בתיה | local_council | 1381349 | מזכרת בתיה |  |  | 7.4 | 1 | PASS |  |
| מטולה | local_council | 1378949 | מטולה |  |  | 9.3 | 1 | PASS |  |
| מיתר | local_council | 1376828 | מיתר |  |  | 23.9 | 1 | PASS |  |
| מסעדה | local_council | 1375244 | מסעדה |  |  | 12.0 | 1 | PASS |  |
| מעיליא | local_council | 1932118 | מעיליא |  |  | 2.1 | 1 | PASS |  |
| מעלה אדומים | city | 10044691 | מעלה אדומים |  |  | 46.8 | 11 | PASS |  |
| מעלה אפרים | local_council | 11994847 | מעלה אפרים |  |  | 5.1 | 5 | PASS |  |
| מעלה עירון | local_council | 1380230 | מעלה עירון |  |  | 6.4 | 3 | PASS |  |
| מצפה רמון | local_council | 1376758 | מצפה רמון |  |  | 76.1 | 1 | PASS |  |
| משהד | local_council | 1383935 | משהד |  |  | 7.2 | 1 | PASS |  |
| נאות חובב | local_council | 1376773 | נאות חובב |  |  | 77.1 | 4 | PASS |  |
| נהריה | city | 1932164 | נהריה |  |  | 13.9 | 4 | PASS |  |
| נוף הגליל | city | 1383760 | נוף הגליל |  |  | 33.0 | 5 | PASS |  |
| נחף | local_council | 1388009 | נחף |  |  | 6.1 | 1 | PASS |  |
| נס ציונה | city | 1246731 | נס ציונה |  |  | 15.7 | 2 | PASS |  |
| נצרת | city | 1386836 | נצרת |  |  | 14.2 | 2 | PASS |  |
| נשר | city | 1387889 | נשר |  |  | 13.0 | 1 | PASS |  |
| נתיבות | city | 1379103 | נתיבות |  |  | 16.3 | 3 | PASS |  |
| נתניה | city | 1383391 | נתניה |  |  | 35.4 | 1 | PASS |  |
| סביון | local_council | 1932371 | סביון |  |  | 3.7 | 2 | PASS |  |
| ע'ג'ר | local_council | 1377972 | ע'ג'ר |  |  | 2.6 | 1 | PASS |  |
| עומר | local_council | 1376825 | עומר |  |  | 18.3 | 1 | PASS |  |
| עילוט | local_council | 1386835 | עילוט |  |  | 3.1 | 1 | PASS |  |
| עין מאהל | local_council | 1383934 | עין מאהל |  |  | 5.2 | 1 | PASS |  |
| עין קנייא | local_council | 1375245 | עין קנייא |  |  | 5.4 | 1 | PASS |  |
| עכו | city | 1387962 | עכו |  |  | 18.2 | 1 | PASS |  |
| עמנואל | local_council | 11992970 | עמנואל |  |  | 3.4 | 1 | PASS |  |
| עפולה | city | 1380226 | עפולה |  |  | 29.7 | 2 | PASS |  |
| עראבה | city | 1392179 | עראבה |  |  | 9.7 | 1 | PASS |  |
| ערד | city | 1376910 | ערד |  |  | 126.2 | 2 | PASS |  |
| ערערה | local_council | 1391830 | ערערה |  |  | 10.8 | 1 | PASS |  |
| פוריידיס | local_council | 1391709 | פוריידיס |  |  | 4.1 | 1 | PASS |  |
| פסוטה | local_council | 1404516 | פסוטה |  |  | 11.1 | 1 | PASS |  |
| פקיעין (בוקייעה) | local_council | 1933868 | פקיעין (בוקייעה) |  |  | 5.7 | 1 | PASS |  |
| פתח תקווה | city | 1382816 | פתח תקווה |  |  | 36.0 | 1 | PASS |  |
| צור הדסה | local_council | 15979563 | צור הדסה |  |  | 4.0 | 1 | PASS |  |
| צפת | city | 1379335 | צפת |  |  | 30.0 | 1 | PASS |  |
| קדומים | local_council | 11993360 | קדומים |  |  | 3.3 | 11 | PASS |  |
| קלנסווה | city | 1395618 | קלנסווה |  |  | 8.4 | 1 | PASS |  |
| קצרין | local_council | 1379175 | קצרין |  |  | 10.9 | 1 | PASS |  |
| קריית ארבע | local_council | 11994828 | קריית ארבע |  |  | 4.0 | 45 | PASS |  |
| קריית טבעון | local_council | 1401800 | קריית טבעון |  |  | 9.3 | 1 | PASS |  |
| קרית אתא | city | 1387454 | קרית אתא |  |  | 24.2 | 2 | PASS |  |
| קרית גת | city | 1379485 | קרית גת |  |  | 22.5 | 2 | PASS |  |
| קרית ים | city | 1387931 | קרית ים |  |  | 12.8 | 1 | PASS |  |
| קרני שומרון | local_council | 11992956 | קרני שומרון |  |  | 9.9 | 28 | PASS |  |
| ראמה | local_council | 1392964 | ראמה |  |  | 6.5 | 1 | PASS |  |
| ראש העין | city | 1401781 | ראש העין |  |  | 15.9 | 1 | PASS |  |
| ראש פינה | local_council | 1379241 | ראש פינה |  |  | 16.8 | 4 | PASS |  |
| ראשון לציון | city | 1382177 | ראשון לציון |  |  | 62.1 | 2 | PASS |  |
| רהט | city | 1379225 | רהט |  |  | 33.6 | 1 | PASS |  |
| רחובות | city | 1246791 | רחובות |  |  | 23.8 | 2 | PASS |  |
| ריינה | local_council | 1383936 | ריינה |  |  | 10.9 | 1 | PASS |  |
| רכסים | local_council | 1933959 | רכסים |  |  | 3.9 | 2 | PASS |  |
| רמלה | city | 1381458 | רמלה |  |  | 13.4 | 1 | PASS |  |
| רמת גן | city | 1382493 | רמת גן |  |  | 16.5 | 1 | PASS |  |
| רמת השרון | city | 1382821 | רמת השרון |  |  | 16.8 | 2 | PASS |  |
| רמת ישי | local_council | 1933844 | רמת ישי |  |  | 2.3 | 1 | PASS |  |
| רעננה | city | 1383630 | רעננה |  |  | 14.9 | 1 | PASS |  |
| שלומי | local_council | 1663091 | שלומי |  |  | 5.9 | 1 | PASS |  |
| שעב | local_council | 1387994 | שעב |  |  | 5.4 | 1 | PASS |  |
| שפרעם | city | 1386845 | שפרעם |  |  | 19.7 | 1 | PASS |  |
| תל מונד | local_council | 1395620 | תל מונד |  |  | 7.1 | 1 | PASS |  |
| תל שבע | local_council | 1376827 | תל שבע |  |  | 9.4 | 1 | PASS |  |

(Normalization rule / OSM field columns are blank for the 165 original PASS entries — they were resolved before this normalization work existed, via plain exact-match. Not a gap in this run; nothing to re-check there.)

### ה-definite-article diagnostic (NOT applied — evidence only)

Checked all 46 remaining no-match entries (ה added or stripped, same 5 OSM fields) — **zero hits**. Not a guess: 7 of the 46 initially errored (network) and were silently counted as "no evidence either way" by the first pass — re-verified each of those 7 individually rather than let that stand; all 7 also came back as clean, confirmed no-matches on retry. This rule would not help any of the remaining FAILs — not added.
