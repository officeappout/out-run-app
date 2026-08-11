#!/usr/bin/env npx tsx
/**
 * scripts/import-settlements-council-coverage-batch3.ts
 *
 * Council-coverage batch 3 — writes 158 new `authorities` child docs
 * (type=settlement) across 6 regional councils, all previously at 0
 * settlements in both picker and Firestore (location-coverage-reconciliation
 * report, bucket 4). Nominatim relation-ID → Overpass place=village/hamlet/
 * isolated_dwelling, cross-checked against each council's official member
 * list.
 *
 * Notable resolution notes:
 *   - OSM tags הגלבוע and הגליל העליון/התחתון without the ה prefix
 *     ("גלבוע", "גליל עליון", "גליל תחתון") — same council, just a
 *     transliteration quirk in OSM's own admin boundary naming.
 *   - עין חרוד איחוד / עין חרוד מאוחד (הגלבוע) — official list has 2
 *     settlements, OSM has 1 combined node. Same pattern as כפר חסידים
 *     א'/ב' in batch 1: both included, sharing the one OSM coordinate.
 *   - כנרת (עמק הירדן) — OSM only tags the adjacent "כנרת מושבה"
 *     (moshava), not the kibbutz itself; used as a close-proximity proxy
 *     coordinate for the kibbutz.
 *   - טייבה / טמרה (הגלבוע) — these are small Arab villages within
 *     Gilboa's territory, genuinely different places from the much
 *     larger, unrelated cities of the same name already in the picker
 *     (טייבה in the Sharon, טמרה in Western Galilee, ~30-60km away,
 *     confirmed via coordinates). Distinct ids assigned; the picker UI
 *     already disambiguates same-name entries by showing the parent
 *     council/city under each search result (same pattern as e.g. שפיר
 *     council + שפיר settlement).
 *   - שיבולים/שיבולת (הגליל התחתון) — HELD, not written. Confirmed via
 *     WebSearch to be a still-in-development planned settlement (350
 *     units, approved but not yet built/populated as of this research),
 *     not yet an established place — consistent with the "hold anything
 *     not yet populated" precedent (נווה תמרים in the disputed-councils
 *     report).
 *
 * Idempotent — checks for an existing doc with the same name + parentAuthorityId
 * before writing, safe to re-run.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-settlements-council-coverage-batch3.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-settlements-council-coverage-batch3.ts
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
    authorityId: 'w4ZMsmFOx0eZCt3MTWrT',
    councilName: 'הגליל התחתון',
    settlements: [
      { name: 'אילניה', lat: 32.754961, lon: 35.4074724 },
      { name: 'ארבל', lat: 32.8120793, lon: 35.4839284 },
      { name: 'בית קשת', lat: 32.7184192, lon: 35.3954738 },
      { name: 'בית רימון', lat: 32.7819472, lon: 35.3277836 },
      { name: 'גבעת אבני', lat: 32.774457, lon: 35.4383706 },
      { name: 'הודיות', lat: 32.7885329, lon: 35.435106 },
      { name: 'הזורעים', lat: 32.7457141, lon: 35.5031884 },
      { name: 'כפר זיתים', lat: 32.8106577, lon: 35.4637873 },
      { name: 'כפר חיטים', lat: 32.7993441, lon: 35.5010491 },
      { name: 'כפר קיש', lat: 32.6663613, lon: 35.4487944 },
      { name: 'לביא', lat: 32.7872253, lon: 35.4416661 },
      { name: 'מסד', lat: 32.8433385, lon: 35.4229425 },
      { name: 'מצפה', lat: 32.7902724, lon: 35.5085407 },
      { name: 'מצפה נטופה', lat: 32.8029167, lon: 35.3846403 },
      { name: 'שדה אילן', lat: 32.7493317, lon: 35.4226101 },
      { name: 'שדמות דבורה', lat: 32.6954933, lon: 35.4374472 },
      { name: 'שרונה', lat: 32.7254465, lon: 35.4669505 },
    ],
  },
  {
    authorityId: 'MipsYOQoSCMoX8551L0r',
    councilName: 'עמק הירדן',
    settlements: [
      { name: 'אלומות', lat: 32.7069863, lon: 35.5462845 },
      { name: 'אלמגור', lat: 32.9139417, lon: 35.603248 },
      { name: 'אפיקים', lat: 32.681369, lon: 35.5783318 },
      { name: 'אשדות יעקב איחוד', lat: 32.6581629, lon: 35.5811432 },
      { name: 'אשדות יעקב מאוחד', lat: 32.662065, lon: 35.5820015 },
      { name: 'בית זרע', lat: 32.6882909, lon: 35.5733669 },
      { name: 'גינוסר', lat: 32.8476404, lon: 35.5236258 },
      { name: 'דגניה א\'', lat: 32.7084791, lon: 35.5748582 },
      { name: 'דגניה ב\'', lat: 32.6999198, lon: 35.5747095 },
      { name: 'האון', lat: 32.7269806, lon: 35.6236405 },
      { name: 'חוקוק', lat: 32.8800375, lon: 35.4944564 },
      { name: 'כנרת', lat: 32.7231985, lon: 35.56444 },
      { name: 'מסדה', lat: 32.683069, lon: 35.5987945 },
      { name: 'מעגן', lat: 32.706731, lon: 35.6010794 },
      { name: 'עין גב', lat: 32.7811125, lon: 35.6388846 },
      { name: 'פוריה - כפר עבודה', lat: 32.7187697, lon: 35.5474069 },
      { name: 'פוריה - נווה עובד', lat: 32.7436659, lon: 35.5376169 },
      { name: 'פוריה עילית', lat: 32.7322318, lon: 35.5457217 },
      { name: 'קבוצת כנרת', lat: 32.7138728, lon: 35.5625249 },
      { name: 'רביד', lat: 32.8515851, lon: 35.4634262 },
      { name: 'שער הגולן', lat: 32.6858143, lon: 35.6042877 },
      { name: 'תל קציר', lat: 32.7051904, lon: 35.6178217 },
    ],
  },
  {
    authorityId: 'ASDZghxSiHISeBIJSkw9',
    councilName: 'עמק המעיינות',
    settlements: [
      { name: 'בית יוסף', lat: 32.5588132, lon: 35.5523146 },
      { name: 'גשר', lat: 32.6206515, lon: 35.5520809 },
      { name: 'חמדיה', lat: 32.5201037, lon: 35.5203765 },
      { name: 'טירת צבי', lat: 32.4218582, lon: 35.5279708 },
      { name: 'ירדנה', lat: 32.5644389, lon: 35.5645775 },
      { name: 'כפר רופין', lat: 32.4581631, lon: 35.556773 },
      { name: 'מיטל', lat: 32.4365848, lon: 35.4174817 },
      { name: 'מירב', lat: 32.4533873, lon: 35.4215378 },
      { name: 'מנחמיה', lat: 32.6670217, lon: 35.5555869 },
      { name: 'מסילות', lat: 32.495833, lon: 35.4750001 },
      { name: 'מעוז חיים', lat: 32.4933804, lon: 35.5512649 },
      { name: 'מעלה גלבוע', lat: 32.4780173, lon: 35.4174978 },
      { name: 'נווה אור', lat: 32.5886496, lon: 35.5531494 },
      { name: 'נווה איתן', lat: 32.4920626, lon: 35.5327856 },
      { name: 'ניר דוד', lat: 32.5027374, lon: 35.4567497 },
      { name: 'עין הנצי"ב', lat: 32.4697596, lon: 35.5014843 },
      { name: 'רוויה', lat: 32.4492455, lon: 35.4727211 },
      { name: 'רחוב', lat: 32.4497108, lon: 35.4900246 },
      { name: 'רשפים', lat: 32.4818532, lon: 35.4775438 },
      { name: 'שדה אליהו', lat: 32.4405328, lon: 35.5149917 },
      { name: 'שדה נחום', lat: 32.5271296, lon: 35.4816414 },
      { name: 'שדי תרומות', lat: 32.441356, lon: 35.4854373 },
      { name: 'שלוחות', lat: 32.4718472, lon: 35.4819367 },
      { name: 'שלפים', lat: 32.4762995, lon: 35.4772287 },
      { name: 'תל תאומים', lat: 32.4424193, lon: 35.4964482 },
    ],
  },
  {
    authorityId: 'R7aq9jBkeq822zu18dc2',
    councilName: 'הגלבוע',
    settlements: [
      { name: 'בית אלפא', lat: 32.5160003, lon: 35.4312857 },
      { name: 'בית השיטה', lat: 32.5510774, lon: 35.4382178 },
      { name: 'גבע', lat: 32.5663362, lon: 35.3715486 },
      { name: 'חפציבה', lat: 32.5181674, lon: 35.4258324 },
      { name: 'יזרעאל', lat: 32.5623514, lon: 35.32134 },
      { name: 'עין חרוד איחוד', lat: 32.5592184, lon: 35.393578 },
      { name: 'עין חרוד מאוחד', lat: 32.5592184, lon: 35.393578 },
      { name: 'תל יוסף', lat: 32.5561076, lon: 35.3996519 },
      { name: 'אביטל', lat: 32.5578557, lon: 35.3063551 },
      { name: 'אדירים', lat: 32.5490732, lon: 35.2711676 },
      { name: 'ברק', lat: 32.5424671, lon: 35.2653811 },
      { name: 'גדיש', lat: 32.5588503, lon: 35.2448954 },
      { name: 'דבורה', lat: 32.553108, lon: 35.2635109 },
      { name: 'כפר יחזקאל', lat: 32.5682864, lon: 35.3624076 },
      { name: 'מגן שאול', lat: 32.5206793, lon: 35.3067307 },
      { name: 'מולדת', lat: 32.5860767, lon: 35.4401307 },
      { name: 'מיטב', lat: 32.5457376, lon: 35.301291 },
      { name: 'מלאה', lat: 32.5634638, lon: 35.2359604 },
      { name: 'ניר יפה', lat: 32.5696288, lon: 35.2452983 },
      { name: 'פרזון', lat: 32.5454121, lon: 35.3111616 },
      { name: 'רם און', lat: 32.5272379, lon: 35.259032 },
      { name: 'רמת צבי', lat: 32.5915062, lon: 35.4145248 },
      { name: 'גדעונה', lat: 32.5487479, lon: 35.359246 },
      { name: 'גן נר', lat: 32.5308688, lon: 35.3391118 },
      { name: 'מרכז אומן', lat: 32.5641159, lon: 35.2422242 },
      { name: 'מרכז חבר', lat: 32.5487129, lon: 35.2643296 },
      { name: 'מרכז יעל', lat: 32.5519235, lon: 35.3079001 },
      { name: 'נורית', lat: 32.542654, lon: 35.3560394 },
      { name: 'טייבה', lat: 32.6032121, lon: 35.4447957 },
      { name: 'טמרה', lat: 32.6343499, lon: 35.4042528 },
      { name: 'מוקייבלה', lat: 32.5140208, lon: 35.2976327 },
      { name: 'נאעורה', lat: 32.6140155, lon: 35.3903478 },
      { name: 'סנדלה', lat: 32.5231227, lon: 35.3237725 },
    ],
  },
  {
    authorityId: 'Ms3xgneLGgmZzYTQdHke',
    councilName: 'הגליל העליון',
    settlements: [
      { name: 'איילת השחר', lat: 33.0215976, lon: 35.5759521 },
      { name: 'ברעם', lat: 33.0590837, lon: 35.433945 },
      { name: 'גדות', lat: 33.0180702, lon: 35.6189207 },
      { name: 'גונן', lat: 33.1238763, lon: 35.6462866 },
      { name: 'דן', lat: 33.2400913, lon: 35.6530878 },
      { name: 'דפנה', lat: 33.2303715, lon: 35.6392634 },
      { name: 'הגושרים', lat: 33.2211258, lon: 35.6230745 },
      { name: 'חולתה', lat: 33.0511117, lon: 35.6091616 },
      { name: 'יפתח', lat: 33.1286135, lon: 35.5519473 },
      { name: 'יראון', lat: 33.0777838, lon: 35.455753 },
      { name: 'כפר בלום', lat: 33.1723656, lon: 35.6101218 },
      { name: 'כפר גלעדי', lat: 33.2417843, lon: 35.5749608 },
      { name: 'כפר הנשיא', lat: 32.9748875, lon: 35.6038283 },
      { name: 'כפר סאלד', lat: 33.1946879, lon: 35.657851 },
      { name: 'להבות הבשן', lat: 33.1406178, lon: 35.646246 },
      { name: 'מחניים', lat: 32.9886405, lon: 35.570735 },
      { name: 'מלכיה', lat: 33.0992486, lon: 35.5116985 },
      { name: 'מנרה', lat: 33.195939, lon: 35.5446083 },
      { name: 'מעיין ברוך', lat: 33.2397998, lon: 35.6078756 },
      { name: 'משגב עם', lat: 33.2477885, lon: 35.5486672 },
      { name: 'נאות מרדכי', lat: 33.160576, lon: 35.5965774 },
      { name: 'סאסא', lat: 33.026907, lon: 35.39499 },
      { name: 'עמיעד', lat: 32.9262991, lon: 35.5412309 },
      { name: 'עמיר', lat: 33.1787718, lon: 35.620776 },
      { name: 'צבעון', lat: 33.0259411, lon: 35.4165978 },
      { name: 'קדרים', lat: 32.8984224, lon: 35.4737461 },
      { name: 'שדה נחמיה', lat: 33.1869061, lon: 35.6245075 },
      { name: 'שמיר', lat: 33.163887, lon: 35.6591721 },
      { name: 'שניר', lat: 33.2410034, lon: 35.6781947 },
    ],
  },
  {
    authorityId: 'KUMBL6qyjYNInlzki3wj',
    councilName: 'מטה אשר',
    settlements: [
      { name: 'אדמית', lat: 33.0795856, lon: 35.2102543 },
      { name: 'אחיהוד', lat: 32.908312, lon: 35.1723837 },
      { name: 'אילון', lat: 33.0633456, lon: 35.2197473 },
      { name: 'אפק', lat: 32.8401655, lon: 35.1278912 },
      { name: 'אשרת', lat: 32.9717328, lon: 35.1564958 },
      { name: 'בוסתן הגליל', lat: 32.9505232, lon: 35.0817793 },
      { name: 'בית העמק', lat: 32.9704922, lon: 35.1461366 },
      { name: 'בן עמי', lat: 33.0042191, lon: 35.1241783 },
      { name: 'בצת', lat: 33.0708449, lon: 35.136107 },
      { name: 'געתון', lat: 33.0057124, lon: 35.2137501 },
      { name: 'גשר הזיו', lat: 33.0394679, lon: 35.1109814 },
      { name: 'חניתה', lat: 33.0874108, lon: 35.1733471 },
      { name: 'יחיעם', lat: 32.9967146, lon: 35.2204512 },
      { name: 'יסעור', lat: 32.9010935, lon: 35.1663465 },
      { name: 'כברי', lat: 33.0214987, lon: 35.1485013 },
      { name: 'כליל', lat: 32.9855303, lon: 35.2004778 },
      { name: 'כפר מסריק', lat: 32.8910595, lon: 35.1001125 },
      { name: 'לוחמי הגטאות', lat: 32.9628515, lon: 35.097375 },
      { name: 'לימן', lat: 33.0595032, lon: 35.1130278 },
      { name: 'מצובה', lat: 33.0629442, lon: 35.1570974 },
      { name: 'נס עמים', lat: 32.9656707, lon: 35.1211467 },
      { name: 'נתיב השיירה', lat: 32.9928246, lon: 35.1355166 },
      { name: 'סער', lat: 33.0293646, lon: 35.1093238 },
      { name: 'עברון', lat: 32.9926009, lon: 35.1002025 },
      { name: 'עין המפרץ', lat: 32.9036151, lon: 35.0961117 },
      { name: 'עמקה', lat: 32.9792441, lon: 35.1642671 },
      { name: 'ערב אל-עראמשה', lat: 33.0885693, lon: 35.2265036 },
      { name: 'ראש הנקרה', lat: 33.0857479, lon: 35.1150819 },
      { name: 'רגבה', lat: 32.9779642, lon: 35.0996706 },
      { name: 'שבי ציון', lat: 32.980597, lon: 35.0832938 },
      { name: 'שיח\' דנון', lat: 32.9943175, lon: 35.1479211 },
      { name: 'שמרת', lat: 32.9504776, lon: 35.0965233 },
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
