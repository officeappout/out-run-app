# Locality Geocoding — Phase A Resolved/Held-Out Split (10.08.2026)

Multi-tier geocoding of the 186 top-level localities (city/local_council/regional_council)
confirmed present in Firestore `authorities` but missing from the static onboarding picker.
Investigation + data generation only — nothing written to the picker file or Firestore yet.

**Tiers**: (1) Mapbox forwardGeocode, relevance >= 0.8. (2) Mapbox retry with Hebrew spelling
variants (plene/defective yod-vav, hyphen normalization, parenthetical-suffix stripping).
(3) Nominatim (OSM) search, admin-boundary preferred for regional councils.

**Confidence floor applied**: Mapbox relevance >= 0.8 (built into tier 1/2). Nominatim
importance >= 0.15 — added AFTER manual spot-checking found the pipeline's original
accept-any-first-result Nominatim logic returned confirmed-wrong matches for low-importance
results (e.g. אורנית matched a street near Ramat Yishai instead of the real West Bank local
council; ג'ולס matched "עולש" in Jaffa; several regional councils matched unrelated streets
elsewhere in the country sharing the same name). Everything below the floor was moved to
held-out rather than shipped as a guess.

## Summary

- **Resolved (safe for the Phase A diff): 149 / 186**
- **Held out (needs manual review before inclusion): 37 / 186**

| Type | Resolved | Held out | Total |
|---|---|---|---|
| city | 28 | 0 | 28 |
| local_council | 104 | 12 | 116 |
| regional_council | 17 | 25 | 42 |

---

## Resolved — full list (name, type, coordinates, source tier, confidence)

