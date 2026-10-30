/**
 * Pure core of the generic content-collection pipeline (programs, levels, level settings, ...). No Firestore, no fs.
 *
 *   export  : every user-facing Hebrew leaf of a doc -> FieldRef { id, path, shape, he, en }
 *   import  : FieldRef + translation -> a write that follows how the app READS that field.
 *             Only fields in READY_PATHS (the app already reads { he, en } there, see
 *             src/features/content/programs/core/localized-fields.ts) get a write; everything else is listed as
 *             "needsCode" and never written.
 *   verify  : source text unchanged vs a fresh export, no Hebrew in the English, placeholders/numbers kept.
 */
export const HEBREW = /[֐-׿]/;
export const FORMAT = 'out-collection-translations-v1';

export interface FieldRef { id: string; path: string; shape: 'string' | 'localized'; he: string; en: string }

/** Paths (array indices normalised to []) the app ALREADY reads as { he, en }. Everything else = needs code support. */
export const READY_PATHS: Record<string, readonly string[]> = {
  programs: ['name', 'description'],
  levels: ['name', 'description'],
  programLevelSettings: ['levelDescription', 'assessmentBoldTitle', 'targetGoals[].exerciseName'],
  // #938: readers accept string | {he,en} in the field itself (pair exposed as <field>Localized); lists hold per-item {he,en}
  runWorkoutTemplates: ['name', 'description', 'blocks[].label', 'blocks[].restLabel'],
  runProgramTemplates: ['name', 'volumeCaps[].description'],
  gym_equipment: ['name', 'description', 'prepNote', 'cues[]', 'tips[]', 'instructions[]'],
  smart_messages: ['text', 'subText'],
  outdoorBrands: ['name', 'description'],
  product_tags: ['name'],
  // batch3: park free text. Park NAMES stay as saved (proper nouns). Reader: parks.service normalizePark + pickText.
  parks: ['description'],
  // batch3 routes: only the `description` text (names, city and trail.* stay as saved). Reader: routeDescriptionText (route-description.ts).
  official_routes: ['description'],
  curated_routes: ['description'],
  // batch3 (subcollections, addressed by their full path). Readers: workout-metadata.service (normalizeStoredTextFields on every row).
  // Only rows without an unresolved Hebrew-word tag get a write (the build step leaves those rows Hebrew-only).
  'workoutMetadata/workoutTitles/titles': ['text'],
  'workoutMetadata/smartDescriptions/descriptions': ['description'],
  'workoutMetadata/logicCues/cues': ['text', 'cue'],
  // push_messages stays out on purpose: the push sender reads it only after the functions deploy.
};

