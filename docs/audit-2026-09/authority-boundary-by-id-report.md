# Authority Boundaries by known relation ID — Stage A Report

Generated 2026-10-02T17:35:31.003Z. Dry-run only — zero Firestore writes. Relation IDs from the Nominatim scan (not name search) — no normalization logic runs in this path.

PASS: 1 · FLAG: 26 · FAIL: 0 · RETRY: 0 · total 27

| שם רשות | סוג | relation id | שדות לפני | שם ב-OSM | התאמת שם | גאומטריה | שטח קמ"ר | טבעות | verdict | reasons |
|---|---|---|---|---|---|---|---|---|---|---|
| אל קסום | regional_council | 10052487 | 18 | מועצה אזורית אל-קסום | 🔴 MISMATCH | MultiPolygon | 38.8 | 5 | FLAG | OSM name "מועצה אזורית אל-קסום" != our label "אל קסום" |
| אל-בטוף | regional_council | 1386838 | 18 | מועצה אזורית אל בטוף | 🔴 MISMATCH | MultiPolygon | 4.2 | 2 | FLAG | area 4.2km² < 20km² for regional_council; OSM name "מועצה אזורית אל בטוף" != our label "אל-בטוף" |
| באקה אל-גרביה | city | 1398019 | 18 | באקה אל-גרבייה | 🔴 MISMATCH | Polygon | 9.7 | 1 | FLAG | OSM name "באקה אל-גרבייה" != our label "באקה אל-גרביה" |
| בוסתן אל-מרג' | regional_council | 1380227 | 18 | מועצה אזורית בוסתן-אל-מרג' | 🔴 MISMATCH | MultiPolygon | 9.0 | 3 | FLAG | area 9.0km² < 20km² for regional_council; OSM name "מועצה אזורית בוסתן-אל-מרג'" != our label "בוסתן אל-מרג'" |
| ביר אל-מכסור | local_council | 1386839 | 19 | ביר אל מכסור | 🔴 MISMATCH | Polygon | 5.9 | 1 | FLAG | OSM name "ביר אל מכסור" != our label "ביר אל-מכסור" |
| בית אריה-עופרים | local_council | 11993994 | 18 | בית אריה - עופרים | 🔴 MISMATCH | MultiPolygon | 7.8 | 10 | FLAG | OSM name "בית אריה - עופרים" != our label "בית אריה-עופרים" |
| בנימינה-גבעת עדה | local_council | 1392847 | 19 | בנימינה - גבעת עדה | 🔴 MISMATCH | Polygon | 24.5 | 1 | FLAG | OSM name "בנימינה - גבעת עדה" != our label "בנימינה-גבעת עדה" |
| דאלית אל-כרמל | local_council | 1403095 | 19 | דלית אל-כרמל | 🔴 MISMATCH | Polygon | 12.8 | 1 | FLAG | OSM name "דלית אל-כרמל" != our label "דאלית אל-כרמל" |
| טובא-זנגרייה | local_council | 1379262 | 18 | טובא זנגריה | 🔴 MISMATCH | Polygon | 3.6 | 1 | FLAG | OSM name "טובא זנגריה" != our label "טובא-זנגרייה" |
| יאנוח-ג'ת | local_council | 1401793 | 18 | יאנוח - ג'ת | 🔴 MISMATCH | Polygon | 13.6 | 1 | FLAG | OSM name "יאנוח - ג'ת" != our label "יאנוח-ג'ת" |
| יהוד-מונוסון | city | 1382466 | 18 | יהוד מונוסון | 🔴 MISMATCH | Polygon | 6.5 | 1 | FLAG | OSM name "יהוד מונוסון" != our label "יהוד-מונוסון" |
| כאוכב אבו אל-היג'א | local_council | 1386843 | 18 | כווכב אבו אל-היג'א | 🔴 MISMATCH | Polygon | 2.7 | 1 | FLAG | OSM name "כווכב אבו אל-היג'א" != our label "כאוכב אבו אל-היג'א" |
| כסיפה | local_council | 1376911 | 19 | כסייפה | 🔴 MISMATCH | Polygon | 13.6 | 1 | FLAG | OSM name "כסייפה" != our label "כסיפה" |
| כעביה-טבאש-חג'אג'רה | local_council | 1933846 | 19 | כעביה טבאש חג'אג'רה | 🔴 MISMATCH | MultiPolygon | 1.9 | 2 | FLAG | OSM name "כעביה טבאש חג'אג'רה" != our label "כעביה-טבאש-חג'אג'רה" |
| מג'ד אל-כרום | local_council | 1387992 | 19 | מג'ד אל כרום | 🔴 MISMATCH | Polygon | 9.5 | 1 | FLAG | OSM name "מג'ד אל כרום" != our label "מג'ד אל-כרום" |
| מג'דל שמס | local_council | 1375242 | 19 | מג'דל א-שמס | 🔴 MISMATCH | Polygon | 15.9 | 1 | FLAG | OSM name "מג'דל א-שמס" != our label "מג'דל שמס" |
| מגאר | city | 1387400 | 19 | מר'אר | 🔴 MISMATCH | MultiPolygon | 21.2 | 2 | FLAG | OSM name "מר'אר" != our label "מגאר" |
| מעלות-תרשיחא | city | 1404529 | 19 | מעלות תרשיחא | 🔴 MISMATCH | MultiPolygon | 9.3 | 2 | FLAG | OSM name "מעלות תרשיחא" != our label "מעלות-תרשיחא" |
| סאג'ור | local_council | 1388015 | 19 | סג'ור | 🔴 MISMATCH | Polygon | 3.6 | 1 | FLAG | OSM name "סג'ור" != our label "סאג'ור" |
| סח'נין | city | 1392988 | 18 | סכנין | 🔴 MISMATCH | Polygon | 11.2 | 1 | FLAG | OSM name "סכנין" != our label "סח'נין" |
| עספיא | local_council | 1403485 | 19 | עוספייא | 🔴 MISMATCH | Polygon | 11.1 | 1 | FLAG | OSM name "עוספייא" != our label "עספיא" |
| ערערה-בנגב | local_council | 1376931 | 18 | ערערה בנגב | 🔴 MISMATCH | Polygon | 14.1 | 1 | FLAG | OSM name "ערערה בנגב" != our label "ערערה-בנגב" |
| פרדס חנה-כרכור | local_council | 1392849 | 16 | פרדס חנה - כרכור | 🔴 MISMATCH | Polygon | 22.9 | 1 | FLAG | OSM name "פרדס חנה - כרכור" != our label "פרדס חנה-כרכור" |
| קדימה-צורן | local_council | 1395617 | 16 | קדימה - צורן | 🔴 MISMATCH | Polygon | 10.9 | 1 | FLAG | OSM name "קדימה - צורן" != our label "קדימה-צורן" |
| שגב-שלום | local_council | 1377266 | 18 | שגב שלום | 🔴 MISMATCH | Polygon | 13.6 | 1 | FLAG | OSM name "שגב שלום" != our label "שגב-שלום" |
| שוהם | local_council | 1406086 | 16 | שהם | 🔴 MISMATCH | MultiPolygon | 7.2 | 2 | FLAG | OSM name "שהם" != our label "שוהם" |
| ירושלים | city | 1381350 | 19 | ירושלים | ok | MultiPolygon | 126.1 | 4 | PASS |  |
