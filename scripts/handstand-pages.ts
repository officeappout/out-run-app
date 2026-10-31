/**
 * Handstand: 18 new exercise pages, each created WITH its ready (captioned)
 * Drive video. Owner-approved 31.10.2026 (appout-website/handstand-research/
 * PAGES-DRY-RUN.md). The catalog has no "hidden draft" field, so a page is
 * created only after its video is uploaded AND encoded: never a page without video.
 *
 *   (default)            dry-run: prints what each phase would do, no writes
 *   --upload --only=8,12 download from Drive → upload to Bunny → log guid → delete local file
 *   --create --only=8,12 create the exercise doc for uploaded + encoded videos
 *
 * Log (idempotent, skip done steps): appout-website/handstand-research/pages-log.json
 * Texts (goal, tips, notes): old admin panel export, same folder.
 *
 * Run: npx tsx --env-file=.env.local scripts/handstand-pages.ts [--upload|--create] [--only=a,b]
 */
import * as admin from 'firebase-admin';
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

const RESEARCH = '/Users/calisthenicsltd/Development/appout-website/handstand-research';
const LOG = join(RESEARCH, 'pages-log.json');
const TMP = process.env.HS_TMP_DIR ?? join(process.cwd(), '.hs-pages-tmp');
const HANDSTAND_ID = 'IOfBZFeorTTDkcz3tOA6';
const CDN = process.env.BUNNY_CDN_HOSTNAME || 'vz-b17872ab-7a7.b-cdn.net';
const LIB = process.env.BUNNY_LIBRARY_ID ?? '';
const BUNNY_KEY = process.env.BUNNY_API_KEY ?? '';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing — use --env-file=.env.local'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

type Muscle = 'core' | 'shoulders' | 'back';
interface Page { num: string; he: string; oldId: number; videos: { label?: string; driveId: string }[]; sbm: [number, number, number]; type: 'time' | 'reps'; muscle: Muscle; existingId?: string }

