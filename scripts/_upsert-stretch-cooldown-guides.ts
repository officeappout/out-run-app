/**
 * WRITE script — the two follow-along COOL-DOWN stretch videos (owner upload, 26.10.2026).
 *
 * 1. UPDATES the existing cool-down guide exercises/ETMVVSpt0lIpeF3mkEn6 ("מתיחות פלג גוף עליון"):
 *    its park method's media moves from YouTube to the UPPER Bunny video, a home method is added
 *    (so home workouts get the video too), tags gain `cooldown_upper` + `stretching`. Every other
 *    field (name, program, cues, workflow …) is kept.
 * 2. CREATES / rewrites exercises/cooldown-stretch-lower ("מתיחות פלג גוף תחתון") with the LOWER
 *    video — same shape as the warm-up guides (scripts/_upsert-joint-rotation-warmup-guides.ts):
 *    park (park+street) and home methods, tags `cooldown_lower` + `stretching`.
 *
 * Body focus is read by cooldown-guide.utils (tags cooldown_upper / cooldown_lower). Idempotent:
 * re-running writes the same content. Media length + thumbnail come live from the Bunny API.
 * The dry run prints the before → after diff of every changed field.
 *
 * Run (dry run first):
 *   npx tsx --env-file=.env.local scripts/_upsert-stretch-cooldown-guides.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/_upsert-stretch-cooldown-guides.ts
 */
import * as admin from 'firebase-admin';

const DRY_RUN = process.argv.includes('--dry-run');
const CDN = process.env.BUNNY_CDN_HOSTNAME || 'vz-b17872ab-7a7.b-cdn.net';
const LIBRARY_ID = process.env.BUNNY_LIBRARY_ID;
const BUNNY_KEY = process.env.BUNNY_API_KEY;
/** Same program the warm-up guides are attached to. */
const PROGRAM_ID = '47smw26hUyG5ZbE1bhr3';

const UPPER = { id: 'ETMVVSpt0lIpeF3mkEn6', guid: 'd7836903-84f0-49b4-9069-600f98b8e334', tag: 'cooldown_upper' };
const LOWER = {
  id: 'cooldown-stretch-lower',
  guid: '621cb4d6-e316-4cf0-8ce7-d3a88c62a753',
  tag: 'cooldown_lower',
  nameHe: 'מתיחות פלג גוף תחתון',
  muscleGroups: ['quads', 'hamstrings', 'glutes', 'calves', 'hip_flexors'],
  cues: ['נשמו עמוק ורגוע לאורך כל מתיחה', 'מתחו עד תחושת מתיחה נעימה, בלי כאב'],
};

type Doc = Record<string, any>;
type Media = { bunnyVideoId_mainVideoUrl: string; mainVideoUrl: string; videoDurationSeconds: number; imageUrl: string };

async function bunnyMedia(guid: string): Promise<Media> {
  const res = await fetch(`https://video.bunnycdn.com/library/${LIBRARY_ID}/videos/${guid}`, {
    headers: { AccessKey: BUNNY_KEY ?? '' },
  });
  if (!res.ok) throw new Error(`Bunny ${guid}: HTTP ${res.status}`);
  const d = (await res.json()) as { length?: number; thumbnailFileName?: string };
  if (!d.length) throw new Error(`Bunny ${guid}: no length yet (still encoding?)`);
  return {
    bunnyVideoId_mainVideoUrl: guid,
    mainVideoUrl: `https://${CDN}/${guid}/play_360p.mp4`,
    videoDurationSeconds: d.length,
    imageUrl: `https://${CDN}/${guid}/${d.thumbnailFileName || 'thumbnail.jpg'}`,
  };
}

function method(location: 'park' | 'home', nameHe: string, cues: string[], media: Media, base: Doc = {}): Doc {
  return {
    requiredGearType: 'user_gear',
    gearIds: [],
    equipmentIds: [],
    gearId: '',
    lifestyleTags: [],
    highlights: [],
    notificationText: 'מצאו מקום פנוי למתיחות',
    explanationStatus: 'missing',
    needsLongExplanation: false,
    specificCues: cues.map((he) => ({ he, en: '' })),
    ...base,
    location,
    locationMapping: location === 'park' ? ['park', 'street'] : [],
    methodName: base.methodName ?? { he: nameHe, en: '' },
    workflow: { filmed: true, audio: false, ...(base.workflow ?? {}), edited: true, uploaded: true },
    media,
  };
}

const withTags = (tags: unknown, add: string[]) => Array.from(new Set([...(Array.isArray(tags) ? tags : []), ...add]));

