#!/usr/bin/env npx tsx
/**
 * scripts/import-settlements-council-coverage-batch4.ts
 *
 * Council-coverage batch 4 (FINAL) — writes 133 new `authorities` child docs
 * (type=settlement) across the 6 disputed regional councils held back from
 * batches 1-3 for deliberate per-council review (location-coverage-
 * reconciliation report, bucket 4). Uniform rule applied: each council's
 * official site is the authority; only recognized residential member
 * settlements included; non-residential institutions and unrecognized/
 * not-yet-populated outposts excluded. Completes all 54 regional councils.
 *
 * Per-council resolution notes:
 *   - הר חברון (22) — official-site 22-name list (includes חירן; excludes
 *     יונדב, מצפה אשתמוע). West Bank council with poor OSM administrative-
 *     boundary tagging — resolved via Overpass bbox fallback + individual
 *     Wikipedia-infobox geocoding for stragglers (אפקה, חירן, תלם). חירן
 *     used a "לב יתיר" proxy coordinate (settlement-core group's staging
 *     location, not yet a stable independent node).
 *   - ערבות הירדן (23) — official 21 + בתרון + נווה גדיד (both included:
 *     recognized status + populated). Excludes גבעת סלעית (neighborhood of
 *     already-counted מחולה, not independent) and תמרה (בהקמה, not yet
 *     built). Same bbox + individual-geocoding fallback as הר חברון.
 *   - חוף הכרמל (25) — official list minus 2 excluded institutions
 *     (ימין אורד youth-village/school, כפר צבי סיטרין school — OSM name
 *     "צבי סטרין"). עין הוד / עין חוד are two distinct real settlements,
 *     each with its own OSM node — not a merge case.
 *   - מנשה (24) — includes שער מנשה (OSM only tags it as a hospital node —
 *     used anyway per explicit approval, it's the recognized locality's
 *     only geocoded point); excludes גבעת חביבה (educational campus, not
 *     residential — not on the official list at all).
 *   - רמת הנגב (15) — official list minus נווה תמרים (under-development,
 *     not populated). קדש ברנע resolved as OSM's "ניצני סיני" (same place,
 *     renamed). מחנה טלי (Ramon Airbase family housing) resolved via its
 *     own Wikipedia infobox — not in Overpass place=village results.
 *   - מרום הגליל (24) — official 24-name list; drops ענבר (Wikipedia-only,
 *     not on the official list). ספסופה resolved as OSM's "כפר חושן" (same
 *     node, alternate/older name).
 *   - No same-name/one-node situations recurred in batch 4 (unlike כפר
 *     חסידים א׳/ב׳ in batch 1, עין חרוד איחוד/מאוחד in batch 3).
 *
 * Cross-batch collision check (id + coordinate-proximity vs. batches 1-3 +
 * pre-existing picker): 0 collisions.
 *
 * Idempotent — checks for an existing doc with the same name + parentAuthorityId
 * before writing, safe to re-run.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-settlements-council-coverage-batch4.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-settlements-council-coverage-batch4.ts
 */

import * as admin from 'firebase-admin';

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
  console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY not set');
  process.exit(1);
}
const key = JSON.parse(rawKey);
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
}
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');

