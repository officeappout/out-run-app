#!/usr/bin/env npx tsx
/**
 * scripts/import-settlements-phase-b-round2-3.ts
 *
 * Phase B round 2+3 — writes 191 new `authorities` child docs (type=settlement)
 * across 17 regional councils, sourced from OSM Overpass (place=village/hamlet/
 * isolated_dwelling) resolved via boundary relation lookup where the direct
 * area-name query failed, plus manual desert-settlement additions and
 * official-list cross-checks (Gderot, Al-Kasum) to strip boundary-leaked /
 * unrecognized entries. Full research trail: this session's Phase B work.
 *
 * Excluded per David's explicit review (NOT in this payload):
 *   - Unrecognized Bedouin villages (Bnei Shimon: אל-עראקיב, אבו עיסא, etc.)
 *   - Boundary-leakage entries belonging to a different council (Gilat/Sansana
 *     → Merhavim/Har Hevron; Zalafa/Salem → Ma'ale Iron; Dahmash near Lod)
 *   - גן רווה — Overpass/Nominatim resolution failed twice, unresolved, held out
 *
 * Idempotent — checks for an existing doc with the same name + parentAuthorityId
 * before writing, safe to re-run.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-settlements-phase-b-round2-3.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-settlements-phase-b-round2-3.ts
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
    authorityId: 'BH5UV7YK0vyq36KmyEcp',
    councilName: 'אל קסום',
    settlements: [
      { name: 'סעווה', lat: 31.2621229, lon: 34.9696398 },
      { name: 'א-סייד', lat: 31.2832614, lon: 34.9130197 },
      { name: 'כוחלה', lat: 31.2853735, lon: 35.0574735 },
      { name: 'אום בטין', lat: 31.2757636, lon: 34.8838656 },
      { name: 'תראבין א-צאנע', lat: 31.2805329, lon: 34.8737025 },
      { name: 'מכחול', lat: 31.2883138, lon: 35.0753893 },
      { name: 'דריג\'את', lat: 31.3005896, lon: 35.0753744 },
    ],
  },
  {
    authorityId: 'D9HJQHNitVw1bM2I685t',
    councilName: 'אל-בטוף',
    settlements: [
      { name: 'רומת אל-הייב', lat: 32.7784833, lon: 35.305222 },
      { name: 'רומאנה', lat: 32.7881972, lon: 35.3111645 },
      { name: 'עוזייר', lat: 32.7900696, lon: 35.3271751 },
      { name: 'ואדי אל-חמאם', lat: 32.8295555, lon: 35.4903983 },
    ],
  },
  {
    authorityId: 'HRF8LBEFS17y34fzsOMW',
    councilName: 'אלונה',
    settlements: [
      { name: 'עמיקם', lat: 32.563865, lon: 35.020477 },
      { name: 'גבעת ניל"י', lat: 32.547269, lon: 35.042343 },
      { name: 'אביאל', lat: 32.53251, lon: 34.993391 },
    ],
  },
  {
    authorityId: 'Eea1FXz6FQ7y7mOCPDSV',
    councilName: 'בוסתן אל-מרג\'',
    settlements: [
      { name: 'כפר מצר', lat: 32.6452471, lon: 35.4228553 },
      { name: 'נין', lat: 32.6307267, lon: 35.3488686 },
      { name: 'דחי', lat: 32.6203995, lon: 35.3449947 },
      { name: 'סולם', lat: 32.6061864, lon: 35.3338887 },
    ],
  },
  {
    authorityId: 'jBMboivtZJYRlrIepvCw',
    councilName: 'בני שמעון',
    settlements: [
      { name: 'בית קמה', lat: 31.447541, lon: 34.762287 },
      { name: 'דביר', lat: 31.413474, lon: 34.823263 },
      { name: 'חצרים', lat: 31.24041, lon: 34.715074 },
      { name: 'כרמים', lat: 31.335627, lon: 34.919009 },
      { name: 'להב', lat: 31.379421, lon: 34.870106 },
      { name: 'משמר הנגב', lat: 31.364128, lon: 34.71868 },
      { name: 'שובל', lat: 31.414318, lon: 34.743767 },
      { name: 'שומריה', lat: 31.43177, lon: 34.885779 },
      { name: 'ברוש', lat: 31.370654, lon: 34.635086 },
      { name: 'נבטים', lat: 31.222537, lon: 34.880798 },
      { name: 'תאשור', lat: 31.371871, lon: 34.643707 },
      { name: 'תדהר', lat: 31.379004, lon: 34.628454 },
      { name: 'גבעות בר', lat: 31.355626, lon: 34.759223 },
    ],
  },
  {
    authorityId: '5K1Xdouqk5VAb8Dir53l',
    councilName: 'גדרות',
    settlements: [
      { name: 'עשרת', lat: 31.8247948, lon: 34.7455804 },
      { name: 'משגב דב', lat: 31.819884, lon: 34.7385694 },
      { name: 'שדמה', lat: 31.8330746, lon: 34.7403755 },
      { name: 'מישר', lat: 31.8175349, lon: 34.7531216 },
      { name: 'כפר מרדכי', lat: 31.8310864, lon: 34.7561791 },
      { name: 'כפר אביב', lat: 31.8318165, lon: 34.7213367 },
      { name: 'גן הדרום', lat: 31.803614, lon: 34.6997994 },
    ],
  },
  {
    authorityId: 'yV2g5NWjvsd9u3NXWyCU',
    councilName: 'הערבה התיכונה',
    settlements: [
      { name: 'ספיר', lat: 30.614095, lon: 35.184641 },
      { name: 'עין יהב', lat: 30.656902, lon: 35.238175 },
      { name: 'צופר', lat: 30.558623, lon: 35.180143 },
      { name: 'צוקים', lat: 30.491024, lon: 35.165864 },
      { name: 'חצבה', lat: 30.767716, lon: 35.279625 },
      { name: 'עין חצבה', lat: 30.798047, lon: 35.24601 },
      { name: 'עיר אובות', lat: 30.81178, lon: 35.246985 },
      { name: 'עידן', lat: 30.806034, lon: 35.299403 },
      { name: 'פארן', lat: 30.362613, lon: 35.153897 },
    ],
  },
  {
    authorityId: 'sL6Z8bHngXH9HhisVqon',
    councilName: 'חבל אילות',
    settlements: [
      { name: 'שחרות', lat: 29.903692, lon: 34.99922 },
      { name: 'נאות סמדר', lat: 30.048644, lon: 35.025735 },
      { name: 'נווה חריף', lat: 30.038953, lon: 35.03587 },
      { name: 'קטורה', lat: 29.969639, lon: 35.061049 },
      { name: 'גרופית', lat: 29.941716, lon: 35.064205 },
      { name: 'לוטן', lat: 29.986781, lon: 35.088644 },
      { name: 'יטבתה', lat: 29.89592, lon: 35.059622 },
      { name: 'סמר', lat: 29.833374, lon: 35.022744 },
      { name: 'יהל', lat: 30.081942, lon: 35.128769 },
      { name: 'אליפז', lat: 29.796429, lon: 35.01194 },
      { name: 'שיטים', lat: 30.176767, lon: 35.016484 },
      { name: 'נח"ל שיטים', lat: 30.176933, lon: 35.016453 },
      { name: 'חוות ע\'רנדל', lat: 30.114857, lon: 35.151179 },
      { name: 'באר אורה', lat: 29.710175, lon: 34.986604 },
      { name: 'אילות', lat: 29.581244, lon: 34.962663 },
    ],
  },
  {
    authorityId: 'x8Vets9PdgNqPIwABQvt',
    councilName: 'חבל יבנה',
    settlements: [
      { name: 'בן זכאי', lat: 31.856884, lon: 34.729583 },
      { name: 'בית רבן - גבעת וושינגטון', lat: 31.81685, lon: 34.728124 },
      { name: 'קבוצת יבנה', lat: 31.813822, lon: 34.719062 },
      { name: 'בני דרום', lat: 31.820663, lon: 34.691576 },
      { name: 'בית גמליאל', lat: 31.85536, lon: 34.762636 },
      { name: 'ניר גלים', lat: 31.824473, lon: 34.681947 },
    ],
  },
  {
    authorityId: 'SyzwqMrFbQc6tftxSL5T',
    councilName: 'לכיש',
    settlements: [
      { name: 'לכיש', lat: 31.5608984, lon: 34.8410694 },
      { name: 'שדה משה', lat: 31.6101976, lon: 34.8026633 },
      { name: 'אחוזם', lat: 31.5522246, lon: 34.7706958 },
      { name: 'כרמי קטיף', lat: 31.5372434, lon: 34.9126772 },
      { name: 'חוות פיליפ', lat: 31.519974, lon: 34.776713 },
      { name: 'אמציה', lat: 31.5324669, lon: 34.9143066 },
      { name: 'בני דקלים', lat: 31.5174853, lon: 34.9199141 },
      { name: 'אליאב', lat: 31.529931, lon: 34.9314799 },
      { name: 'שקף', lat: 31.5156708, lon: 34.9377978 },
      { name: 'מנוחה', lat: 31.6565157, lon: 34.7766986 },
      { name: 'נטע', lat: 31.4778481, lon: 34.9266422 },
      { name: 'ורדון', lat: 31.663426, lon: 34.7804089 },
      { name: 'שחר', lat: 31.6184063, lon: 34.7240639 },
      { name: 'ניר ח״ן', lat: 31.6084431, lon: 34.7145081 },
      { name: 'חוות אלה (צדק)', lat: 31.4434797, lon: 34.8979542 },
      { name: 'זוהר', lat: 31.5956483, lon: 34.6937036 },
      { name: 'נהורה', lat: 31.6226942, lon: 34.70469 },
      { name: 'שדה דוד', lat: 31.5766262, lon: 34.6846417 },
      { name: 'נוגה', lat: 31.6252155, lon: 34.6953049 },
      { name: 'עוצם', lat: 31.6366498, lon: 34.7025584 },
      { name: 'תלמים', lat: 31.5635578, lon: 34.6720813 },
      { name: 'יד נתן', lat: 31.6528819, lon: 34.7055051 },
    ],
  },
  {
    authorityId: 'IpaTTbTGgxniStzWl03l',
    councilName: 'מגידו',
    settlements: [
      { name: 'מגידו', lat: 32.578691, lon: 35.180694 },
      { name: 'מדרך עוז', lat: 32.595469, lon: 35.160305 },
      { name: 'גבעת עוז', lat: 32.555893, lon: 35.198627 },
      { name: 'היוגב', lat: 32.609421, lon: 35.203762 },
      { name: 'משמר העמק', lat: 32.610582, lon: 35.142197 },
      { name: 'עין השופט', lat: 32.595767, lon: 35.100035 },
      { name: 'רמת השופט', lat: 32.611976, lon: 35.094939 },
      { name: 'הזורע', lat: 32.643792, lon: 35.120646 },
      { name: 'דליה', lat: 32.589315, lon: 35.075825 },
      { name: 'גלעד', lat: 32.557279, lon: 35.075713 },
      { name: 'יוקנעם המושבה', lat: 32.653841, lon: 35.114766 },
      { name: 'עין העמק', lat: 32.629013, lon: 35.085394 },
      { name: 'רמות מנשה', lat: 32.597884, lon: 35.057645 },
      { name: 'אליקים', lat: 32.632738, lon: 35.067051 },
    ],
  },
  {
    authorityId: 'xLXoGR0Gtz00F077TpTk',
    councilName: 'נחל שורק',
    settlements: [
      { name: 'יסודות', lat: 31.8149319, lon: 34.8661654 },
      { name: 'נצר חזני', lat: 31.8216134, lon: 34.8624802 },
      { name: 'יד בנימין', lat: 31.7978401, lon: 34.8216119 },
      { name: 'בית חלקיה', lat: 31.7926752, lon: 34.8108048 },
      { name: 'חפץ חיים', lat: 31.788823, lon: 34.8000445 },
      { name: 'בני ראם', lat: 31.7697849, lon: 34.79065 },
      { name: 'גני טל', lat: 31.7886881, lon: 34.791191 },
    ],
  },
  {
    authorityId: 'MWYxpraxAZQ08FAiKIhO',
    councilName: 'שדות דן',
    settlements: [
      { name: 'כפר חב"ד', lat: 31.988579, lon: 34.84737 },
      { name: 'צפריה', lat: 32.005256, lon: 34.855097 },
      { name: 'אחיעזר', lat: 31.981108, lon: 34.871673 },
      { name: 'משמר השבעה', lat: 32.009162, lon: 34.823385 },
      { name: 'יגל', lat: 31.987041, lon: 34.880608 },
      { name: 'חמ"ד (מושב)', lat: 32.019045, lon: 34.841227 },
      { name: 'גנות', lat: 32.018991, lon: 34.826702 },
      { name: 'זיתן', lat: 31.975392, lon: 34.891423 },
      { name: 'ניר צבי', lat: 31.951381, lon: 34.860972 },
    ],
  },
  {
    authorityId: '8RH5qn7bDFNKJqknap32',
    councilName: 'שפיר',
    settlements: [
      { name: 'אבן שמואל', lat: 31.574894, lon: 34.764331 },
      { name: 'שלווה', lat: 31.56352, lon: 34.768043 },
      { name: 'נועם', lat: 31.56691, lon: 34.789097 },
      { name: 'איתן', lat: 31.572842, lon: 34.748722 },
      { name: 'עוזה', lat: 31.592477, lon: 34.764954 },
      { name: 'אלומה', lat: 31.652036, lon: 34.742672 },
      { name: 'רווחה', lat: 31.649513, lon: 34.731709 },
      { name: 'זבדיאל', lat: 31.658429, lon: 34.759748 },
      { name: 'קוממיות', lat: 31.661965, lon: 34.72977 },
      { name: 'זרחיה', lat: 31.680684, lon: 34.745507 },
      { name: 'עין צורים', lat: 31.694054, lon: 34.720088 },
      { name: 'שפיר', lat: 31.697056, lon: 34.728425 },
      { name: 'מרכז שפירא', lat: 31.695184, lon: 34.707125 },
      { name: 'משואות יצחק', lat: 31.702345, lon: 34.689867 },
    ],
  },
  {
    authorityId: 'OAYVMMxdySIirAUT8apP',
    councilName: 'שדות נגב',
    settlements: [
      { name: 'שובה', lat: 31.450014, lon: 34.545434 },
      { name: 'זימרת', lat: 31.447275, lon: 34.55233 },
      { name: 'סעד', lat: 31.470029, lon: 34.535535 },
      { name: 'תקומה', lat: 31.44856, lon: 34.577572 },
      { name: 'יזרעם', lat: 31.44282, lon: 34.572902 },
      { name: 'תושייה', lat: 31.433237, lon: 34.541181 },
      { name: 'התמר', lat: 31.435019, lon: 34.534038 },
      { name: 'כפר מימון', lat: 31.430805, lon: 34.536385 },
      { name: 'עלומים', lat: 31.45213, lon: 34.513715 },
      { name: 'שוקדה', lat: 31.421667, lon: 34.525382 },
      { name: 'יושיביה', lat: 31.443548, lon: 34.609145 },
      { name: 'זרועה', lat: 31.459377, lon: 34.623508 },
      { name: 'בית הגדי', lat: 31.423909, lon: 34.606739 },
      { name: 'שרשרת', lat: 31.404637, lon: 34.604116 },
      { name: 'גבעולים', lat: 31.396371, lon: 34.591514 },
      { name: 'מעגלים', lat: 31.397404, lon: 34.598318 },
      { name: 'מלילות', lat: 31.39001, lon: 34.595927 },
      { name: 'שיבולים', lat: 31.39598, lon: 34.608935 },
    ],
  },
  {
    authorityId: 'AeX1HwybsDTctZCGcPJ2',
    councilName: 'חוף אשקלון',
    settlements: [
      { name: 'ניצנים', lat: 31.716832, lon: 34.634187 },
      { name: 'ניצן ב׳', lat: 31.736119, lon: 34.635969 },
      { name: 'ניצן', lat: 31.739942, lon: 34.631816 },
      { name: 'באר גנים', lat: 31.700046, lon: 34.610653 },
      { name: 'ניר ישראל', lat: 31.687342, lon: 34.636415 },
      { name: 'הודיה', lat: 31.675649, lon: 34.63984 },
      { name: 'ברכיה', lat: 31.667826, lon: 34.62682 },
      { name: 'משען', lat: 31.657644, lon: 34.623778 },
      { name: 'בת הדר', lat: 31.646519, lon: 34.596033 },
      { name: 'בית שקמה', lat: 31.636575, lon: 34.608542 },
      { name: 'גיאה', lat: 31.627557, lon: 34.602416 },
      { name: 'כוכב מיכאל', lat: 31.627486, lon: 34.667089 },
      { name: 'תלמי יפה', lat: 31.616858, lon: 34.613289 },
      { name: 'מבקיעים', lat: 31.622156, lon: 34.57712 },
      { name: 'גברעם', lat: 31.590945, lon: 34.611503 },
      { name: 'כרמיה', lat: 31.605351, lon: 34.543018 },
      { name: 'חלץ', lat: 31.577429, lon: 34.657533 },
      { name: 'יד מרדכי', lat: 31.588677, lon: 34.559 },
      { name: 'זיקים', lat: 31.609373, lon: 34.522147 },
      { name: 'נתיב העשרה', lat: 31.57168, lon: 34.539549 },
    ],
  },
  {
    authorityId: 'X82KhLDEmUjmTN9xxndA',
    councilName: 'מרחבים',
    settlements: [
      { name: 'שדה צבי', lat: 31.4485403, lon: 34.713287 },
      { name: 'פעמי תש"ז', lat: 31.4381567, lon: 34.6930068 },
      { name: 'קלחים', lat: 31.4505907, lon: 34.6780963 },
      { name: 'אשבול', lat: 31.4475021, lon: 34.6664352 },
      { name: 'מבועים', lat: 31.4492727, lon: 34.6547505 },
      { name: 'תלמי ביל״ו', lat: 31.4377026, lon: 34.6454808 },
      { name: 'ניר עקיבא', lat: 31.4695439, lon: 34.64547 },
      { name: 'שבי דרום', lat: 31.4655951, lon: 34.6358264 },
      { name: 'ניר משה', lat: 31.4772702, lon: 34.6299737 },
      { name: 'אשל הנשיא', lat: 31.3253413, lon: 34.6977854 },
      { name: 'תפרח', lat: 31.3265145, lon: 34.677459 },
      { name: 'גילת', lat: 31.329171, lon: 34.6516508 },
      { name: 'בטחה', lat: 31.3342804, lon: 34.6344922 },
      { name: 'רנן', lat: 31.3377917, lon: 34.6004634 },
      { name: 'פדויים', lat: 31.3277011, lon: 34.612047 },
      { name: 'מסלול', lat: 31.3253422, lon: 34.5885811 },
      { name: 'עדי נגב - נחלת ערן', lat: 31.3155253, lon: 34.5945971 },
      { name: 'פטיש', lat: 31.3273849, lon: 34.5602722 },
      { name: 'טל אור', lat: 31.3520796, lon: 34.4971043 },
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