/** The existing upper doc → its new fields (only fields that change). */
function upperPatch(cur: Doc, media: Media): Doc {
  const methods: Doc[] = cur.execution_methods ?? [];
  const parkBase = methods.find((m) => m.location === 'park') ?? methods[0] ?? {};
  const homeBase = methods.find((m) => m.location === 'home') ?? parkBase;
  const nameHe = cur.name?.he ?? 'מתיחות פלג גוף עליון';
  const cues = (parkBase.specificCues ?? []).map((c: { he?: string }) => c.he ?? '').filter(Boolean);
  return {
    tags: withTags(cur.tags, [UPPER.tag, 'stretching']),
    media: { ...(cur.media ?? {}), imageUrl: media.imageUrl },
    execution_methods: [
      method('park', nameHe, cues, media, parkBase),
      method('home', nameHe, cues, media, { ...homeBase, location: 'home' }),
    ],
  };
}

function lowerDoc(media: Media): Doc {
  const description = { he: 'סרטון מתיחות פלג גוף תחתון', en: '', es: '' };
  return {
    name: { he: LOWER.nameHe, en: '', es: '' },
    exerciseRole: 'cooldown',
    isFollowAlong: true,
    loggingMode: 'completion',
    type: 'time',
    mechanicalType: 'none',
    movementGroup: 'flexibility',
    movementType: 'compound',
    symmetry: 'bilateral',
    base_movement_id: 'unspecified_movement',
    tags: [LOWER.tag, 'stretching'],
    muscleGroups: LOWER.muscleGroups,
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
    media: { videoUrl: null, imageUrl: media.imageUrl, previewVideo: null, fullTutorial: null },
    content: {
      description,
      instructions: { he: '', en: '', es: '' },
      goal: description.he,
      highlights: [],
      specificCues: [],
    },
    execution_methods: [
      method('park', LOWER.nameHe, LOWER.cues, media),
      method('home', LOWER.nameHe, LOWER.cues, media),
    ],
  };
}

/** Key-order-insensitive JSON (Firestore returns map keys in its own order). */
const stable = (v: unknown): string => JSON.stringify(v, (_k, x) =>
  x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x, 2);

function printDiff(id: string, before: Doc | undefined, patch: Doc) {
  console.log(`\n── exercises/${id} ${before ? '(update)' : '(create)'}`);
  for (const [k, v] of Object.entries(patch)) {
    const b = stable(before?.[k] ?? null);
    const a = stable(v);
    if (a === b) continue;
    console.log(`  ${k}:\n    before: ${b.replace(/\n/g, '\n    ')}\n    after:  ${a.replace(/\n/g, '\n    ')}`);
  }
}

async function main() {
  if (!LIBRARY_ID || !BUNNY_KEY) throw new Error('BUNNY_LIBRARY_ID / BUNNY_API_KEY missing — use --env-file=.env.local');
  const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
  if (!key?.project_id) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY missing — use --env-file=.env.local');
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
  const db = admin.firestore();

  const upperRef = db.collection('exercises').doc(UPPER.id);
  const lowerRef = db.collection('exercises').doc(LOWER.id);
  const [upperSnap, lowerSnap] = await Promise.all([upperRef.get(), lowerRef.get()]);
  if (!upperSnap.exists) throw new Error(`exercises/${UPPER.id} not found`);
  const upperCur = upperSnap.data() as Doc;
  if (upperCur.exerciseRole !== 'cooldown' || upperCur.isFollowAlong !== true) {
    throw new Error(`exercises/${UPPER.id} is not a follow-along cool-down doc — refusing`);
  }

  const up = upperPatch(upperCur, await bunnyMedia(UPPER.guid));
  const low = lowerDoc(await bunnyMedia(LOWER.guid));
  printDiff(UPPER.id, upperCur, up);
  printDiff(LOWER.id, lowerSnap.exists ? (lowerSnap.data() as Doc) : undefined, low);
  if (DRY_RUN) { console.log('\n[dry-run] nothing written.'); return; }

  const ts = admin.firestore.FieldValue.serverTimestamp();
  await upperRef.set({ ...up, updatedAt: ts }, { merge: true });
  console.log(`✓ exercises/${UPPER.id} updated`);
  await lowerRef.set({ ...low, ...(lowerSnap.exists ? {} : { createdAt: ts }), updatedAt: ts }, { merge: true });
  console.log(`✓ exercises/${LOWER.id} ${lowerSnap.exists ? 'updated' : 'created'}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('❌', e); process.exit(1); });