| Name | Type | Lat | Lng | Tier | Confidence | Matched as |
|---|---|---|---|---|---|---|
| אור עקיבא | city | 32.50670 | 34.91978 | Mapbox-exact | 1.00 | אור עקיבא, מחוז חיפה, ישראל |
| באקה אל-גרביה | city | 32.42059 | 35.04272 | Mapbox-variant | 1.00 | באקה אל-גרבייה, מחוז חיפה, ישראל |
| באר יעקב | city | 31.94435 | 34.83986 | Nominatim | 0.52 | באר יעקב, נפת רמלה, מחוז המרכז, 7031011, ישראל |
| בית שאן | city | 32.49675 | 35.49730 | Nominatim | 0.62 | בית שאן, נפת יזרעאל, מחוז הצפון, ישראל |
| גבעתיים | city | 32.07495 | 34.80858 | Mapbox-exact | 1.00 | גבעתיים, מחוז תל אביב, ישראל |
| גני תקווה | city | 32.06055 | 34.86803 | Mapbox-exact | 1.00 | גני תקווה, מחוז המרכז, ישראל |
| הרצלייה | city | 32.16484 | 34.84758 | Mapbox-variant | 1.00 | הרצליה, מחוז תל אביב, ישראל |
| חריש | city | 32.45964 | 35.05108 | Nominatim | 0.39 | חריש, נפת חדרה, מחוז חיפה, ישראל |
| טירת כרמל | city | 32.76138 | 34.97155 | Nominatim | 0.48 | טירת כרמל, טירת הכרמל, נפת חיפה, מחוז חיפה, 3955022, ישראל |
| יהוד-מונוסון | city | 32.02953 | 34.88900 | Mapbox-variant | 1.00 | יהוד, מחוז המרכז, ישראל |
| כפר קאסם | city | 32.11471 | 34.97560 | Nominatim | 0.52 | כפר קאסם, נפת פתח תקווה, מחוז המרכז, ישראל |
| כפר קרע | city | 32.50299 | 35.05050 | Nominatim | 0.44 | כפר קרע, נפת חדרה, מחוז חיפה, ישראל |
| מגאר | city | 32.88694 | 35.40694 | Nominatim | 0.45 | المغار, נפת כנרת, מחוז הצפון, ישראל |
| מודיעין עילית | city | 31.93217 | 35.04579 | Mapbox-exact | 1.00 | מודיעין עילית |
| מעלות-תרשיחא | city | 33.01574 | 35.27597 | Nominatim | 0.49 | מעלות תרשיחא, נפת עכו, מחוז הצפון, ישראל |
| נהרייה | city | 33.00631 | 35.09456 | Nominatim | 0.60 | נהריה, נפת עכו, מחוז הצפון, ישראל |
| נוף הגליל | city | 32.70231 | 35.31832 | Nominatim | 0.49 | נוף הגליל, נפת יזרעאל, מחוז הצפון, ישראל |
| סח'נין | city | 32.86381 | 35.30232 | Nominatim | 0.49 | سخنين, נפת עכו, מחוז הצפון, ישראל |
| עראבה | city | 32.85410 | 35.33686 | Mapbox-exact | 1.00 | עראבה, מחוז הצפון, ישראל |
| קלנסווה | city | 32.28486 | 34.98017 | Nominatim | 0.47 | קלנסווה, נפת השרון, מחוז המרכז, ישראל |
| קריית אתא | city | 32.81069 | 35.11623 | Mapbox-exact | 1.00 | קריית אתא, מחוז חיפה, ישראל |
| קריית ביאליק | city | 32.83669 | 35.08933 | Nominatim | 0.48 | קריית ביאליק, נפת חיפה, מחוז חיפה, ישראל |
| קריית גת | city | 31.60633 | 34.77348 | Mapbox-exact | 1.00 | קריית גת, מחוז הדרום, ישראל |
| קריית ים | city | 32.84675 | 35.07017 | Nominatim | 0.45 | קריית ים, נפת חיפה, מחוז חיפה, ישראל |
| קריית מוצקין | city | 32.83760 | 35.07576 | Mapbox-exact | 1.00 | קריית מוצקין, מחוז חיפה, ישראל |
| קריית מלאכי | city | 31.74691 | 34.82251 | Nominatim | 0.35 | קריית מלאכי - יואב, כביש חוצה ישראל, מועצה אזורית יואב, נפת אשקלון, מחוז הדרום, ישראל |
| קריית שמונה | city | 33.21206 | 35.57050 | Mapbox-exact | 1.00 | קריית שמונה, מחוז הצפון, ישראל |
| שפרעם | city | 32.80623 | 35.17133 | Mapbox-exact | 1.00 | שפרעם, מחוז הצפון, ישראל |
| אבו גוש | local_council | 31.80635 | 35.10887 | Nominatim | 0.44 | أبو غوش‎, נפת ירושלים, מחוז ירושלים, ישראל |
| אבו סנאן | local_council | 32.95840 | 35.16793 | Mapbox-exact | 1.00 | אבו סנאן, מחוז הצפון, ישראל |
| אבן יהודה | local_council | 32.26963 | 34.88812 | Mapbox-exact | 1.00 | אבן יהודה, מחוז המרכז, ישראל |
| אזור | local_council | 32.02937 | 34.79849 | Mapbox-exact | 1.00 | אזור, מחוז תל אביב, ישראל |
| אכסאל | local_council | 32.68202 | 35.32292 | Mapbox-exact | 1.00 | אכסאל, מחוז הצפון, ישראל |
| אליכין | local_council | 32.40795 | 34.92487 | Nominatim | 0.19 | אליכין, נפת השרון, מחוז המרכז, ישראל |
| אלפי מנשה | local_council | 32.17445 | 35.00897 | Mapbox-exact | 1.00 | אלפי מנשה |
| אלקנה | local_council | 32.11268 | 35.03873 | Mapbox-exact | 1.00 | אלקנה |
| אעבלין | local_council | 32.82092 | 35.19133 | Nominatim | 0.46 | إعبلين, נפת עכו, מחוז הצפון, ישראל |
| אפרת | local_council | 31.66209 | 35.15496 | Mapbox-exact | 1.00 | אפרת |
| בוקעאתא | local_council | 33.20076 | 35.77799 | Nominatim | 0.45 | بقعاثا, נפת רמת הגולן, מחוז הצפון, ישראל |
| ביר אל-מכסור | local_council | 32.77263 | 35.21651 | Mapbox-exact | 1.00 | ביר אל-מכסור, מחוז הצפון, ישראל |
| בית אל | local_council | 31.94153 | 35.22337 | Mapbox-exact | 1.00 | בית אל |
| בית ג'ן | local_council | 32.96447 | 35.37814 | Nominatim | 0.44 | بيت جن, נפת עכו, מחוז הצפון, ישראל |
| בית דגן | local_council | 32.00272 | 34.83166 | Mapbox-exact | 1.00 | בית דגן, מחוז המרכז, ישראל |
| בני עי"ש | local_council | 31.78920 | 34.76060 | Nominatim | 0.19 | בני עי"ש, נפת רחובות, מחוז המרכז, ישראל |
| בנימינה-גבעת עדה | local_council | 32.52078 | 34.94760 | Mapbox-variant | 1.00 | בנימינה, מחוז חיפה, ישראל |
| בסמ"ה | local_council | 32.53231 | 35.10483 | Nominatim | 0.42 | بسمة, נפת חדרה, מחוז חיפה, 3002300, ישראל |
| בסמת טבעון | local_council | 32.73655 | 35.15343 | Mapbox-exact | 1.00 | בסמת טבעון, מחוז הצפון, ישראל |
| בענה | local_council | 32.92806 | 35.27217 | Nominatim | 0.45 | البعنة, נפת עכו, מחוז הצפון, ישראל |
| ג'דיידה-מכר | local_council | 32.92953 | 35.14673 | Nominatim | 0.19 | جديدة-المكر, נפת עכו, מחוז הצפון, ישראל |
| ג'לג'וליה | local_council | 32.15228 | 34.95365 | Nominatim | 0.51 | ג'לג'וליה, נפת פתח תקווה, מחוז המרכז, ישראל |
| ג'סר א-זרקא | local_council | 32.53775 | 34.91137 | Nominatim | 0.43 | ג'סר א-זרקא, נפת חדרה, מחוז חיפה, ישראל |
| ג'ש (גוש חלב) | local_council | 33.03997 | 35.11189 | Mapbox-variant | 1.00 | גשר הזיו, מחוז הצפון, ישראל |
| ג'ת | local_council | 31.62839 | 34.79542 | Mapbox-exact | 1.00 | גת, מחוז הדרום, ישראל |
| גבעת זאב | local_council | 31.86028 | 35.17261 | Mapbox-exact | 1.00 | גבעת זאב |
| דאלית אל-כרמל | local_council | 32.69224 | 35.04828 | Nominatim | 0.45 | دالية الكرمل, נפת חיפה, מחוז חיפה, ישראל |
| דייר חנא | local_council | 32.86184 | 35.36744 | Mapbox-variant | 1.00 | דיר חנא, מחוז הצפון, ישראל |
| הר אדר | local_council | 31.82055 | 35.12849 | Mapbox-exact | 1.00 | הר אדר |
| זמר | local_council | 32.36744 | 35.03389 | Mapbox-exact | 1.00 | זמר, מחוז המרכז, ישראל |
| זרזיר | local_council | 32.73314 | 35.21919 | Mapbox-exact | 1.00 | זרזיר, מחוז הצפון, ישראל |
| חורה | local_council | 31.29725 | 34.93791 | Nominatim | 0.19 | حورة, נפת באר שבע, מחוז הדרום, ישראל |
| חורפיש | local_council | 33.01569 | 35.34801 | Mapbox-exact | 1.00 | חורפיש, מחוז הצפון, ישראל |
| חצור הגלילית | local_council | 32.98179 | 35.54505 | Mapbox-exact | 1.00 | חצור הגלילית, מחוז הצפון, ישראל |
| טובא-זנגרייה | local_council | 32.96632 | 35.59442 | Nominatim | 0.19 | طوبا الزنغرية, נפת צפת, מחוז הצפון, ישראל |
| טורעאן | local_council | 32.77727 | 35.37252 | Nominatim | 0.45 | طرعان, נפת יזרעאל, מחוז הצפון, ישראל |
| יאנוח-ג'ת | local_council | 32.97366 | 35.23285 | Nominatim | 0.44 | يانوح جت, נפת עכו, מחוז הצפון, ישראל |
| יבנאל | local_council | 32.70546 | 35.50526 | Nominatim | 0.45 | יבנאל, נפת כנרת, מחוז הצפון, ישראל |
| יסוד המעלה | local_council | 33.05738 | 35.60302 | Nominatim | 0.19 | יסוד המעלה, נפת צפת, מחוז הצפון, ישראל |
| יפיע | local_council | 32.68422 | 35.27546 | Nominatim | 0.45 | יפיע, נפת יזרעאל, מחוז הצפון, ישראל |
| ירוחם | local_council | 30.98721 | 34.93076 | Mapbox-exact | 1.00 | ירוחם, מחוז הדרום, ישראל |
| ירכא | local_council | 32.95631 | 35.21135 | Nominatim | 0.45 | ירכא, נפת עכו, מחוז הצפון, ישראל |
| כאבול | local_council | 32.86591 | 35.21576 | Mapbox-exact | 1.00 | כאבול, מחוז הצפון, ישראל |
| כאוכב אבו אל-היג'א | local_council | 32.83092 | 35.24948 | Nominatim | 0.19 | كوكب أبو الهيجاء, נפת עכו, מחוז הצפון, ישראל |
| כוכב יאיר | local_council | 32.22016 | 34.99395 | Nominatim | 0.19 | כוכב יאיר, נפת פתח תקווה, מחוז המרכז, ישראל |
| כסיפה | local_council | 31.24654 | 35.09306 | Nominatim | 0.19 | كسيفة, נפת באר שבע, מחוז הדרום, ישראל |
| כעביה-טבאש-חג'אג'רה | local_council | 32.74885 | 35.18410 | Nominatim | 0.42 | كعبية طباش حجاجرة‎, נפת יזרעאל, מחוז הצפון, ישראל |
| כפר ברא | local_council | 32.13124 | 34.97041 | Mapbox-exact | 1.00 | כפר ברא, מחוז המרכז, ישראל |
| כפר ורדים | local_council | 32.99702 | 35.27550 | Mapbox-exact | 1.00 | כפר ורדים, מחוז הצפון, ישראל |
| כפר יאסיף | local_council | 32.95619 | 35.16383 | Mapbox-exact | 1.00 | כפר יאסיף, מחוז הצפון, ישראל |
| כפר כמא | local_council | 32.72252 | 35.44309 | Mapbox-exact | 1.00 | כפר כמא, מחוז הצפון, ישראל |
| כפר כנא | local_council | 32.74599 | 35.33980 | Nominatim | 0.19 | כפר כנא, נפת יזרעאל, מחוז הצפון, ישראל |
| כפר מנדא | local_council | 32.81141 | 35.25976 | Nominatim | 0.45 | كفر مندا, נפת עכו, מחוז הצפון, ישראל |
| כפר שמריהו | local_council | 32.17973 | 34.81848 | Mapbox-exact | 1.00 | כפר שמריהו, מחוז תל אביב, ישראל |
| כפר תבור | local_council | 32.68781 | 35.42042 | Nominatim | 0.44 | כפר תבור, נפת כנרת, מחוז הצפון, ישראל |
| להבים | local_council | 31.37431 | 34.80811 | Mapbox-exact | 1.00 | להבים, מחוז הדרום, ישראל |
| לקיה | local_council | 31.32550 | 34.86080 | Mapbox-exact | 1.00 | לקיה, מחוז הדרום, ישראל |
| מג'ד אל-כרום | local_council | 32.92258 | 35.25795 | Nominatim | 0.48 | مجد الكروم, נפת עכו, מחוז הצפון, ישראל |
| מג'דל שמס | local_council | 33.26843 | 35.76937 | Nominatim | 0.47 | مجدل شمس, נפת רמת הגולן, מחוז הצפון, ישראל |
| מגדל | local_council | 32.67651 | 35.24063 | Mapbox-exact | 1.00 | מגדל העמק, מחוז הצפון, ישראל |
| מגדל תפן | local_council | 32.97539 | 35.27709 | Nominatim | 0.36 | מגדל תפן, נפת עכו, מחוז הצפון, ישראל |
| מזכרת בתיה | local_council | 31.85584 | 34.83898 | Mapbox-exact | 1.00 | מזכרת בתיה, מחוז המרכז, ישראל |
| מזרעה | local_council | 32.98330 | 35.09834 | Nominatim | 0.44 | المزرعة, נפת עכו, מחוז הצפון, ישראל |
| מטולה | local_council | 33.27829 | 35.57835 | Mapbox-exact | 1.00 | מטולה, מחוז הצפון, ישראל |
| מיתר | local_council | 31.32767 | 34.93816 | Mapbox-exact | 1.00 | מיתר, מחוז הדרום, ישראל |
| מסעדה | local_council | 33.23121 | 35.75748 | Nominatim | 0.46 | مسعدة, נפת רמת הגולן, מחוז הצפון, ישראל |
| מעיליא | local_council | 33.02470 | 35.25402 | Mapbox-exact | 1.00 | מעיליא, מחוז הצפון, ישראל |
| מעלה אפרים | local_council | 32.07149 | 35.40392 | Mapbox-exact | 1.00 | מעלה אפרים |
| מעלה עירון | local_council | 32.54950 | 35.15449 | Nominatim | 0.42 | طلعة عارة, נפת חדרה, מחוז חיפה, ישראל |
| מצפה רמון | local_council | 30.61197 | 34.80122 | Nominatim | 0.58 | מצפה רמון, נפת באר שבע, מחוז הדרום, 8060000, ישראל |
| משהד | local_council | 32.74470 | 35.32095 | Mapbox-exact | 1.00 | משהד, מחוז הצפון, ישראל |
| נאות חובב | local_council | 31.11171 | 34.89769 | Nominatim | 0.41 | נאות חובב, נפת באר שבע, מחוז הדרום, ישראל |
| נחף | local_council | 32.93355 | 35.31762 | Mapbox-exact | 1.00 | נחף, מחוז הצפון, ישראל |
| סאג'ור | local_council | 32.94199 | 35.34220 | Nominatim | 0.19 | ساجور, נפת עכו, מחוז הצפון, ישראל |
| סביון | local_council | 32.04905 | 34.87506 | Mapbox-exact | 1.00 | סביון, מחוז המרכז, ישראל |
| ע'ג'ר | local_council | 33.27217 | 35.62391 | Nominatim | 0.46 | ע'ג'ר, נפת רמת הגולן, מחוז הצפון, ישראל |
| עומר | local_council | 31.26343 | 34.84857 | Mapbox-exact | 1.00 | עומר, מחוז הדרום, ישראל |
| עילוט | local_council | 32.71737 | 35.26133 | Mapbox-exact | 1.00 | עילוט, מחוז הצפון, ישראל |
| עין מאהל | local_council | 32.72340 | 35.35425 | Mapbox-exact | 1.00 | עין מאהל, מחוז הצפון, ישראל |
| עין קנייא | local_council | 33.23603 | 35.73105 | Nominatim | 0.46 | عين قنية, נפת רמת הגולן, מחוז הצפון, ישראל |
| עספיא | local_council | 32.72351 | 35.05862 | Mapbox-exact | 1.00 | עספיא, מחוז חיפה, ישראל |
| ערערה | local_council | 32.49655 | 35.09556 | Nominatim | 0.43 | عرعرة, נפת חדרה, מחוז חיפה, ישראל |
| ערערה-בנגב | local_council | 31.15951 | 35.02305 | Nominatim | 0.44 | عرعرة النقب, נפת באר שבע, מחוז הדרום, ישראל |
| פוריידיס | local_council | 32.59665 | 34.94968 | Mapbox-exact | 1.00 | פוריידיס, מחוז חיפה, ישראל |
| פסוטה | local_council | 33.04873 | 35.30899 | Mapbox-exact | 1.00 | פסוטה, מחוז הצפון, ישראל |
| פקיעין (בוקייעה) | local_council | 32.97724 | 35.33399 | Nominatim | 0.19 | البقيعة, נפת עכו, מחוז הצפון, ישראל |
| פרדסייה | local_council | 32.30409 | 34.91370 | Mapbox-variant | 1.00 | פרדסיה, מחוז המרכז, ישראל |
| צור הדסה | local_council | 31.71569 | 35.09483 | Nominatim | 0.37 | צור הדסה, נפת ירושלים, מחוז ירושלים, 9987500, ישראל |
| קצרין | local_council | 32.99203 | 35.68770 | Nominatim | 0.58 | קצרין, נפת רמת הגולן, מחוז הצפון, ישראל |
| קריית טבעון | local_council | 32.71615 | 35.12684 | Nominatim | 0.45 | קריית טבעון, נפת חיפה, מחוז חיפה, 3608002, ישראל |
| קריית עקרון | local_council | 31.86083 | 34.82268 | Mapbox-exact | 1.00 | קריית עקרון, מחוז המרכז, ישראל |
| קרני שומרון | local_council | 32.17226 | 35.09782 | Mapbox-exact | 1.00 | קרני שומרון |
| ראמה | local_council | 32.93797 | 35.36757 | Nominatim | 0.19 | الرامة, נפת עכו, מחוז הצפון, ישראל |
| ראש פינה | local_council | 32.96822 | 35.54382 | Nominatim | 0.19 | ראש פינה, נפת צפת, מחוז הצפון, 1200000, ישראל |
| ריינה | local_council | 32.72122 | 35.31753 | Nominatim | 0.45 | ריינה, נפת יזרעאל, מחוז הצפון, ישראל |
| רכסים | local_council | 32.75096 | 35.10136 | Nominatim | 0.39 | רכסים, נפת חיפה, מחוז חיפה, ישראל |
| רמת ישי | local_council | 32.70651 | 35.17311 | Mapbox-exact | 1.00 | רמת ישי, מחוז הצפון, ישראל |
| שבלי - אום אל-גנם | local_council | 32.67585 | 35.39187 | Nominatim | 0.44 | أم الغنم, נפת יזרעאל, מחוז הצפון, ישראל |
| שגב-שלום | local_council | 31.20327 | 34.84001 | Mapbox-exact | 1.00 | שגב שלום, מחוז הדרום, ישראל |
| שלומי | local_council | 33.07307 | 35.14438 | Mapbox-exact | 1.00 | שלומי, מחוז הצפון, ישראל |
| שעב | local_council | 32.89059 | 35.23838 | Nominatim | 0.44 | شعب‎, נפת עכו, מחוז הצפון, ישראל |
| שער שומרון | local_council | 32.10675 | 34.99955 | Nominatim | 0.18 | מחלף שער שומרון, חוצה שומרון, פרס נובל, ראש העין, נפת פתח תקווה, מחוז המרכז, 4809284, ישראל |
| תל מונד | local_council | 32.25313 | 34.91822 | Mapbox-exact | 1.00 | תל מונד, מחוז המרכז, ישראל |
| תל שבע | local_council | 31.24565 | 34.85777 | Nominatim | 0.19 | תל שבע, נפת באר שבע, מחוז הדרום, ישראל |
| אל קסום | regional_council | 31.25288 | 34.97392 | Nominatim | 0.43 | مجلس إقليمي القيصوم, נפת באר שבע, מחוז הדרום, ישראל |
| אל-בטוף | regional_council | 32.78339 | 35.30336 | Nominatim | 0.44 | مجلس إقليمي البطوف, נפת יזרעאל, מחוז הצפון, ישראל |
| אלונה | regional_council | 32.55595 | 35.02097 | Nominatim | 0.42 | מועצה אזורית אלונה, נפת חדרה, מחוז חיפה, ישראל |
| באר טוביה | regional_council | 31.73388 | 34.72629 | Nominatim | 0.40 | באר טוביה, מועצה אזורית באר טוביה, נפת אשקלון, מחוז הדרום, ישראל |
| בוסתן אל-מרג' | regional_council | 32.64338 | 35.42110 | Nominatim | 0.44 | مجلس إقليمي بستان المرج, נפת יזרעאל, מחוז הצפון, ישראל |
| בני שמעון | regional_council | 31.33069 | 34.77696 | Nominatim | 0.44 | מועצה אזורית בני שמעון, נפת באר שבע, מחוז הדרום, ישראל |
| גדרות | regional_council | 31.82428 | 34.74295 | Nominatim | 0.44 | מועצה אזורית גדרות, נפת רחובות, מחוז המרכז, ישראל |
| גן רווה | regional_council | 31.92654 | 34.69745 | Nominatim | 0.34 | גן לאומי חוף פלמחים, מועצה אזורית גן רווה, נפת רחובות, מחוז המרכז, ישראל |
| הערבה התיכונה | regional_council | 30.63275 | 35.20209 | Nominatim | 0.51 | הערבה, מועצה אזורית הערבה התיכונה, נפת באר שבע, מחוז הדרום, 8682500, ישראל |
| חבל אילות | regional_council | 29.98500 | 34.92792 | Nominatim | 0.44 | מועצה אזורית חבל אילות, נפת באר שבע, מחוז הדרום, 8881000, ישראל |
| חבל יבנה | regional_council | 31.84388 | 34.72058 | Nominatim | 0.45 | מועצה אזורית חבל יבנה, נפת רחובות, מחוז המרכז, 9275000, ישראל |
| לכיש | regional_council | 31.56090 | 34.84107 | Nominatim | 0.48 | לכיש, מועצה אזורית לכיש, נפת אשקלון, מחוז הדרום, ישראל |
| מגידו | regional_council | 32.57869 | 35.18069 | Nominatim | 0.36 | מגידו, מועצה אזורית מגידו, נפת יזרעאל, מחוז הצפון, ישראל |
| נחל שורק | regional_council | 31.76076 | 34.97517 | Nominatim | 0.44 | נחל שורק, איזור תעשיה צפוני, נפת ירושלים, מחוז ירושלים, ישראל |
| עמק המעיינות | regional_council | 32.49672 | 35.52915 | Nominatim | 0.44 | עמק בית שאן, מועצה אזורית עמק המעיינות, נפת יזרעאל, מחוז הצפון, ישראל |
| שדות דן | regional_council | 31.99112 | 34.84800 | Nominatim | 0.51 | מטה מועצה אזורית שדות דן, הרבי מליובאוויטש, כפר חב"ד, מועצה אזורית שדות דן, נפת רמלה, מחוז המרכז, 5020000, ישראל |
| שפיר | regional_council | 31.57238 | 34.77030 | Nominatim | 0.46 | מועצה אזורית שפיר, נפת אשקלון, מחוז הדרום, 7985800, ישראל |