/** A collection argument is a top-level name (`parks`) or a slash path to a subcollection (`workoutMetadata/workoutTitles/titles`). */
export function isValidCollectionPath(col: string): boolean {
  const parts = col.split('/');
  return parts.length % 2 === 1 && parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p));
}
export const isSubcollectionPath = (col: string): boolean => col.includes('/');
/** File-name safe key of a collection path (`a/b/c` -> `a__b__c`); top-level names are unchanged. */
export const collectionFileKey = (col: string): string => col.replace(/\//g, '__');
/** Docs an export skips: archived rows of the workoutMetadata subcollections are not served by the app. */
export function exportableDoc(col: string, data: unknown): boolean {
  if (!isSubcollectionPath(col)) return true;
  return (data as { archived?: unknown } | null)?.archived !== true;
}

export const normPath = (p: string): string => p.replace(/\[\d+\]/g, '[]');
export const isReadyPath = (collection: string, path: string): boolean => (READY_PATHS[collection] ?? []).includes(normPath(path));
/** Top-level field a path lives in (`blocks[3].label` -> `blocks`): array paths are written by replacing that whole field. */
export const topKey = (path: string): string => path.split(/[.[]/)[0];
/** Kept for callers: every ready path is writable now (array fields are replaced whole, see applyWrites). */
export const isPatchablePath = (_path: string): boolean => true;

/** Value to store for a field: { he, en } (LocalizedText), the shape the #938 / programs normalizers read. */
function setAtPath(root: unknown, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur = root as Record<string, unknown>;
  parts.forEach((part, pi) => {
    const m = /^([^[\]]*)((?:\[\d+\])*)$/.exec(part)!;
    const idx = (m[2].match(/\d+/g) ?? []).map(Number);
    const steps: Array<string | number> = [m[1], ...idx].filter((x) => x !== '');
    steps.forEach((st, si) => {
      const last = pi === parts.length - 1 && si === steps.length - 1;
      if (last) (cur as any)[st] = value;
      else cur = (cur as any)[st];
    });
  });
}

/** The top-level fields to update for a doc's writes: clones the live value of each touched field and sets { he, en } inside it. */
export function applyWrites(live: Record<string, unknown>, ws: Array<{ path: string; write: { he: string; en: string } }>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const w of ws) {
    const k = topKey(w.path);
    if (!(k in out)) out[k] = JSON.parse(JSON.stringify(live[k]));
    if (w.path === k) out[k] = { he: w.write.he, en: w.write.en };
    else setAtPath(out, w.path, { he: w.write.he, en: w.write.en });
  }
  return out;
}

const isLocalized = (v: unknown): v is { he?: unknown; en?: unknown } =>
  !!v && typeof v === 'object' && !Array.isArray(v) && 'he' in (v as object) && Object.keys(v as object).every((k) => ['he', 'en', 'es'].includes(k));
const isTimestampLike = (v: unknown): boolean => !!v && typeof (v as { toDate?: unknown }).toDate === 'function';

/** Every Hebrew-bearing string leaf of a doc: plain strings and { he, en } objects. Deterministic order. */
export function extractFields(id: string, data: unknown): FieldRef[] {
  const out: FieldRef[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === 'string') {
      if (HEBREW.test(v)) out.push({ id, path, shape: 'string', he: v, en: '' });
    } else if (isLocalized(v)) {
      const he = typeof v.he === 'string' ? v.he : '';
      if (he.trim()) out.push({ id, path, shape: 'localized', he, en: typeof v.en === 'string' ? v.en : '' });
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${path}[${i}]`));
    } else if (v && typeof v === 'object' && !isTimestampLike(v)) {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, path ? `${path}.${k}` : k);
    }
  };
  walk(data, '');
  return out;
}

/** Value at a path like `blocks[3].label` (undefined if absent). */
export function getAtPath(data: unknown, path: string): unknown {
  let cur: unknown = data;
  for (const part of path.split('.')) {
    const m = /^([^[\]]*)((?:\[\d+\])*)$/.exec(part);
    if (!m) return undefined;
    if (m[1]) cur = (cur as Record<string, unknown> | undefined)?.[m[1]];
    for (const idx of m[2].match(/\d+/g) ?? []) cur = (cur as unknown[] | undefined)?.[Number(idx)];
    if (cur === undefined) return undefined;
  }
  return cur;
}

/** The Hebrew a field currently holds (string, or the he slot). */
export function hebrewAt(data: unknown, path: string): string | undefined {
  const v = getAtPath(data, path);
  if (typeof v === 'string') return v;
  if (isLocalized(v) && typeof v.he === 'string') return v.he;
  return undefined;
}
export function englishAt(data: unknown, path: string): string {
  const v = getAtPath(data, path);
  return isLocalized(v) && typeof v.en === 'string' ? v.en : '';
}

export interface ExportFile {
  format: typeof FORMAT; kind: 'export'; collection: string; exportedAt: string;
  docCount: number; fields: FieldRef[];
}
export interface WriteEntry { docId: string; path: string; he: string; en: string; write: { he: string; en: string } }
export interface NeedsCodeEntry { docId: string; path: string; he: string; en: string }
export interface ImportFile {
  format: typeof FORMAT; kind: 'import'; collection: string; sourceExportedAt: string; targetLang: 'en';
  writeShape: '{he,en}'; writes: WriteEntry[]; needsCode: NeedsCodeEntry[]; alreadyTranslated: number;
  /** New English documents (site_content: one doc per locale). Created with create(), never overwriting. */
  creates?: CreateEntry[];
  notes?: string;
}
export interface CreateEntry { docId: string; data: Record<string, unknown> }

export function buildExport(collection: string, docs: Array<{ id: string; data: unknown }>, exportedAt = new Date().toISOString()): ExportFile {
  const fields = docs.slice().sort((a, b) => a.id.localeCompare(b.id)).flatMap((d) => extractFields(d.id, d.data));
  return { format: FORMAT, kind: 'export', collection, exportedAt, docCount: docs.length, fields };
}

export const wordCount = (s: string): number => s.split(/\s+/).filter(Boolean).length;
export function uniqueSources(fields: FieldRef[], onlyMissing = true): string[] {
  return Array.from(new Set(fields.filter((f) => !onlyMissing || !f.en.trim()).map((f) => f.he.trim()))).sort();
}

/** translations: Hebrew source (trimmed) -> English, or null to skip junk. Existing good English is never replaced. */
export function buildImport(exp: ExportFile, translations: Record<string, string | null>): { file: ImportFile; missing: string[]; skipped: string[] } {
  const writes: WriteEntry[] = [];
  const needsCode: NeedsCodeEntry[] = [];
  const missing = new Set<string>();
  const skipped = new Set<string>();
  let already = 0;
  for (const f of exp.fields) {
    if (f.en.trim()) { already++; continue; }
    const en = translations[f.he.trim()];
    if (en === null) { skipped.add(f.he.trim()); continue; } // null = intentionally not translated (test/junk data)
    if (!en || !en.trim()) { missing.add(f.he.trim()); continue; }
    if (isReadyPath(exp.collection, f.path) && isPatchablePath(f.path)) writes.push({ docId: f.id, path: f.path, he: f.he, en, write: { he: f.he, en } });
    else needsCode.push({ docId: f.id, path: f.path, he: f.he, en });
  }
  return {
    file: { format: FORMAT, kind: 'import', collection: exp.collection, sourceExportedAt: exp.exportedAt, targetLang: 'en', writeShape: '{he,en}', writes, needsCode, alreadyTranslated: already },
    missing: Array.from(missing),
    skipped: Array.from(skipped),
  };
}

export interface Issue { check: string; docId: string; path: string; message: string }
/** Content tags (`@זמן_אימון`, `@name`) resolve at read time in both languages: they stay byte for byte in the English. */
export const CONTENT_TAG = /@[\w֐-׿]+/g;
/**
 * Content tags the resolver localizes (src/features/content/branding/core/branding.utils.ts reads their VALUES from the
 * `brandingTags` catalog in the content language; the tag NAMES stay Hebrew, byte for byte, in the English text).
 * A tag NOT in this list is unknown to the resolver and would resolve to nothing or leak Hebrew, so a row carrying one
 * stays Hebrew-only. Kept in step with the resolver by src/features/content/branding/core/__tests__/localized-tags.test.ts.
 */
export const LOCALIZED_CONTENT_TAGS: readonly string[] = [
  // identity, grammar
  '@שם', '@מטרה', '@את/ה', '@מוכן/ה', '@בוא/י', '@עשית/ה', '@תוכל/י', '@תרצה/י', '@מגדר', '@פרסונה',
  // body, place, kit
  '@שריר', '@שרירים', '@מיקום', '@ציוד', '@ספורט', '@רמה', '@שם_תוכנית', '@שם_תרגיל', '@קטגוריה',
  // progress
  '@אחוז_התקדמות', '@רמה_הבאה', '@אחוז_התקדמות_רמה', '@תרגיל_יעד', '@ערך_יעד',
  // proximity, time
  '@מרחק', '@זמן_הגעה', '@זמן_אימון', '@שעה', '@זמן_יום', '@ימי_אי_פעילות', '@שם_הפארק', '@שם_המתקן',
  // workout analysis
  '@עצימות', '@מיקוד', '@מיקוד_פיזיולוגי', '@סטטוס_נפח', '@סיבת_רצף', '@פער_שבועי', '@סקייל_נוכחי', '@רצף', '@צעדים_שנותרו', '@דקות',
  // coach logic cue
  '@סיבת_עצימות', '@סוג_אתגר', '@התאמת_ציוד',
  // running (Hebrew + English aliases)
  '@קצב_בסיס', '@מרחק_יעד', '@שלב_תוכנית', '@סוג_ריצה', '@שבוע', '@שבוע_מתוך',
  '@basePace', '@targetDistanceLabel', '@programPhase', '@runningCategory', '@weekNumber',
  // social
  '@שם_עוקף', '@מיקום_חדש', '@פער_צעדים', '@שם_קבוצה', '@סוג_קבוצה', '@מיקום_מפגש', '@שעת_מפגש', '@יום_מפגש', '@שם_שותף', '@רמת_שותף', '@שעת_הגעה_שותף',
];
/** @deprecated the old numbers-only whitelist; every tag in LOCALIZED_CONTENT_TAGS is allowed now. */
export const SAFE_CONTENT_TAGS = LOCALIZED_CONTENT_TAGS;
export const unsafeTags = (he: string): string[] => Array.from(new Set((he.match(CONTENT_TAG) ?? []).filter((t) => !LOCALIZED_CONTENT_TAGS.includes(t))));
const tokens = (s: string): string[] => (s.match(/\{[^}]+\}|@[\w֐-׿]+|\d+(?:[.,:]\d+)*/g) ?? []).sort();

/** Translation quality gate shared by verify + apply: no Hebrew, no long dash, numbers/placeholders kept, not empty. */
export function checkTranslation(he: string, en: string): string[] {
  const p: string[] = [];
  if (!en.trim()) p.push('empty English');
  if (HEBREW.test(en.replace(CONTENT_TAG, ''))) p.push('Hebrew characters in English');
  if (/[—―]/.test(en)) p.push('long dash');
  if (/copy of|\(copy\)/i.test(en)) p.push('"Copy of"');
  if (en !== en.trim()) p.push('leading/trailing space');
  const lines = (x: string) => x.replace(/\u200b/g, '').split('\n').filter((l) => l.trim()).length;
  if (lines(he) !== lines(en)) p.push('line count differs');
  const a = tokens(he).join('|'), b = tokens(en).join('|');
  if (a !== b) p.push(`numbers/placeholders differ (he: ${a || '-'}; en: ${b || '-'})`);
  return p;
}

/** Import vs export: every write maps to an exported field with identical Hebrew, only ready paths, valid shape. */
export function verifyImport(exp: ExportFile, imp: ImportFile): Issue[] {
  const issues: Issue[] = [];
  if (!isValidCollectionPath(imp.collection)) issues.push({ check: 'collection', docId: '', path: '', message: `invalid collection path ${imp.collection}` });
  if (imp.collection !== exp.collection) issues.push({ check: 'collection', docId: '', path: '', message: `${imp.collection} != ${exp.collection}` });
  if (imp.targetLang !== 'en') issues.push({ check: 'lang', docId: '', path: '', message: 'targetLang must be en' });
  const byKey = new Map(exp.fields.map((f) => [`${f.id}\u0000${f.path}`, f]));
  const seen = new Set<string>();
  for (const w of imp.writes) {
    const k = `${w.docId}\u0000${w.path}`;
    const f = byKey.get(k);
    if (!f) { issues.push({ check: 'unknown-field', docId: w.docId, path: w.path, message: 'not in the export' }); continue; }
    if (seen.has(k)) issues.push({ check: 'duplicate', docId: w.docId, path: w.path, message: 'written twice' });
    seen.add(k);
    if (f.he !== w.he || w.write.he !== f.he) issues.push({ check: 'source-changed', docId: w.docId, path: w.path, message: 'Hebrew differs from the export' });
    if (f.en.trim()) issues.push({ check: 'overwrites-english', docId: w.docId, path: w.path, message: 'export already has English' });
    if (w.write.en !== w.en) issues.push({ check: 'shape', docId: w.docId, path: w.path, message: 'write.en != en' });
    if (!isReadyPath(imp.collection, w.path) || !isPatchablePath(w.path)) issues.push({ check: 'not-ready-path', docId: w.docId, path: w.path, message: 'the app does not read { he, en } here' });
    for (const m of checkTranslation(w.he, w.en)) issues.push({ check: 'quality', docId: w.docId, path: w.path, message: m });
    if (isSubcollectionPath(imp.collection) && unsafeTags(w.he).length) issues.push({ check: 'unsafe-tag', docId: w.docId, path: w.path, message: `${unsafeTags(w.he).join(' ')} is not a tag the resolver localizes: the row stays Hebrew-only` });
  }
  for (const n of imp.needsCode) {
    const f = byKey.get(`${n.docId}\u0000${n.path}`);
    if (!f || f.he !== n.he) issues.push({ check: 'needs-code-source', docId: n.docId, path: n.path, message: 'not in the export / Hebrew differs' });
    for (const m of checkTranslation(n.he, n.en)) issues.push({ check: 'quality', docId: n.docId, path: n.path, message: m });
  }
  return issues;
}

/** Fresh export vs the saved one: Hebrew source of every field unchanged (new/removed fields reported). */
export function sourceDriftBetween(saved: ExportFile, fresh: ExportFile): Issue[] {
  const issues: Issue[] = [];
  const f = new Map(fresh.fields.map((x) => [`${x.id}\u0000${x.path}`, x]));
  for (const s of saved.fields) {
    const n = f.get(`${s.id}\u0000${s.path}`);
    if (!n) issues.push({ check: 'removed', docId: s.id, path: s.path, message: 'field gone' });
    else if (n.he !== s.he) issues.push({ check: 'source-changed', docId: s.id, path: s.path, message: 'Hebrew changed' });
  }
  const sv = new Set(saved.fields.map((x) => `${x.id}\u0000${x.path}`));
  for (const n of fresh.fields) if (!sv.has(`${n.id}\u0000${n.path}`)) issues.push({ check: 'new-field', docId: n.id, path: n.path, message: 'not in the saved export' });
  return issues;
}

/** Live doc vs a write: Hebrew still the same and no English there yet (null = safe to write). */
export function liveDrift(live: unknown, w: WriteEntry): string | null {
  if ((live as { archived?: unknown } | null)?.archived === true) return 'archived row';
  const he = hebrewAt(live, w.path);
  if (he !== w.he) return he === undefined ? 'field missing' : 'Hebrew changed since export';
  if (englishAt(live, w.path).trim()) return 'English already present';
  return null;
}

/** Collections whose English lives in separate `locale: 'en'` docs (the app already serves them) instead of { he, en } fields. */
export const CREATE_COLLECTIONS: readonly string[] = ['site_content'];

/** New-doc plan gate: English locale, id not taken, no Hebrew/long dash left in any text, id ends with -en. */
export function verifyCreates(collection: string, creates: CreateEntry[], existingIds: Set<string>): Issue[] {
  const issues: Issue[] = [];
  if (creates.length && !CREATE_COLLECTIONS.includes(collection)) issues.push({ check: 'creates-not-allowed', docId: '', path: '', message: `${collection} does not use separate English docs` });
  const seen = new Set<string>();
  for (const c of creates) {
    if (existingIds.has(c.docId)) issues.push({ check: 'id-exists', docId: c.docId, path: '', message: 'a document with this id already exists' });
    if (seen.has(c.docId)) issues.push({ check: 'duplicate', docId: c.docId, path: '', message: 'listed twice' });
    seen.add(c.docId);
    if (!/-en$/.test(c.docId)) issues.push({ check: 'id', docId: c.docId, path: '', message: 'id must end with -en' });
    if (c.data.locale !== 'en') issues.push({ check: 'locale', docId: c.docId, path: 'locale', message: 'locale must be en' });
    const txt = JSON.stringify(c.data);
    if (HEBREW.test(txt)) issues.push({ check: 'hebrew', docId: c.docId, path: '', message: 'Hebrew characters in an English doc' });
    if (/[—―]/.test(txt)) issues.push({ check: 'long-dash', docId: c.docId, path: '', message: 'long dash' });
    for (const k of ['updatedAt', 'seedHash', 'createdAt']) if (k in c.data) issues.push({ check: 'server-field', docId: c.docId, path: k, message: 'server-managed field must not be in the import' });
  }
  return issues;
}
