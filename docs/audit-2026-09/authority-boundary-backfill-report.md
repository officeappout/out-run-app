# Authority Boundary Backfill — Report

Stage A generated 2026-10-01T05:42:50.753Z. Dry-run only — zero Firestore writes.

PASS: 148 · FLAG: 1 · FAIL: 106 · total 255

## Stage B — executed 2026-10-01

David approved מזרעה from FLAG (0.98km², just under the 1km² floor — "the
floor was arbitrary"). Wrote 148 PASS + מזרעה = **149 authorities**.
Single-field merge (`boundaryGeoJSON` + `updatedAt`) only, reusing each
authority's already-fetched Stage A feature — no re-fetch. Additive only:
`buildTargetList` structurally excludes any authority that already had a
boundary, and `runStageB` double-checks again immediately before each
write. Spot-checked live afterward: Haifa (pre-existing) untouched;
גבעתיים (new) has all its original fields intact plus the two written
ones. **Authorities now carrying a boundary: 155** (149 new + 6 pre-existing).

## Follow-ups — recorded, not executed (David's explicit instruction)

### 1. The 106 FAILs are mostly name-normalization, not missing data

Three clear patterns across the no-match list:
- `"מועצה אזורית X"` (OSM) vs. our stored `"X"` alone — ~35
- Different Arabic-name transliteration between OSM and our data — ~25
- Extra yod / hyphen variants (קריית/קרית, with/without maqaf) — ~15

**The fix, when picked up: normalize before comparing, not loosen the
match.** Still require exactly one match after normalization; still FAIL
outright on multiple matches. The refusal to guess on ambiguity is the
reason the 148 PASS figures above are trustworthy — do not trade that away
for a higher match rate.

### 2. 17 "relation matched, geometry could not be assembled" is a separate bug, not a naming issue

Full list: מגדל העמק, רעננה, פקיעין (בוקייעה), נחף, מטולה, רמת ישי, מעלה
עירון, עילוט, יפיע, ביתר עילית, כפר קרע, אלפי מנשה, מועצה אזורית גוש
עציון, בית אל, מועצה אזורית גולן, נשר, רמת השרון.

**רעננה and רמת השרון are Herzliya's two neighboring authorities** — the
exact places PR #80's Herzliya benchmark run sent 19 routes to as
"dropped outside the boundary" (including "שביל סובב רעננה" twice). David:
this gets priority. Worth investigating whether `osmtogeojson`'s relation
assembly has a real bug for these specific geometries (multi-part?
unusual member roles?) rather than assuming it's unfixable.

### 3. Two data findings on `authorities` records — not fixed, impact-checked only

- `name = "קרית אונו"` (missing the extra yod) — the same root-cause
  spelling gap PR #80 found contaminating park anchors via `city`-field
  matching, now confirmed on the authority record's own `name` field too.
- `"wix"` (id `wix_iv5x`, type `city`) — a synthetic test record present
  in production `authorities`.

**Blast-radius check for changing `authorities/{id}.name`** (requested
before any fix is attempted):
- `findAuthorityByCityName`'s `CITY_NAME_MAP` already aliases
  `'קרית אונו': ['קרית אונו', 'קריית אונו', 'kiryat ono', 'kiryat-ono']`
  (`authority-resolution.ts:221`) — this exact gap was already found and
  handled here once before. **Safe** for this consumer.
- `onAuthorityWrite` (Cloud Function, `functions/src/onAuthorityWrite.ts`)
  only acts when `isMilitaryAuthority(data)` is true — both קרית אונו and
  wix are `type: 'city'`. **Not touched, zero risk.**
- CRM agent's `nameMatchScore`/`authorityKeywords`
  (`src/app/api/admin/crm-agent/run/route.ts:162-169`) splits `auth.name`
  into ≥3-char tokens and substring-matches them against email text as a
  *score*, not a hard gate. "קרית" and "קריית" aren't substrings of each
  other, so a rename drops one of two keywords for this authority's
  threads — but "אונו" alone still matches, and it's scored, not
  required. **Low risk, not zero.**
- `re-seed-authorities.ts` deletes **all** `authorities` docs and
  recreates them from the static `src/lib/data/israel-locations.ts` file.
  If it's ever re-run, it would silently revert any name fix **and wipe
  all 155 `boundaryGeoJSON` writes from Stage B above** — that file has no
  boundary field at all. `panel-api.md` documents `seed-*`/`fix-*` scripts
  as one-off/write-once, not a regular API, so this isn't expected to run
  again — but it's the one real structural risk, worth a guard (or at
  least a loud comment) before any future name fix, independent of the
  name question itself.