const PAGES: Page[] = [
  { num: '8', he: 'החזקת גוף חלול בטאק', oldId: 268, videos: [{ driveId: '1OassRVDHNQkNz-f3taras7TL9gcFDcr4' }], sbm: [6, 1, 1], type: 'time', muscle: 'core' },
  { num: '12', he: 'עמידת צפרדע', oldId: 261, videos: [{ driveId: '1tgHPQ6QR2yb-6eValFd795hzo8Fv-rFQ' }], sbm: [4, 5, 2], type: 'time', muscle: 'shoulders' },
  { num: '13', he: 'הרמות ידיים בשכיבה על הבטן', oldId: 305, videos: [{ driveId: '12w9-zn4T6D0r5tv54XB9PD68DufYHmYx' }], sbm: [2, 1, 8], type: 'reps', muscle: 'shoulders' },
  { num: '14', he: 'גוף חלול על הבטן', oldId: 265, videos: [{ driveId: '16kda8qj4ZqyZ3q1fiRW-PvWefGR85A6o' }], sbm: [4, 1, 6], type: 'time', muscle: 'back' },
  { num: '24', he: 'הרמת שכמות בעמידת ידיים חזה לקיר', oldId: 278, videos: [{ driveId: '1a7og27RXcRMP_8I-qdDzjgfGjjsjKAC0' }], sbm: [12, 3, 14], type: 'reps', muscle: 'shoulders' },
  { num: '29', he: 'העברות משקל מול קיר', oldId: 284, videos: [{ driveId: '1k2idUWnMIUoE8A6mBSUSqRPvCzKW36Ed' }], sbm: [12, 6, 9], type: 'reps', muscle: 'shoulders' },
  { num: '31', he: 'ניתוקי בהונות', oldId: 281, videos: [{ driveId: '1VhUPe92UfQcF_RTa0TTiKD5DUW9U9ebI' }], sbm: [9, 10, 10], type: 'time', muscle: 'shoulders' },
  { num: '32', he: 'ניתוקי עקבים', oldId: 282, videos: [{ driveId: '1OIc9oeg_Vzjq7OIYli-8niPPqduZER0W' }], sbm: [9, 12, 11], type: 'time', muscle: 'shoulders' },
  { num: '33', he: 'ניתוקי מספריים', oldId: 275, videos: [{ label: 'חזה לקיר', driveId: '14z2eXin999Oyj1tYWi_-h5aN0v613WMZ' }, { label: 'גב לקיר', driveId: '1SiTsXXOu4uKC-ZswcyuwBu05mVtJzO54' }], sbm: [10, 13, 11], type: 'time', muscle: 'shoulders' },
  { num: '37', he: 'עמידת ידיים בעזרת חבר', oldId: 283, videos: [{ driveId: '1UpThBAA6UZCMT5sPp31MMlrmdYchjouD' }], sbm: [8, 9, 9], type: 'time', muscle: 'shoulders' },
  { num: '44a', he: 'תרגול נפילה אל הצד', oldId: 266, videos: [{ driveId: '1OL2qn8z857wLwVgTaUz3Tac9ZnkSbt_v' }], sbm: [5, 7, 7], type: 'reps', muscle: 'shoulders' },
  { num: '44c', he: 'תרגול נפילה קדמי', oldId: 271, videos: [{ driveId: '1nDEbVcaPF-_5mJOxh_K5ql5skxsQBCYB' }], sbm: [6, 8, 8], type: 'reps', muscle: 'shoulders' },
  { num: '46', he: 'קיק אפ מהגבהה', oldId: 280, videos: [{ driveId: '1Btbctl6fYOjRiOWBeKNIU_5taeW70ce3' }], sbm: [6, 7, 8], type: 'reps', muscle: 'shoulders' },
  { num: '47', he: 'קיק אפ לקיר', oldId: 145, videos: [{ driveId: '1S-3V9mIKB7b6-_XWfElfQM4fzh7pPUDV' }], sbm: [7, 8, 9], type: 'reps', muscle: 'shoulders' },
  { num: '56', he: 'זמן משחק', oldId: 285, videos: [{ driveId: '12V7X8cIZCkqzQAYlM3XUD2KkJC5_kCt3' }], sbm: [10, 15, 12], type: 'time', muscle: 'shoulders' },
  { num: '62', he: 'עמידת עורב', oldId: 272, videos: [{ driveId: '1RBryXrTQv3g7g8xFjxRewO-yuKYaTOuz' }], sbm: [4, 7, 2], type: 'time', muscle: 'shoulders' },
  { num: 'taps-plank', he: 'נגיעות כתפיים בפלאנק גבוה', oldId: 258, videos: [{ driveId: '1clofk0Q9pKlkpA8KiXNAoS3gA6bs6o_8' }], sbm: [5, 3, 2], type: 'reps', muscle: 'shoulders' },
  { num: 'taps-pike', he: 'נגיעות כתפיים בפייק', oldId: 260, videos: [{ driveId: '1kcym4LMQ51eOyQkNvLw4uGPpWIjBMybd' }], sbm: [5, 3, 6], type: 'reps', muscle: 'shoulders' },
  // Wave 2 (owner, 31.10): the rest of the ready-folder videos.
  { num: 'pike-shrugs', he: 'הרמת שכמות בעמידת פייק', oldId: 256, videos: [{ driveId: '1R2sIhmIOHa4BFymiOC-9W8TGX6RqDPfY' }], sbm: [4, 1, 6], type: 'reps', muscle: 'shoulders' },
  { num: 'half-kickup', he: 'חצי קיק אפ', oldId: 277, videos: [{ driveId: '1Jt4_RDoIB3pLwJFrM5En-Pq7-dZv7jWw' }], sbm: [5, 6, 7], type: 'reps', muscle: 'shoulders' },
  { num: 'seiza-pike', he: 'ישיבת סייזה לעמידת פייק', oldId: 270, videos: [{ driveId: '1s_QYx_jsWYzKIFtUZASmfgNDDh4JOAyQ' }], sbm: [5, 2, 7], type: 'reps', muscle: 'shoulders' },
  { num: 'side-stretch', he: 'מתיחת גב צידית', oldId: 267, videos: [{ driveId: '1ixPE2x3NFZjbPLKWmof6SwfINl2SAc72' }], sbm: [1, 1, 4], type: 'time', muscle: 'back' },
  { num: 'butcher', he: 'מתיחת קצבים', oldId: 279, videos: [{ driveId: '1TkbqC_jY1hT9zsFCsCltBDJQFA664aXf' }], sbm: [1, 1, 5], type: 'time', muscle: 'shoulders' },
  { num: 'frog-lifts', he: 'עמידת צפרדע ניתוקי רגליים', oldId: 259, videos: [{ driveId: '1LXpmruiJyZQMyLFRztV6LkeCYdjXQ5_T' }], sbm: [3, 4, 2], type: 'time', muscle: 'shoulders' },
  { num: 'plank-pike', he: 'פלאנק לעמידת פייק', oldId: 264, videos: [{ driveId: '1EI2BjSEL7T1lEFPrfGU56G54kHqsELxf' }], sbm: [5, 1, 6], type: 'reps', muscle: 'shoulders' },
  { num: 'rail-opening', he: 'פתיחת כתף בעזרת מעקה', oldId: 257, videos: [{ driveId: '1MhmbusVjKU02u8QYlfIA0ySgBHmmziNS' }], sbm: [1, 1, 3], type: 'time', muscle: 'shoulders' },
  { num: 'cobra', he: 'קוברה תלויה', oldId: 273, videos: [{ driveId: '10jQXmigsIsXz8WvSy0aM4vBvFVzpbeAI' }], sbm: [4, 1, 10], type: 'time', muscle: 'shoulders' },
  { num: 'supinated-hang', he: 'תלייה פסיבית סופינציה', oldId: 269, videos: [{ driveId: '1G5IL1rHbTh3B3O8z_hjS8AHXoiPrQABT' }], sbm: [3, 1, 7], type: 'time', muscle: 'shoulders' },
  // Existing page (park method has no video): add the narrated video to its park method only.
  { num: 'prayer', he: 'מתיחת מתפלל', oldId: 262, videos: [{ driveId: '145WJ5VCsJSUeIkbm-8Mc_9aZZ8jo7nV6' }], sbm: [1, 1, 2], type: 'time', muscle: 'shoulders', existingId: 'gWHaGzObmixb1vr66l5I' },
];