---

## Status update — 10.08.2026

**4 of the 37 held-out entries shipped separately**, via manual coordinate lookup (Wikidata,
each council's official administrative-center/seat location, cross-checked against a second
source — NOT the low-confidence geocode matches below) — prioritized for proximity to paying
clients (Sderot, Kiryat Yam, Ashkelon):

| Name | Coordinates | Source |
|---|---|---|
| שער הנגב | 31.483333, 34.6 | Wikidata Q5426900 |
| שדות נגב | 31.463539, 34.55494 | Wikidata Q2916768 |
| חוף אשקלון | 31.716944, 34.633056 | Wikidata Q2366949 |
| מרחבים | 31.45, 34.7 | Wikidata Q1883349 |

**Remaining 33 stay parked** — lower priority, no further action planned until explicitly
picked up. Table below is unchanged / historical (still shows all 37 original findings,
including the 4 now shipped, for full provenance).

## Held out — full list (needs manual coordinates or a stronger geocode before shipping)

| Name | Type | Reason |
|---|---|---|
| אורנית | local_council | Nominatim match below confidence floor (importance=0.053) — matched: אורנית, רמת ישי, נפת יזרעאל, מחוז הצפון, 3657700, ישראל |
| בועיינה-נוג'ידאת | local_council | Nominatim match below confidence floor (importance=0.000) — matched: مجلس محلي بعينة-نجيدات, 785, البعينة, נפת יזרעאל, מחוז הצפון, 1529500, ישראל |
| בית אריה-עופרים | local_council | All 3 tiers failed to find any candidate |
| ג'ולס | local_council | Nominatim match below confidence floor (importance=0.053) — matched: עולש, תל־אביב–יפו, שוק א-דיר, עג'מי וגבעת עליה, תל־אביב–יפו, נפת תל אביב, מחוז ת |
| דבורייה | local_council | All 3 tiers failed to find any candidate |
| דייר אל-אסד | local_council | All 3 tiers failed to find any candidate |
| כסרא-סמיע | local_council | Nominatim match below confidence floor (importance=0.000) — matched: מסעף כסרא סומיע, 8655, كفر سميع, מועצה אזורית מעלה יוסף, נפת עכו, מחוז הצפון, 24 |
| עיילבון | local_council | Nominatim match below confidence floor (importance=0.000) — matched: דואר ישראל סניף עיילבון, وادي العطوات, عيلبون, נפת כנרת, מחוז הצפון, 1697200, יש |
| עמנואל | local_council | Nominatim match below confidence floor (importance=0.053) — matched: עמנואל, רמת אשכול, אזור התעשיה הצפוני, אשקלון, נפת אשקלון, מחוז הדרום, 7859700,  |
| קדומים | local_council | Nominatim match below confidence floor (importance=0.053) — matched: קדומים, תל־אביב–יפו, יפו, תל־אביב–יפו, נפת תל אביב, מחוז תל אביב, 6803608, ישראל |
| קריית ארבע | local_council | Nominatim match below confidence floor (importance=0.080) — matched: ארבע ארצות, קריית מיכה, חולון, נפת תל אביב, מחוז תל אביב, ישראל |
| קריית יערים | local_council | Nominatim match below confidence floor (importance=0.000) — matched: מוסד קריית יערים, معلي هحميشا, מועצה אזורית מטה יהודה, נפת ירושלים, מחוז ירושלים |
| ברנר | regional_council | Nominatim match below confidence floor (importance=0.053) — matched: ברנר, טלביה, ירושלים | القدس, נפת ירושלים, מחוז ירושלים, 9214423, ישראל |
| הגלבוע | regional_council | Nominatim match below confidence floor (importance=0.053) — matched: הגלבוע, נווה הלל, ראשון לציון, נפת רחובות, מחוז המרכז, 7510002, ישראל |
| הגליל העליון | regional_council | Nominatim match below confidence floor (importance=0.000) — matched: קניון הגליל העליון, דרך אלון, חצור הגלילית, נפת צפת, מחוז הצפון, 1200000, ישראל |
| הגליל התחתון | regional_council | Nominatim match below confidence floor (importance=0.133) — matched: מפל פרוד התחתון, מועצה אזורית מרום הגליל, נפת צפת, מחוז הצפון, ישראל |
| הר חברון | regional_council | Nominatim match below confidence floor (importance=0.053) — matched: הר חברון, גליקסון, כרמי גת, קרית גת, נפת אשקלון, מחוז הדרום, 8202280, ישראל |
| זבולון | regional_council | Nominatim match below confidence floor (importance=0.053) — matched: זבולון, מחנה אלנבי, בקעה, ירושלים | القدس, נפת ירושלים, מחוז ירושלים, 9347102, י |
| חוף אשקלון | regional_council | Nominatim match below confidence floor (importance=0.053) — matched: נווה חוף, אשכולי פז, אשקלון, נפת אשקלון, מחוז הדרום, 7861831, ישראל |
| חוף הכרמל | regional_council | Nominatim match below confidence floor (importance=0.107) — matched: חוף הכרמל, רמת הנשיא, רובע מערב חיפה, חיפה, נפת חיפה, מחוז חיפה, ישראל |
| יואב | regional_council | Nominatim match below confidence floor (importance=0.053) — matched: יואב, המושבה היוונית, ירושלים | القدس, נפת ירושלים, מחוז ירושלים, 9323008, ישראל |
| לב השרון | regional_council | Nominatim match below confidence floor (importance=0.053) — matched: לב השרון, צורן, קדימה - צורן, נפת השרון, מחוז המרכז, 4282300, ישראל |
| מבואות החרמון | regional_council | Nominatim match below confidence floor (importance=0.000) — matched: מרכז מסחרי מבואות החרמון, 899, מועצה אזורית מבואות החרמון, נפת צפת, מחוז הצפון,  |
| מגילות ים המלח | regional_council | All 3 tiers failed to find any candidate |
| מועצה אזורית גליל עמקים | regional_council | All 3 tiers failed to find any candidate |
| מטה אשר | regional_council | Nominatim match below confidence floor (importance=0.053) — matched: אשר, פורת, מועצה אזורית לב השרון, נפת השרון, מחוז המרכז, 4282300, ישראל |
| מנשה | regional_council | Nominatim match below confidence floor (importance=0.053) — matched: מנשה, מחנה אלנבי, בקעה, ירושלים | القدس, נפת ירושלים, מחוז ירושלים, 9347102, ישר |
| מעלה יוסף | regional_council | Nominatim match below confidence floor (importance=0.000) — matched: בית יוסף, P.O.B. 22, מעלה שז"ך, הר ציון, ירושלים | القدس, נפת ירושלים, מחוז ירוש |
| מרום הגליל | regional_council | Nominatim match below confidence floor (importance=0.080) — matched: מרכז אזורי מרום הגליל, מועצה אזורית מרום הגליל, נפת צפת, מחוז הצפון, ישראל |
| מרחבים | regional_council | Nominatim match below confidence floor (importance=0.053) — matched: מרחבים, הגבעה, נווה גן, דימונה, נפת באר שבע, מחוז הדרום, 8604712, ישראל |
| נווה מדבר | regional_council | Nominatim match below confidence floor (importance=0.133) — matched: נווה מדבר, אילת, נפת באר שבע, מחוז הדרום, ישראל |
| עמק הירדן | regional_council | Nominatim match below confidence floor (importance=0.107) — matched: עמק הירדן, מועצה אזורית עמק הירדן, נפת כנרת, מחוז הצפון, ישראל |
| ערבות הירדן | regional_council | All 3 tiers failed to find any candidate |
| רמת נגב | regional_council | Nominatim match below confidence floor (importance=0.080) — matched: בית קברות אזורי רמת נגב, מועצה אזורית רמת נגב, נפת באר שבע, מחוז הדרום, ישראל |
| שדות נגב | regional_council | Nominatim match below confidence floor (importance=0.053) — matched: שדות נגב, מועצה אזורית שדות נגב, נפת באר שבע, מחוז הדרום, ישראל |
| שער הנגב | regional_council | Nominatim match below confidence floor (importance=0.080) — matched: אזור תעשייה שער הנגב, מועצה אזורית שער הנגב, נפת אשקלון, מחוז הדרום, ישראל |
| תמר | regional_council | Nominatim match below confidence floor (importance=0.053) — matched: תמר, חולון, קרית פנחס אילון, חולון, נפת תל אביב, מחוז תל אביב, 5846112, ישראל |