const COUNCILS: { authorityId: string; councilName: string; settlements: { name: string; lat: number; lon: number }[] }[] = [
  {
    authorityId: '34R4AdquTOa64CH6Wgka',
    councilName: 'הר חברון',
    settlements: [
      { name: 'אשכולות', lat: 31.3911793, lon: 34.9047437 },
      { name: 'סנסנה', lat: 31.3629179, lon: 34.9034356 },
      { name: 'בית חגי', lat: 31.4933935, lon: 35.08041 },
      { name: 'בית יתיר', lat: 31.3655236, lon: 35.1116704 },
      { name: 'נגוהות', lat: 31.4932325, lon: 34.9833636 },
      { name: 'שמעה', lat: 31.3875953, lon: 35.0133113 },
      { name: 'טנא-עומרים', lat: 31.3756971, lon: 34.9572511 },
      { name: 'מצפה יאיר', lat: 31.3832648, lon: 35.1347874 },
      { name: 'עשהאל', lat: 31.3734464, lon: 35.0437618 },
      { name: 'כרמל', lat: 31.4308739, lon: 35.1832962 },
      { name: 'מעלה חבר', lat: 31.4858455, lon: 35.1651529 },
      { name: 'עתניאל', lat: 31.4392491, lon: 35.0286222 },
      { name: 'מצפה זיו', lat: 31.4849764, lon: 35.1447518 },
      { name: 'אביגיל', lat: 31.4027581, lon: 35.1418694 },
      { name: 'מעון', lat: 31.4139904, lon: 35.1628587 },
      { name: 'אדורה', lat: 31.5518033, lon: 35.0187123 },
      { name: 'שני ליבנה', lat: 31.3555811, lon: 35.0698585 },
      { name: 'אדורים', lat: 31.4845045, lon: 35.0449362 },
      { name: 'סוסיא', lat: 31.3919471, lon: 35.1135364 },
      { name: 'אפקה', lat: 31.4686505, lon: 35.0373191 },
      { name: 'חירן', lat: 31.3475146, lon: 35.0605823 },
      { name: 'תלם', lat: 31.5644622630693, lon: 35.0309620389012 },
    ],
  },
  {
    authorityId: '48fifj5HW65TF7HfisRi',
    councilName: 'ערבות הירדן',
    settlements: [
      { name: 'פצאל', lat: 32.0438358, lon: 35.4422455 },
      { name: 'תומר', lat: 32.018692, lon: 35.4391975 },
      { name: 'ייטב', lat: 31.9475343, lon: 35.4241469 },
      { name: 'נעמה', lat: 31.9067581, lon: 35.4672083 },
      { name: 'יפית', lat: 32.0623164, lon: 35.4743044 },
      { name: 'נערן', lat: 31.9669228, lon: 35.4549345 },
      { name: 'נתיב הגדוד', lat: 31.9882551, lon: 35.445064 },
      { name: 'משואה', lat: 32.1128716, lon: 35.4920492 },
      { name: 'גלגל', lat: 31.9997285, lon: 35.4452079 },
      { name: 'חמרה', lat: 32.1994662, lon: 35.4366934 },
      { name: 'מכורה', lat: 32.164953, lon: 35.4230289 },
      { name: 'ארגמן', lat: 32.1728633, lon: 35.5223292 },
      { name: 'בקעות', lat: 32.2428392, lon: 35.4536973 },
      { name: 'רועי', lat: 32.2476195, lon: 35.4885533 },
      { name: 'חמדת', lat: 32.2513954, lon: 35.5263151 },
      { name: 'משכיות', lat: 32.3173084, lon: 35.502525 },
      { name: 'רותם', lat: 32.3364933, lon: 35.5187999 },
      { name: 'שדמות מחולה', lat: 32.3472735, lon: 35.5326341 },
      { name: 'גיתית', lat: 32.101492, lon: 35.396158 },
      { name: 'מבואות יריחו', lat: 31.9080303, lon: 35.4171007 },
      { name: 'מחולה', lat: 32.3651907836641, lon: 35.5150110030146 },
      { name: 'בתרון', lat: 32.223801366469, lon: 35.54062623696 },
      { name: 'נווה גדיד', lat: 32.122248, lon: 35.487647 },
    ],
  },
  {
    authorityId: 'QTT37abFKCGdQHcc6gF6',
    councilName: 'חוף הכרמל',
    settlements: [
      { name: 'בית אורן', lat: 32.730556, lon: 35.005556 },
      { name: 'בית חנניה', lat: 32.5282617, lon: 34.92503 },
      { name: 'בת שלמה', lat: 32.5994386, lon: 35.0029516 },
      { name: 'גבע כרמל', lat: 32.6636235, lon: 34.9549687 },
      { name: 'דור', lat: 32.6075668, lon: 34.9230461 },
      { name: 'הבונים', lat: 32.6371881, lon: 34.9327996 },
      { name: 'החותרים', lat: 32.7514976, lon: 34.9567795 },
      { name: 'כפר גלים', lat: 32.7665815, lon: 34.9593308 },
      { name: 'כרם מהר"ל', lat: 32.6461207, lon: 34.9899618 },
      { name: 'מגדים', lat: 32.7290313, lon: 34.9619508 },
      { name: 'מעגן מיכאל', lat: 32.5553209, lon: 34.9166572 },
      { name: 'מעיין צבי', lat: 32.5683241, lon: 34.9400745 },
      { name: 'נוה ים', lat: 32.6791606, lon: 34.9318092 },
      { name: 'נחשולים', lat: 32.6138484, lon: 34.92063 },
      { name: 'ניר עציון', lat: 32.6975838, lon: 34.9936059 },
      { name: 'עופר', lat: 32.6220894, lon: 34.9828033 },
      { name: 'עין איילה', lat: 32.6287327, lon: 34.9454021 },
      { name: 'עין הוד', lat: 32.7005017, lon: 34.9825964 },
      { name: 'עין חוד', lat: 32.6915351, lon: 34.9995301 },
      { name: 'עין כרמל', lat: 32.6770088, lon: 34.9531216 },
      { name: 'עתלית', lat: 32.690712, lon: 34.9422744 },
      { name: 'צרופה', lat: 32.6482373, lon: 34.9480485 },
      { name: 'קיסריה', lat: 32.5114971, lon: 34.9057861 },
      { name: 'שדות ים', lat: 32.4921593, lon: 34.8933053 },
      { name: 'שפיה', lat: 32.5914537, lon: 34.9709102 },
    ],
  },
  {
    authorityId: '5pyEfgFR0hj8Vyf6Va76',
    councilName: 'מנשה',
    settlements: [
      { name: 'אום אל קוטוף', lat: 32.468056, lon: 35.058889 },
      { name: 'אלוני יצחק', lat: 32.5106111, lon: 35.003597 },
      { name: 'אל עריאן', lat: 32.4979223, lon: 35.1255776 },
      { name: 'ברקאי', lat: 32.475134, lon: 35.0300253 },
      { name: 'גן השומרון', lat: 32.4639095, lon: 34.9984491 },
      { name: 'גן שמואל', lat: 32.451832, lon: 34.9498546 },
      { name: 'כפר גליקסון', lat: 32.504959, lon: 35.004799 },
      { name: 'כפר פינס', lat: 32.4838889, lon: 35.0034441 },
      { name: 'להבות חביבה', lat: 32.3958732, lon: 35.0103906 },
      { name: 'מאור', lat: 32.4239237, lon: 35.006394 },
      { name: 'מגל', lat: 32.38522, lon: 35.0351579 },
      { name: 'מייסר', lat: 32.4451045, lon: 35.0404881 },
      { name: 'מי עמי', lat: 32.5046656, lon: 35.1465087 },
      { name: 'מענית', lat: 32.4560127, lon: 35.0280805 },
      { name: 'מצפה אילן', lat: 32.461529, lon: 35.0691813 },
      { name: 'מצר', lat: 32.4404285, lon: 35.0476791 },
      { name: 'משמרות', lat: 32.4874752, lon: 34.9850386 },
      { name: 'עין עירון', lat: 32.4835067, lon: 35.0098921 },
      { name: 'עין שמר', lat: 32.4629224, lon: 35.0073711 },
      { name: 'קציר', lat: 32.4886297, lon: 35.1016891 },
      { name: 'רגבים', lat: 32.5240949, lon: 35.0345429 },
      { name: 'שדה יצחק', lat: 32.4051186, lon: 34.9938162 },
      { name: 'שער מנשה', lat: 32.4471301, lon: 35.0156963 },
      { name: 'תלמי אלעזר', lat: 32.4431655, lon: 34.9737349 },
    ],
  },
  {
    authorityId: 'itl5LciDnITLg5U1oSLA',
    councilName: 'רמת הנגב',
    settlements: [
      { name: 'אשלים', lat: 30.9638905, lon: 34.7002742 },
      { name: 'באר מילכה', lat: 30.9328457, lon: 34.4070405 },
      { name: 'טללים', lat: 30.9919058, lon: 34.7700732 },
      { name: 'כמהין', lat: 30.9100139, lon: 34.4310272 },
      { name: 'כפר רתמים', lat: 31.0539263, lon: 34.690428 },
      { name: 'מדרשת בן גוריון', lat: 30.8515927, lon: 34.7825759 },
      { name: 'מחנה טלי', lat: 30.77611, lon: 34.66667 },
      { name: 'מרחב עם', lat: 30.8886192, lon: 34.828885 },
      { name: 'משאבי שדה', lat: 31.0032681, lon: 34.7861244 },
      { name: 'ניצנה', lat: 30.8863231, lon: 34.421866 },
      { name: 'עזוז', lat: 30.7916672, lon: 34.4722219 },
      { name: 'קדש ברנע', lat: 30.903912, lon: 34.3968932 },
      { name: 'שדה בוקר', lat: 30.8737395, lon: 34.7925947 },
      { name: 'שיזף', lat: 31.0016511, lon: 34.7654842 },
      { name: 'רביבים', lat: 31.0431631, lon: 34.7207022 },
    ],
  },
  {
    authorityId: 'goZznzyUjIw7dBeOyzz7',
    councilName: 'מרום הגליל',
    settlements: [
      { name: 'אביבים', lat: 33.0886777, lon: 35.4729375 },
      { name: 'אור הגנוז', lat: 33.005079, lon: 35.4475065 },
      { name: 'אמירים', lat: 32.9374962, lon: 35.4499969 },
      { name: 'ביריה', lat: 32.9775883, lon: 35.5006493 },
      { name: 'בר יוחאי', lat: 32.9970032, lon: 35.4481169 },
      { name: 'דובב', lat: 33.0524574, lon: 35.4074874 },
      { name: 'דלתון', lat: 33.0166712, lon: 35.4891906 },
      { name: 'חזון', lat: 32.9067724, lon: 35.394977 },
      { name: 'טפחות', lat: 32.8684279, lon: 35.4238096 },
      { name: 'כלנית', lat: 32.8749932, lon: 35.4527711 },
      { name: 'כפר חנניה', lat: 32.9161093, lon: 35.4241459 },
      { name: 'כפר שמאי', lat: 32.9574173, lon: 35.4579027 },
      { name: 'כרם בן זימרה', lat: 33.0388862, lon: 35.468049 },
      { name: 'ליבנים', lat: 32.8639423, lon: 35.4935744 },
      { name: 'מירון', lat: 32.9886409, lon: 35.440278 },
      { name: 'ספסופה', lat: 33.0108471, lon: 35.4386655 },
      { name: 'עין אל אסד', lat: 32.9402935, lon: 35.4010052 },
      { name: 'עלמה', lat: 33.0521283, lon: 35.4988072 },
      { name: 'עמוקה', lat: 32.9979671, lon: 35.5242497 },
      { name: 'פרוד', lat: 32.9333327, lon: 35.4333299 },
      { name: 'ריחאניה', lat: 33.0482032, lon: 35.4872846 },
      { name: 'שזור', lat: 32.9327346, lon: 35.3535015 },
      { name: 'שפר', lat: 32.9433182, lon: 35.4354282 },
      { name: 'קדיתא', lat: 33.0066179, lon: 35.4667726 },
    ],
  },
];