/** Park method name, the app's convention: "<name> בפארק" / "<name> at the Park". */
const parkName = (base: string) => (base.endsWith('בפארק') ? base : `${base} בפארק`);
const parkNameEn = (base: string) => (base.endsWith('at the Park') ? base : `${base} at the Park`);

type PanelRow = { id: number; goal?: string; notes?: string[]; tips?: string[] };
const panel = new Map<number, PanelRow>(
  (JSON.parse(readFileSync(join(RESEARCH, 'old-panel-export/old-panel-handstand.json'), 'utf8')) as PanelRow[]).filter((x) => x.id).map((x) => [x.id, x]),
);
type Log = Record<string, { guids?: Record<string, string>; exerciseId?: string }>;
const log: Log = existsSync(LOG) ? JSON.parse(readFileSync(LOG, 'utf8')) : {};
const saveLog = () => writeFileSync(LOG, JSON.stringify(log, null, 1));

const mode = process.argv.includes('--upload') ? 'upload' : process.argv.includes('--create') ? 'create' : 'dry';
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const selected = PAGES.filter((p) => !only || only.includes(p.num));

async function bunny(method: string, path: string, body?: BodyInit, ctype = 'application/json') {
  const res = await fetch(`https://video.bunnycdn.com/library/${LIB}/videos${path}`, { method, body, headers: { AccessKey: BUNNY_KEY, 'Content-Type': ctype } });
  if (!res.ok) throw new Error(`Bunny ${method} ${path}: HTTP ${res.status}`);
  return res.json() as Promise<Record<string, any>>;
}

async function driveDownload(driveId: string): Promise<string> {
  const { google } = require('googleapis');
  const { JWT } = require('google-auth-library');
  const drive = google.drive({ version: 'v3', auth: new JWT({ email: key.client_email, key: key.private_key, scopes: ['https://www.googleapis.com/auth/drive.readonly'] }) });
  mkdirSync(TMP, { recursive: true });
  const p = join(TMP, `${driveId}.mp4`);
  const r: any = await drive.files.get({ fileId: driveId, alt: 'media', supportsAllDrives: true }, { responseType: 'stream' });
  await new Promise((res, rej) => r.data.pipe(createWriteStream(p)).on('finish', res).on('error', rej));
  return p;
}

