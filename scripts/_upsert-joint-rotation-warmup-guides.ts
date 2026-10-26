/**
 * WRITE script — the two follow-along joint-rotation WARM-UP videos (owner upload, 26.10.2026).
 *
 * Upserts exactly two exercise docs with deterministic ids (idempotent: re-running rewrites the
 * same content; createdAt is kept when the doc already exists). Field shape copied from the
 * existing follow-along warm-up guide exercises/k10Af7WEV0qDqx8PY7xQ ("חימום פלג גוף עליון").
 * Body focus is carried by tags `warmup_upper` / `warmup_lower` (read by
 * warmup-guide-focus.utils). Each doc gets a park method (locationMapping park+street, like the
 * existing guide) and a home method (location home, like the other home follow-along videos);
 * both play the same Bunny video — joint rotations need no equipment.
 *
 * Media (length + thumbnail) is read live from the Bunny Stream API.
 *
 * Run (dry run first):
 *   npx tsx --env-file=.env.local scripts/_upsert-joint-rotation-warmup-guides.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/_upsert-joint-rotation-warmup-guides.ts
 */
import * as admin from 'firebase-admin';

const DRY_RUN = process.argv.includes('--dry-run');
const CDN = process.env.BUNNY_CDN_HOSTNAME || 'vz-b17872ab-7a7.b-cdn.net';
const LIBRARY_ID = process.env.BUNNY_LIBRARY_ID;
const BUNNY_KEY = process.env.BUNNY_API_KEY;
/** Same program the existing warm-up guide is attached to. */
const PROGRAM_ID = '47smw26hUyG5ZbE1bhr3';

interface GuideSpec {
  id: string;
  guid: string;
  nameHe: string;
  focusTag: 'warmup_upper' | 'warmup_lower';
  muscleGroups: string[];
  cues: string[];
}

const GUIDES: GuideSpec[] = [
  {
    id: 'warmup-joint-rotations-upper',
    guid: '9d1d93a9-8949-482d-97e9-8d3cc496ade7',
    nameHe: 'חימום סיבובי מפרקים · פלג גוף עליון',
    focusTag: 'warmup_upper',
    muscleGroups: ['chest', 'back', 'shoulders', 'abs', 'obliques'],
    cues: ['עמדו זקוף, רגליים ברוחב הכתפיים', 'התחילו לאט והגבירו קצב בהדרגה'],
  },
  {
    id: 'warmup-joint-rotations-lower',
    guid: '61695231-0a06-4cd6-b2f6-c3c7be56a0fd',
    nameHe: 'חימום סיבובי מפרקים · פלג גוף תחתון',
    focusTag: 'warmup_lower',
    muscleGroups: ['quads', 'hamstrings', 'glutes', 'calves', 'hip_flexors'],
    cues: ['עמדו זקוף, רגליים ברוחב הכתפיים', 'התחילו לאט והגבירו קצב בהדרגה'],
  },
];

async function bunnyMeta(guid: string): Promise<{ length: number; thumbnailFileName: string }> {
  const res = await fetch(`https://video.bunnycdn.com/library/${LIBRARY_ID}/videos/${guid}`, {
    headers: { AccessKey: BUNNY_KEY ?? '' },
  });
  if (!res.ok) throw new Error(`Bunny ${guid}: HTTP ${res.status}`);
  const d = (await res.json()) as { length?: number; thumbnailFileName?: string; status?: number };
  if (!d.length || !d.thumbnailFileName) throw new Error(`Bunny ${guid}: missing length/thumbnail`);
  return { length: d.length, thumbnailFileName: d.thumbnailFileName };
}

function method(g: GuideSpec, location: 'park' | 'home', media: Record<string, unknown>) {
  return {
    location,
    locationMapping: location === 'park' ? ['park', 'street'] : [],
    methodName: { he: g.nameHe, en: '' },
    requiredGearType: 'user_gear',
    gearIds: [],
    equipmentIds: [],
    gearId: '',
    lifestyleTags: [],
    highlights: [],
    notificationText: 'מצאו מקום פנוי לעמידה',
    explanationStatus: 'missing',
    needsLongExplanation: false,
    specificCues: g.cues.map((he) => ({ he, en: '' })),
    workflow: { filmed: true, audio: false, edited: true, uploaded: true },
    media,
  };
}

function buildDoc(g: GuideSpec, meta: { length: number; thumbnailFileName: string }) {
  const imageUrl = `https://${CDN}/${g.guid}/${meta.thumbnailFileName}`;
  const media = {
    bunnyVideoId_mainVideoUrl: g.guid,
    mainVideoUrl: `https://${CDN}/${g.guid}/play_360p.mp4`,
    videoDurationSeconds: meta.length,
    imageUrl,
  };
  const description = { he: 'סרטון חימום סיבובי מפרקים', en: '', es: '' };
  return {
    name: { he: g.nameHe, en: '', es: '' },
    exerciseRole: 'warmup',
    isFollowAlong: true,
    loggingMode: 'completion',
    type: 'time',
    mechanicalType: 'none',
    movementGroup: 'flexibility',
    movementType: 'compound',
    symmetry: 'bilateral',
    base_movement_id: 'unspecified_movement',
    tags: [g.focusTag, 'joint_rotations'],
    muscleGroups: g.muscleGroups,
    secondaryMuscles: [],
    equipment: [],
    requiredUserGear: [],
    requiredLocations: [],
    injuryShield: [],
    restDayProgramIds: [],
    supportedLangs: [],
    requiredTier: 1,
    programIds: [PROGRAM_ID],
    targetPrograms: [{ programId: PROGRAM_ID, level: 1 }],
    stats: { views: 0 },
    media: { videoUrl: null, imageUrl, previewVideo: null, fullTutorial: null },
    content: {
      description,
      instructions: { he: '', en: '', es: '' },
      goal: description.he,
      highlights: [],
      specificCues: [],
    },
    execution_methods: [method(g, 'park', media), method(g, 'home', media)],
  };
}

async function main() {
  if (!LIBRARY_ID || !BUNNY_KEY) throw new Error('BUNNY_LIBRARY_ID / BUNNY_API_KEY missing — use --env-file=.env.local');
  const docs = [] as { id: string; data: ReturnType<typeof buildDoc> }[];
  for (const g of GUIDES) docs.push({ id: g.id, data: buildDoc(g, await bunnyMeta(g.guid)) });

  for (const d of docs) console.log(`\n── exercises/${d.id}\n${JSON.stringify(d.data, null, 2)}`);
  if (DRY_RUN) { console.log('\n[dry-run] nothing written.'); return; }

  const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
  if (!key?.project_id) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY missing — use --env-file=.env.local');
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
  const db = admin.firestore();
  for (const d of docs) {
    const ref = db.collection('exercises').doc(d.id);
    const exists = (await ref.get()).exists;
    await ref.set({
      ...d.data,
      ...(exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log(`✓ exercises/${d.id} ${exists ? 'updated' : 'created'}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('❌', e); process.exit(1); });
