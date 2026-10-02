# authorities.population is empty for nearly half of real municipalities

02.10.2026. Surfaced as a side effect of the boundary-backfill "40 largest authorities" check: ירושלים returned `population: undefined`, `unitCount: 0` — meaning that query measured "the largest among those that happen to have the field populated," not the true largest authorities. David's follow-up request: measure the real scope of the gap.

## Measured (read-only, one query against `authorities` where `type` in [city, local_council, regional_council])

- **261** total authorities of these 3 types.
- **124** have `population` empty, `null`, or `0`.
- **60** of those 124 are `type: 'city'` — including some of Israel's largest and most consequential municipalities:

תל אביב-יפו, ירושלים, חיפה, אשדוד, פתח תקווה, ראשון לציון, באר שבע, נתניה, רמת גן, חולון, בני ברק, אשקלון (paying client), בת ים, רחובות, בית שמש, כפר סבא, הרצליה, חדרה, נהריה, לוד, רמלה, רעננה, מודיעין-מכבים-רעות, נצרת, קרית גת, קרית אתא, עפולה, טבריה, צפת, אור יהודה, אילת, כרמיאל, רמת השרון, ערד, אום אל-פחם, רהט, ביתר עילית, יקנעם עילית, דימונה, שדרות, אלעד, קרית אונו, נתיבות, קרית ים, נס ציונה, אופקים, עכו, מעלה אדומים, גבעת שמואל, הוד השרון, כפר יונה, יבנה, אריאל, טירה, טמרה, טייבה, מגדל העמק, ראש העין, נשר, wix (synthetic test record — see [[authority-boundary-bulk-backfill]]'s קרית אונו/wix note).

## Why this matters (David's framing, not an inference)

"population ריק שובר גם את דיווח ה-B2G וגם scopes ב-Arena" — an empty population field doesn't just skew a "largest authorities" ranking; it breaks B2G reporting and Arena's scoping logic for every one of these 60 real cities, independent of anything to do with boundaries.

## Status

Measured, not fixed. No code touched, no field written. This is a pre-existing data gap, surfaced incidentally — scope and root cause (never backfilled? a specific import path that skips it? depends on the authority's creation route?) not yet investigated.