async function main() {
  const totalPlanned = COUNCILS.reduce((sum, c) => sum + c.settlements.length, 0);
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Importing up to ${totalPlanned} settlements across ${COUNCILS.length} regional councils ──`);

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const council of COUNCILS) {
    const existingSnap = await db.collection('authorities')
      .where('parentAuthorityId', '==', council.authorityId)
      .get();
    const existingNames = new Set(existingSnap.docs.map((d) => d.data().name));
    console.log(`\n${council.councilName} (${council.authorityId}) — ${existingNames.size} existing children`);

    for (const s of council.settlements) {
      if (existingNames.has(s.name)) {
        console.log(`  ⏭  SKIP (already exists): ${s.name}`);
        totalSkipped++;
        continue;
      }

      const doc = {
        name: s.name,
        type: 'settlement' as const,
        parentAuthorityId: council.authorityId,
        logoUrl: null,
        managerIds: [] as string[],
        userCount: 0,
        status: 'inactive' as const,
        isActiveClient: false,
        coordinates: { lat: s.lat, lng: s.lon },
        pipelineStatus: 'draft' as const,
        unitCount: 0,
        hierarchyLevel: 2,
        vertical: 'municipal' as const,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (DRY_RUN) {
        console.log(`  WOULD CREATE: ${s.name} @ ${s.lat},${s.lon}`);
      } else {
        const ref = await db.collection('authorities').add(doc);
        console.log(`  ✓  CREATED: ${s.name} → ${ref.id}`);
      }
      totalCreated++;
    }
  }

  console.log(`\n${DRY_RUN ? 'Would create' : 'Created'}: ${totalCreated}, Skipped: ${totalSkipped}`);
}

main().catch((err) => {
  console.error('💥', err);
  process.exit(1);
});
