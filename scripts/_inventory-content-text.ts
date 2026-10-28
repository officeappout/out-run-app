/**
 * READ-ONLY. Inventory of user-facing Hebrew text in Firestore content collections:
 * per collection and field path -> shape (plain string / LocalizedText {he,en} / mixed), doc counts,
 * unique Hebrew strings, Hebrew word count, strings still missing English.
 * Only collection .get() / listCollections(); no set/update/delete/batch/transaction. Prints counts, never content.
 *
 * Run: FIREBASE_SERVICE_ACCOUNT_KEY='...' npx tsx scripts/_inventory-content-text.ts [col1,col2,...]
 *      (no arg = the content collections below; "ALL" = every root collection except the skipped user-data ones)
 */
import * as admin from 'firebase-admin';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
const key = raw ? JSON.parse(raw) : null;
if (!key?.project_id) { console.error('FIREBASE_SERVICE_ACCOUNT_KEY missing'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

const CONTENT_COLLECTIONS = [
  'exercises', 'gear_definitions', 'programs', 'levels', 'programLevelSettings', 'workoutMetadata',
  'runWorkoutTemplates', 'runProgramTemplates', 'onboarding_questions', 'visual_assessment_content',
  'smart_messages', 'push_messages', 'titles', 'phrases', 'workout_titles_creative', 'workout_funny_titles',
  'workout_focus_fragments', 'workout_content_fragments', 'workout_time_contexts', 'time_contexts',
  'site_content', 'outdoorBrands', 'gym_equipment', 'product_tags', 'pe_grades',
];
// Never scanned with ALL: user data and large operational collections.
const SKIP = new Set(['users', 'userPublic', 'dailyActivity', 'activity', 'sessions', 'presence', 'analytics_events', 'chats', 'feed_posts', 'kudos', 'streets', 'street_segments', 'route_adjacency', 'osm_amenities', 'push_events', 'ai_coach_threads', 'transactions']);

const HEB = /[֐-׿]/;
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const isLocalized = (v: unknown): v is { he?: unknown; en?: unknown } =>
  !!v && typeof v === 'object' && !Array.isArray(v) && ('he' in (v as object)) && Object.keys(v as object).every((k) => ['he', 'en', 'es'].includes(k));

interface Agg { docs: Set<string>; plain: number; localized: number; heStrings: Set<string>; missingEn: Set<string> }
const aggs = new Map<string, Agg>();
const get = (k: string) => { let a = aggs.get(k); if (!a) { a = { docs: new Set(), plain: 0, localized: 0, heStrings: new Set(), missingEn: new Set() }; aggs.set(k, a); } return a; };

function walk(col: string, id: string, v: unknown, path: string) {
  if (typeof v === 'string') {
    if (!HEB.test(v)) return;
    const a = get(`${col}::${path}`);
    a.docs.add(id); a.plain++; a.heStrings.add(v.trim()); a.missingEn.add(v.trim());
  } else if (isLocalized(v)) {
    const he = typeof v.he === 'string' ? v.he.trim() : '';
    if (!he) return;
    const a = get(`${col}::${path}`);
    a.docs.add(id); a.localized++; a.heStrings.add(he);
    if (!(typeof v.en === 'string' && v.en.trim())) a.missingEn.add(he);
  } else if (Array.isArray(v)) {
    v.forEach((x) => walk(col, id, x, `${path}[]`));
  } else if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof (o as { toDate?: unknown }).toDate === 'function') return;
    for (const [k, x] of Object.entries(o)) walk(col, id, x, path ? `${path}.${k}` : k);
  }
}

async function main() {
  const arg = process.argv[2];
  let cols = CONTENT_COLLECTIONS;
  if (arg === 'ALL') cols = (await db.listCollections()).map((c) => c.id).filter((n) => !SKIP.has(n));
  else if (arg) cols = arg.split(',');
  const docCounts: Record<string, number> = {};
  for (const col of cols) {
    const snap = await db.collection(col).get();
    docCounts[col] = snap.size;
    for (const d of snap.docs) walk(col, d.id, d.data(), '');
  }
  const rows = [...aggs.entries()].map(([k, a]) => {
    const [col, field] = k.split('::');
    const shape = a.plain && a.localized ? 'mixed' : a.localized ? 'LocalizedText' : 'string';
    const wordsToTranslate = [...a.missingEn].reduce((n, s) => n + words(s), 0);
    return { collection: col, field, shape, docs: a.docs.size, totalDocs: docCounts[col], uniqueHe: a.heStrings.size, uniqueMissingEn: a.missingEn.size, hebrewWordsToTranslate: wordsToTranslate };
  }).sort((a, b) => a.collection.localeCompare(b.collection) || b.hebrewWordsToTranslate - a.hebrewWordsToTranslate);
  console.table(rows);
  const byCol = new Map<string, { fields: number; words: number }>();
  for (const r of rows) { const c = byCol.get(r.collection) ?? { fields: 0, words: 0 }; c.fields++; c.words += r.hebrewWordsToTranslate; byCol.set(r.collection, c); }
  console.log(JSON.stringify({ docCounts, perCollection: Object.fromEntries(byCol) }));
}
main().catch((e) => { console.error(e); process.exit(1); });