const tutorial = (guid: string, d: Record<string, any>) => ({
  provider: 'bunny',
  videoId: guid,
  thumbnailUrl: `https://${CDN}/${guid}/${d.thumbnailFileName || 'thumbnail.jpg'}`,
  ...(d.length ? { durationSeconds: d.length } : {}),
});

const tips = (p: Page) => (panel.get(p.oldId)?.tips ?? []).map((t) => t.trim()).filter((t) => t.length > 2);

function buildDoc(p: Page, media: Record<string, Record<string, unknown>>) {
  const [s, b, m] = p.sbm;
  const x = panel.get(p.oldId);
  const he = (v: string) => ({ he: v, en: '' });
  return {
    name: he(p.he),
    type: p.type,
    loggingMode: 'reps',
    exerciseRole: 'main',
    primaryMuscle: p.muscle,
    secondaryMuscles: [],
    muscleGroups: [],
    equipment: [],
    requiredUserGear: [],
    base_movement_id: 'handstand',
    symmetry: 'bilateral',
    tags: [],
    programIds: [HANDSTAND_ID],
    targetPrograms: [{ programId: HANDSTAND_ID, level: Math.round((s + b + m) / 3), strengthScore: s, balanceScore: b, mobilityScore: m }],
    injuryShield: ['wrist'],
    requiredLocations: [],
    requiredTier: 1,
    stats: { views: 0 },
    content: { description: he((x?.goal ?? '').trim()), instructions: he(''), notes: [], highlights: [], specificCues: [] },
    execution_methods: p.videos.map((v) => ({
      requiredGearType: 'user_gear',
      location: 'park',
      locationMapping: ['park'],
      gearIds: [],
      equipmentIds: [],
      methodName: he(parkName(v.label ? `${p.he} ${v.label}` : p.he)),
      specificCues: tips(p).map(he),
      highlights: [],
      media: media[v.driveId],
    })),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

/**
 * --en [--apply]: English text for created pages from handstand-research/pages-en.json
 * (name, description, method names, cues by index). Dry-run unless --apply.
 */
async function english() {
  type En = { name: string; goal: string; cues: string[]; methods?: Record<string, string> };
  const en: Record<string, En> = JSON.parse(readFileSync(join(RESEARCH, 'pages-en.json'), 'utf8'));
  const apply = process.argv.includes('--apply');
  console.log(`English text: ${apply ? 'APPLY' : 'dry-run'}`);
  for (const p of selected) {
    const id = log[p.num]?.exerciseId;
    const e = en[p.num];
    if (p.existingId) continue; // existing page keeps its own English
    if (!id || !e) { console.log(`#${p.num}: ${!id ? 'not created' : 'no English'}, skipped`); continue; }
    const ref = db.collection('exercises').doc(id);
    const d = (await ref.get()).data()!;
    const methods = (d.execution_methods as any[]).map((m, i) => {
      const label = p.videos[i]?.label;
      const cues = (m.specificCues as { he: string; en: string }[]) ?? [];
      if (cues.length !== e.cues.length) throw new Error(`#${p.num}: ${cues.length} he cues vs ${e.cues.length} en`);
      return {
        ...m,
        methodName: { ...m.methodName, en: parkNameEn(label ? `${e.name} (${e.methods?.[label] ?? label})` : e.name) },
        specificCues: cues.map((c, j) => ({ ...c, en: e.cues[j] })),
      };
    });
    console.log(`#${p.num} ${p.he} → ${e.name} | cues ${e.cues.length}`);
    if (!apply) continue;
    await ref.update({
      'name.en': e.name,
      'content.description.en': e.goal,
      execution_methods: methods,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

/**
 * --fix-park [--apply]: wave-1 pages (created before 31.10 evening) → park-only
 * method named "… בפארק" holding the narrated video as fullTutorial.he too
 * (owner: other locations get their own methods/videos later). Keeps main/loop.
 */
async function fixPark() {
  const apply = process.argv.includes('--apply');
  console.log(`Park fix: ${apply ? 'APPLY' : 'dry-run'}`);
  for (const p of selected) {
    const id = log[p.num]?.exerciseId;
    if (!id || p.existingId) continue;
    const ref = db.collection('exercises').doc(id);
    const d = (await ref.get()).data()!;
    let changed = false;
    const methods = [];
    for (const m of d.execution_methods as any[]) {
      const guid = m.media?.bunnyVideoId_mainVideoUrl;
      const next = { ...m, location: 'park', locationMapping: ['park'], methodName: { he: parkName(m.methodName?.he ?? p.he), en: m.methodName?.en ? parkNameEn(m.methodName.en) : '' } };
      if (guid && !m.media?.fullTutorial?.he) next.media = { ...m.media, fullTutorial: { ...(m.media.fullTutorial ?? {}), he: tutorial(guid, { length: m.media.videoDurationSeconds }) } };
      if (JSON.stringify(next) !== JSON.stringify(m)) changed = true;
      methods.push(next);
    }
    console.log(`#${p.num} ${p.he} (${id}): ${changed ? methods.map((m) => m.methodName.he).join(' | ') : 'already ok'}`);
    if (changed && apply) await ref.update({ execution_methods: methods, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  }
}

async function main() {
  if (process.argv.includes('--en')) return english();
  if (process.argv.includes('--fix-park')) return fixPark();
  console.log(`mode: ${mode}${only ? ` only=${only.join(',')}` : ''} (${selected.length} pages)`);
  for (const p of selected) {
    const entry = (log[p.num] ??= {});
    const [s, b, m] = p.sbm;
    if (mode === 'dry') {
      const dup = await db.collection('exercises').where('name.he', '==', p.he).limit(1).get();
      console.log(`#${p.num} ${p.he} | ${p.type} ${p.muscle} | ${s}/${b}/${m} level ${Math.round((s + b + m) / 3)} | videos ${p.videos.length} | cues ${tips(p).length}` +
        ` | uploaded ${Object.keys(entry.guids ?? {}).length}/${p.videos.length}${entry.exerciseId ? ` | created ${entry.exerciseId}` : ''}${dup.empty ? '' : ` | ⚠ name exists: ${dup.docs[0].id}`}`);
      continue;
    }
    if (mode === 'upload') {
      for (const v of p.videos) {
        if (entry.guids?.[v.driveId]) { console.log(`#${p.num} ${v.driveId}: already uploaded`); continue; }
        const file = await driveDownload(v.driveId);
        const { guid } = await bunny('POST', '', JSON.stringify({ title: `${p.he}${v.label ? ` ${v.label}` : ''}` }));
        await bunny('PUT', `/${guid}`, readFileSync(file), 'application/octet-stream');
        console.log(`#${p.num} uploaded ${(statSync(file).size / 1e6).toFixed(1)}MB → ${guid}`);
        unlinkSync(file);
        (entry.guids ??= {})[v.driveId] = guid;
        saveLog();
      }
      continue;
    }
    // create
    if (entry.exerciseId) { console.log(`#${p.num}: already created ${entry.exerciseId}`); continue; }
    const media: Record<string, Record<string, unknown>> = {};
    let ready = true;
    for (const v of p.videos) {
      const guid = entry.guids?.[v.driveId];
      if (!guid) { ready = false; break; }
      const d = await bunny('GET', `/${guid}`);
      if (!d.length) { ready = false; break; }
      media[v.driveId] = {
        bunnyVideoId_mainVideoUrl: guid,
        mainVideoUrl: `https://${CDN}/${guid}/play_360p.mp4`,
        videoDurationSeconds: d.length,
        imageUrl: `https://${CDN}/${guid}/${d.thumbnailFileName || 'thumbnail.jpg'}`,
        // Owner, 31.10: the narrated video is the park method's full tutorial.
        fullTutorial: { he: tutorial(guid, d) },
      };
    }
    if (!ready) { console.log(`#${p.num}: video not uploaded/encoded yet, skipped (no page without video)`); continue; }
    if (p.existingId) {
      const ref = db.collection('exercises').doc(p.existingId);
      const d = (await ref.get()).data()!;
      const methods = (d.execution_methods as any[]).map((m) =>
        m.location === 'park' ? { ...m, media: { ...m.media, ...media[p.videos[0].driveId] } } : m);
      await ref.update({ execution_methods: methods, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      entry.exerciseId = p.existingId;
      saveLog();
      console.log(`#${p.num} ${p.he}: park video added to ${p.existingId}`);
      continue;
    }
    const ref = await db.collection('exercises').add(buildDoc(p, media));
    entry.exerciseId = ref.id;
    saveLog();
    console.log(`#${p.num} ${p.he}: created ${ref.id}`);
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