~50 admin-panel UI files and ~90 one-off migration scripts also read
`authorities.name` or import `authority.service.ts` — not traced
individually; the overwhelming majority are pure display (a spelling fix
there is a visible correction, not a break) or historical scripts already
run once. The four consumers above are the ones that do real matching/
propagation logic against the field.

| שם רשות | סוג | relation id | שם ב-OSM | שטח קמ"ר | טבעות | verdict | reasons |
|---|---|---|---|---|---|---|---|
| wix | city |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| אכסאל | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| אל קסום | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| אל-בטוף | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| אלונה | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| אלפי מנשה | local_council | 11993345 | אלפי מנשה |  |  | FAIL | relation matched but boundary geometry could not be assembled |
| באקה אל-גרביה | city |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| באר טוביה | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| בוסתן אל-מרג' | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| בועיינה-נוג'ידאת | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| ביר אל-מכסור | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| בית אל | local_council | 2265371 | בית אל |  |  | FAIL | relation matched but boundary geometry could not be assembled |
| בית אריה-עופרים | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| ביתר עילית | city | 10044900 | ביתר עילית |  |  | FAIL | relation matched but boundary geometry could not be assembled |
| בני שמעון | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| בנימינה-גבעת עדה | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| ברנר | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| ג'ולס | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| ג'סר א-זרקא | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| ג'ש (גוש חלב) | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| גדרות | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| גן רווה | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| דאלית אל-כרמל | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| דבורייה | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| דייר אל-אסד | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| דייר חנא | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| הגלבוע | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| הגליל העליון | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| הגליל התחתון | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| הערבה התיכונה | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| הר חברון | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| זבולון | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| חבל אילות | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| חבל יבנה | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| חוף אשקלון | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| חוף הכרמל | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| טובא-זנגרייה | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| טירת כרמל | city |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| יאנוח-ג'ת | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| יהוד-מונוסון | city |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| יואב | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| יפיע | local_council | 1383759 | יפיע |  |  | FAIL | relation matched but boundary geometry could not be assembled |
| ירושלים | city |  |  |  |  | FAIL | 2 relations matched the name — ambiguous, not choosing (relation ids: 1381350, 6502363) |
| כאוכב אבו אל-היג'א | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| כסיפה | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| כסרא-סמיע | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| כעביה-טבאש-חג'אג'רה | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| כפר קרע | city | 1391829 | כפר קרע |  |  | FAIL | relation matched but boundary geometry could not be assembled |
| לב השרון | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| לכיש | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| מבואות החרמון | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| מג'ד אל-כרום | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| מג'דל שמס | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| מגאר | city |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| מגדל העמק | city | 1383758 | מגדל העמק |  |  | FAIL | relation matched but boundary geometry could not be assembled |
| מגידו | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| מגילות ים המלח | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| מודיעין עילית | city |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| מועצה אזורית גולן | regional_council | 1379176 | מועצה אזורית גולן |  |  | FAIL | relation matched but boundary geometry could not be assembled |
| מועצה אזורית גוש עציון | regional_council | 21424451 | מועצה אזורית גוש עציון |  |  | FAIL | relation matched but boundary geometry could not be assembled |
| מועצה אזורית גליל עמקים | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| מטה אשר | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| מטולה | local_council | 1378949 | מטולה |  |  | FAIL | relation matched but boundary geometry could not be assembled |
| מנשה | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| מעלה יוסף | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| מעלה עירון | local_council | 1380230 | מעלה עירון |  |  | FAIL | relation matched but boundary geometry could not be assembled |
| מעלות-תרשיחא | city |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| מרום הגליל | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| מרחבים | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| נווה מדבר | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| נחל שורק | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| נחף | local_council | 1388009 | נחף |  |  | FAIL | relation matched but boundary geometry could not be assembled |
| נשר | city | 1387889 | נשר |  |  | FAIL | relation matched but boundary geometry could not be assembled |
| סאג'ור | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| סח'נין | city |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| עיילבון | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| עילוט | local_council | 1386835 | עילוט |  |  | FAIL | relation matched but boundary geometry could not be assembled |
| עמק הירדן | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| עמק המעיינות | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| עספיא | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| ערבות הירדן | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| ערערה-בנגב | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| פקיעין (בוקייעה) | local_council | 1933868 | פקיעין (בוקייעה) |  |  | FAIL | relation matched but boundary geometry could not be assembled |
| פרדס חנה-כרכור | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| פרדסייה | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| קדימה-צורן | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| קריית ביאליק | city |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| קריית יערים | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| קריית מוצקין | city |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| קריית מלאכי | city |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| קריית עקרון | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| קריית שמונה | city |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| קרית אונו | city |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| רמת הנגב | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| רמת השרון | city | 1382821 | רמת השרון |  |  | FAIL | relation matched but boundary geometry could not be assembled |
| רמת ישי | local_council | 1933844 | רמת ישי |  |  | FAIL | relation matched but boundary geometry could not be assembled |
| רעננה | city | 1383630 | רעננה |  |  | FAIL | relation matched but boundary geometry could not be assembled |
| שבלי - אום אל-גנם | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| שגב-שלום | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| שדות דן | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| שדות נגב | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| שוהם | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| שער הנגב | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| שער שומרון | local_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| שפיר | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| תמר | regional_council |  |  |  |  | FAIL | no OSM relation matched name or name:he — not found |
| מזרעה | local_council | 1932154 | מזרעה | 1.0 | 1 | FLAG | area 1.0km² outside [1, 5000]km² |
| אבו גוש | local_council | 1381564 | אבו גוש | 1.9 | 3 | PASS |  |
| אבו סנאן | local_council | 1399119 | אבו סנאן | 6.5 | 1 | PASS |  |
| אבן יהודה | local_council | 1395619 | אבן יהודה | 8.2 | 1 | PASS |  |
| אום אל-פחם | city | 1380228 | אום אל-פחם | 26.1 | 2 | PASS |  |
| אופקים | city | 1379102 | אופקים | 16.4 | 1 | PASS |  |
| אור יהודה | city | 1382464 | אור יהודה | 7.6 | 1 | PASS |  |
| אור עקיבא | city | 1392848 | אור עקיבא | 5.6 | 2 | PASS |  |
| אורנית | local_council | 2805908 | אורנית | 2.0 | 5 | PASS |  |
| אזור | local_council | 1382459 | אזור | 2.4 | 1 | PASS |  |
| אילת | city | 1377284 | אילת | 102.8 | 5 | PASS |  |
| אליכין | local_council | 1392861 | אליכין | 1.7 | 1 | PASS |  |
| אלעד | city | 1399133 | אלעד | 3.5 | 1 | PASS |  |
| אלקנה | local_council | 11993416 | אלקנה | 2.6 | 10 | PASS |  |
| אעבלין | local_council | 1386842 | אעבלין | 12.1 | 1 | PASS |  |
| אפרת | local_council | 11994042 | אפרת | 5.9 | 11 | PASS |  |
| אריאל | city | 10011903 | אריאל | 11.7 | 22 | PASS |  |
| אשדוד | city | 1380013 | אשדוד | 64.1 | 1 | PASS |  |
| באר יעקב | city | 1381478 | באר יעקב | 9.5 | 2 | PASS |  |
| באר שבע | city | 1377264 | באר שבע | 117.8 | 1 | PASS |  |
| בוקעאתא | local_council | 1375243 | בוקעאתא | 19.6 | 1 | PASS |  |
| בית ג'ן | local_council | 1393026 | בית ג'ן | 7.2 | 1 | PASS |  |
| בית דגן | local_council | 1382242 | בית דגן | 1.9 | 1 | PASS |  |
| בית שאן | city | 1380253 | בית שאן | 11.0 | 1 | PASS |  |
| בית שמש | city | 1379449 | בית שמש | 38.4 | 3 | PASS |  |
| בני ברק | city | 1382817 | בני ברק | 7.4 | 1 | PASS |  |
| בני עי"ש | local_council | 1380017 | בני עי"ש | 2.0 | 1 | PASS |  |
| בסמ"ה | local_council | 1391826 | בסמ"ה | 5.6 | 3 | PASS |  |
| בסמת טבעון | local_council | 1399264 | בסמת טבעון | 3.9 | 1 | PASS |  |
| בענה | local_council | 1387991 | בענה | 3.5 | 1 | PASS |  |
| בת ים | city | 1382458 | בת ים | 9.4 | 1 | PASS |  |
| ג'דיידה-מכר | local_council | 1392115 | ג'דיידה-מכר | 9.1 | 1 | PASS |  |
| ג'לג'וליה | local_council | 1405256 | ג'לג'וליה | 2.5 | 1 | PASS |  |
| ג'ת | local_council | 10072527 | ג'ת | 7.5 | 1 | PASS |  |
| גבעת זאב | local_council | 11994230 | גבעת זאב | 4.8 | 19 | PASS |  |
| גבעת שמואל | city | 1382837 | גבעת שמואל | 2.6 | 1 | PASS |  |
| גבעתיים | city | 1382923 | גבעתיים | 3.3 | 1 | PASS |  |
| גדרה | local_council | 1380016 | גדרה | 11.5 | 1 | PASS |  |
| גן יבנה | local_council | 1380014 | גן יבנה | 11.5 | 1 | PASS |  |
| גני תקווה | city | 1401193 | גני תקווה | 2.2 | 1 | PASS |  |
| דימונה | city | 1376826 | דימונה | 223.9 | 4 | PASS |  |
| הוד השרון | city | 1383629 | הוד השרון | 19.3 | 1 | PASS |  |
| הר אדר | local_council | 11994403 | הר אדר | 1.1 | 8 | PASS |  |
| זמר | local_council | 1398018 | זמר | 8.3 | 1 | PASS |  |
| זרזיר | local_council | 1933845 | זרזיר | 4.3 | 1 | PASS |  |
| חדרה | city | 1392860 | חדרה | 42.3 | 2 | PASS |  |
| חולון | city | 1382460 | חולון | 19.1 | 1 | PASS |  |
| חורה | local_council | 1376829 | חורה | 8.8 | 1 | PASS |  |
| חורפיש | local_council | 1404543 | חורפיש | 6.2 | 1 | PASS |  |
| חצור הגלילית | local_council | 1379342 | חצור הגלילית | 5.5 | 1 | PASS |  |
| חריש | city | 1398023 | חריש | 9.1 | 1 | PASS |  |
| טבריה | city | 1387273 | טבריה | 16.2 | 1 | PASS |  |
| טורעאן | local_council | 1386840 | טורעאן | 12.3 | 1 | PASS |  |
| טייבה | city | 1389571 | טייבה | 19.1 | 1 | PASS |  |
| טירה | city | 1389567 | טירה | 12.1 | 1 | PASS |  |
| טמרה | city | 1386851 | טמרה | 29.9 | 1 | PASS |  |
| יבנאל | local_council | 1387228 | יבנאל | 31.3 | 1 | PASS |  |
| יבנה | city | 1380415 | יבנה | 30.0 | 1 | PASS |  |
| יסוד המעלה | local_council | 1379121 | יסוד המעלה | 11.7 | 1 | PASS |  |
| יקנעם עילית | city | 1391621 | יקנעם עילית | 9.2 | 2 | PASS |  |
| ירוחם | local_council | 1376764 | ירוחם | 58.8 | 2 | PASS |  |
| ירכא | local_council | 1392113 | ירכא | 16.2 | 1 | PASS |  |
| כאבול | local_council | 1386852 | כאבול | 7.3 | 1 | PASS |  |
| כוכב יאיר | local_council | 1389566 | כוכב יאיר | 3.1 | 1 | PASS |  |
| כפר ברא | local_council | 1405260 | כפר ברא | 2.5 | 1 | PASS |  |
| כפר ורדים | local_council | 1406229 | כפר ורדים | 4.9 | 1 | PASS |  |
| כפר יאסיף | local_council | 1392114 | כפר יאסיף | 5.7 | 1 | PASS |  |
| כפר יונה | city | 1383392 | כפר יונה | 11.5 | 1 | PASS |  |
| כפר כמא | local_council | 1383755 | כפר כמא | 8.9 | 1 | PASS |  |
| כפר כנא | local_council | 1383937 | כפר כנא | 10.1 | 1 | PASS |  |
| כפר מנדא | local_council | 1386841 | כפר מנדא | 11.1 | 1 | PASS |  |
| כפר סבא | city | 1383631 | כפר סבא | 14.9 | 1 | PASS |  |
| כפר קאסם | city | 1405261 | כפר קאסם | 9.3 | 1 | PASS |  |
| כפר שמריהו | local_council | 1383632 | כפר שמריהו | 2.7 | 1 | PASS |  |
| כפר תבור | local_council | 1383762 | כפר תבור | 12.4 | 1 | PASS |  |
| כרמיאל | city | 1387990 | כרמיאל | 22.1 | 1 | PASS |  |
| להבים | local_council | 1379226 | להבים | 11.2 | 1 | PASS |  |
| לוד | city | 1381532 | לוד | 14.8 | 1 | PASS |  |
| לקיה | local_council | 1377267 | לקיה | 6.9 | 1 | PASS |  |
| מבשרת ציון | local_council | 1381348 | מבשרת ציון | 6.3 | 1 | PASS |  |
| מגדל | local_council | 1387371 | מגדל | 11.7 | 1 | PASS |  |
| מגדל תפן | local_council | 1406228 | מגדל תפן | 2.7 | 1 | PASS |  |
| מודיעין-מכבים-רעות | city | 1381425 | מודיעין-מכבים-רעות | 48.5 | 1 | PASS |  |
| מועצה אזורית אשכול | regional_council | 1473950 | מועצה אזורית אשכול | 739.0 | 1 | PASS |  |
| מועצה אזורית גזר | regional_council | 1381347 | מועצה אזורית גזר | 119.9 | 2 | PASS |  |
| מועצה אזורית דרום השרון | regional_council | 1382465 | מועצה אזורית דרום השרון | 94.4 | 4 | PASS |  |
| מועצה אזורית חבל מודיעין | regional_council | 1381426 | מועצה אזורית חבל מודיעין | 128.4 | 4 | PASS |  |
| מועצה אזורית חוף השרון | regional_council | 1383640 | מועצה אזורית חוף השרון | 50.0 | 3 | PASS |  |
| מועצה אזורית מטה בנימין | regional_council | 21416353 | מועצה אזורית מטה בנימין | 917.5 | 1 | PASS |  |
| מועצה אזורית מטה יהודה | regional_council | 1379430 | מועצה אזורית מטה יהודה | 475.2 | 10 | PASS |  |
| מועצה אזורית משגב | regional_council | 1386844 | מועצה אזורית משגב | 163.4 | 7 | PASS |  |
| מועצה אזורית עמק חפר | regional_council | 1383390 | מועצה אזורית עמק חפר | 130.4 | 1 | PASS |  |
| מועצה אזורית עמק יזרעאל | regional_council | 1380233 | מועצה אזורית עמק יזרעאל | 329.1 | 8 | PASS |  |
| מועצה אזורית שומרון | regional_council | 3118471 | מועצה אזורית שומרון | 76.4 | 131 | PASS |  |
| מזכרת בתיה | local_council | 1381349 | מזכרת בתיה | 7.4 | 1 | PASS |  |
| מיתר | local_council | 1376828 | מיתר | 23.9 | 1 | PASS |  |
| מסעדה | local_council | 1375244 | מסעדה | 12.0 | 1 | PASS |  |
| מעיליא | local_council | 1932118 | מעיליא | 2.1 | 1 | PASS |  |
| מעלה אדומים | city | 10044691 | מעלה אדומים | 46.8 | 11 | PASS |  |
| מעלה אפרים | local_council | 11994847 | מעלה אפרים | 5.1 | 5 | PASS |  |
| מצפה רמון | local_council | 1376758 | מצפה רמון | 76.1 | 1 | PASS |  |
| משהד | local_council | 1383935 | משהד | 7.2 | 1 | PASS |  |
| נאות חובב | local_council | 1376773 | נאות חובב | 77.1 | 4 | PASS |  |
| נהריה | city | 1932164 | נהריה | 13.9 | 4 | PASS |  |
| נוף הגליל | city | 1383760 | נוף הגליל | 33.0 | 5 | PASS |  |
| נס ציונה | city | 1246731 | נס ציונה | 15.7 | 2 | PASS |  |
| נצרת | city | 1386836 | נצרת | 14.2 | 2 | PASS |  |
| נתיבות | city | 1379103 | נתיבות | 16.3 | 3 | PASS |  |
| נתניה | city | 1383391 | נתניה | 35.4 | 1 | PASS |  |
| סביון | local_council | 1932371 | סביון | 3.7 | 2 | PASS |  |
| ע'ג'ר | local_council | 1377972 | ע'ג'ר | 2.6 | 1 | PASS |  |
| עומר | local_council | 1376825 | עומר | 18.3 | 1 | PASS |  |
| עין מאהל | local_council | 1383934 | עין מאהל | 5.2 | 1 | PASS |  |
| עין קנייא | local_council | 1375245 | עין קנייא | 5.4 | 1 | PASS |  |
| עכו | city | 1387962 | עכו | 18.2 | 1 | PASS |  |
| עמנואל | local_council | 11992970 | עמנואל | 3.4 | 1 | PASS |  |
| עפולה | city | 1380226 | עפולה | 29.7 | 2 | PASS |  |
| עראבה | city | 1392179 | עראבה | 9.7 | 1 | PASS |  |
| ערד | city | 1376910 | ערד | 126.2 | 2 | PASS |  |
| ערערה | local_council | 1391830 | ערערה | 10.8 | 1 | PASS |  |
| פוריידיס | local_council | 1391709 | פוריידיס | 4.1 | 1 | PASS |  |
| פסוטה | local_council | 1404516 | פסוטה | 11.1 | 1 | PASS |  |
| פתח תקווה | city | 1382816 | פתח תקווה | 36.0 | 1 | PASS |  |
| צור הדסה | local_council | 15979563 | צור הדסה | 4.0 | 1 | PASS |  |
| צפת | city | 1379335 | צפת | 30.0 | 1 | PASS |  |
| קדומים | local_council | 11993360 | קדומים | 3.3 | 11 | PASS |  |
| קלנסווה | city | 1395618 | קלנסווה | 8.4 | 1 | PASS |  |
| קצרין | local_council | 1379175 | קצרין | 10.9 | 1 | PASS |  |
| קריית ארבע | local_council | 11994828 | קריית ארבע | 4.0 | 45 | PASS |  |
| קריית טבעון | local_council | 1401800 | קריית טבעון | 9.3 | 1 | PASS |  |
| קרית אתא | city | 1387454 | קרית אתא | 24.2 | 2 | PASS |  |
| קרית גת | city | 1379485 | קרית גת | 22.5 | 2 | PASS |  |
| קרית ים | city | 1387931 | קרית ים | 12.8 | 1 | PASS |  |
| קרני שומרון | local_council | 11992956 | קרני שומרון | 9.9 | 28 | PASS |  |
| ראמה | local_council | 1392964 | ראמה | 6.5 | 1 | PASS |  |
| ראש העין | city | 1401781 | ראש העין | 15.9 | 1 | PASS |  |
| ראש פינה | local_council | 1379241 | ראש פינה | 16.8 | 4 | PASS |  |
| ראשון לציון | city | 1382177 | ראשון לציון | 62.1 | 2 | PASS |  |
| רהט | city | 1379225 | רהט | 33.6 | 1 | PASS |  |
| רחובות | city | 1246791 | רחובות | 23.8 | 2 | PASS |  |
| ריינה | local_council | 1383936 | ריינה | 10.9 | 1 | PASS |  |
| רכסים | local_council | 1933959 | רכסים | 3.9 | 2 | PASS |  |
| רמלה | city | 1381458 | רמלה | 13.4 | 1 | PASS |  |
| רמת גן | city | 1382493 | רמת גן | 16.5 | 1 | PASS |  |
| שלומי | local_council | 1663091 | שלומי | 5.9 | 1 | PASS |  |
| שעב | local_council | 1387994 | שעב | 5.4 | 1 | PASS |  |
| שפרעם | city | 1386845 | שפרעם | 19.7 | 1 | PASS |  |
| תל מונד | local_council | 1395620 | תל מונד | 7.1 | 1 | PASS |  |
| תל שבע | local_council | 1376827 | תל שבע | 9.4 | 1 | PASS |  |
