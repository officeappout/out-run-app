// @ts-nocheck -- standalone tsx scripts (scripts/ is not compiled with the app tsconfig target)
/**
 * Pure helpers of the exercise content pipeline (docs/i18n/ADD-LANGUAGE.md, phase 5). No Firestore, no network, no app imports.
 *
 * File format = the admin panel's bulk-translation v1 (src/features/content/exercises/services/exercise-translation.utils.ts),
 * generalized to any language pair: every text slot is `{ <source>: string, <target>: string }` (the admin file hard-codes he/en).
 * Importing writes ONLY the target slot (buildPatch mirrors importTranslationJSON + applyBulkTranslations' safePatch).
 */

export const BULK_FORMAT_TAG = 'out-run-bulk-translation' as const;
export const BULK_FORMAT_VERSION = 1 as const;

export type Slot = Record<string, string>;
export interface MethodPayload { methodName: Slot; notificationText?: Slot; specificCues: Slot[]; highlights: Slot[] }
export interface Payload {
  exerciseId: string;
  sourceLang: string;
  name: Slot;
  description: Slot;
  instructions: Slot;
  methods: MethodPayload[];
}
export interface BulkFile {
  format: typeof BULK_FORMAT_TAG;
  version: typeof BULK_FORMAT_VERSION;
  sourceLang: string;
  targetLang: string;
  exportedAt: string;
  exerciseCount: number;
  exercises: Payload[];
}

// ---------------------------------------------------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------------------------------------------------

function slotOf(value: unknown, src: string, tgt: string, legacyGendered = false): Slot {
  if (!value) return { [src]: '', [tgt]: '' };
  if (typeof value === 'string') return { [src]: value, [tgt]: '' };
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (legacyGendered && typeof v[src] !== 'string' && typeof v[tgt] !== 'string' && (typeof v.male === 'string' || typeof v.female === 'string')) {
      return { [src]: String(v.male ?? v.female ?? ''), [tgt]: '' };
    }
    return { [src]: String(v[src] ?? ''), [tgt]: String(v[tgt] ?? '') };
  }
  return { [src]: '', [tgt]: '' };
}

export const methodsOf = (d: any): any[] => d?.execution_methods ?? d?.executionMethods ?? [];

/** One exercise document (raw Firestore data + id) -> payload. Same coverage as exportExerciseToTranslationJSON. */
export function exerciseToPayload(d: any, src: string, tgt: string): Payload {
  return {
    exerciseId: d.id,
    sourceLang: src,
    name: slotOf(d.name, src, tgt),
    description: slotOf(d.content?.description, src, tgt),
    instructions: slotOf(d.content?.instructions, src, tgt),
    methods: methodsOf(d).map((m: any) => ({
      methodName: slotOf(m.methodName, src, tgt),
      notificationText: slotOf(m.notificationText, src, tgt, true),
      specificCues: (m.specificCues ?? []).map((c: unknown) => slotOf(c, src, tgt)),
      highlights: (m.highlights ?? []).map((c: unknown) => slotOf(c, src, tgt)),
    })),
  };
}

export function buildBulkFile(docs: any[], opts: { source: string; target: string; exportedAt?: string }): BulkFile {
  const exercises = [...docs].sort((a, b) => String(a.id).localeCompare(String(b.id))).map((d) => exerciseToPayload(d, opts.source, opts.target));
  return { format: BULK_FORMAT_TAG, version: BULK_FORMAT_VERSION, sourceLang: opts.source, targetLang: opts.target, exportedAt: opts.exportedAt ?? new Date().toISOString(), exerciseCount: exercises.length, exercises };
}

export function validateBulkFile(raw: any): BulkFile {
  if (!raw || typeof raw !== 'object') throw new Error('not a JSON object');
  if (raw.format !== BULK_FORMAT_TAG) throw new Error(`format must be "${BULK_FORMAT_TAG}", got "${raw.format}"`);
  if (typeof raw.version !== 'number' || raw.version > BULK_FORMAT_VERSION) throw new Error(`unsupported version ${raw.version}`);
  if (!Array.isArray(raw.exercises)) throw new Error('"exercises" is not an array');
  if (raw.targetLang === 'he' || raw.targetLang === raw.sourceLang) throw new Error(`targetLang "${raw.targetLang}" is not allowed (never the source language or he)`);
  for (const [i, e] of raw.exercises.entries()) {
    if (!e || typeof e.exerciseId !== 'string' || !e.exerciseId.trim()) throw new Error(`exercise ${i}: exerciseId missing`);
    if (e.sourceLang !== undefined && e.sourceLang !== raw.sourceLang) throw new Error(`exercise ${e.exerciseId}: sourceLang ${e.sourceLang} != file sourceLang ${raw.sourceLang}`);
  }
  return raw as BulkFile;
}

/** Every slot of a payload with a stable path (used for contexts and for walking two files in lockstep). */
export function slotsOf(p: Payload): Array<{ path: string; kind: string; slot: Slot }> {
  const out: Array<{ path: string; kind: string; slot: Slot }> = [
    { path: 'name', kind: 'name', slot: p.name },
    { path: 'description', kind: 'description', slot: p.description },
    { path: 'instructions', kind: 'instructions', slot: p.instructions },
  ];
  p.methods.forEach((m, mi) => {
    out.push({ path: `methods[${mi}].methodName`, kind: 'methodName', slot: m.methodName });
    if (m.notificationText) out.push({ path: `methods[${mi}].notificationText`, kind: 'notificationText', slot: m.notificationText });
    m.specificCues.forEach((s, i) => out.push({ path: `methods[${mi}].specificCues[${i}]`, kind: 'cue', slot: s }));
    m.highlights.forEach((s, i) => out.push({ path: `methods[${mi}].highlights[${i}]`, kind: 'highlight', slot: s }));
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Corrupt / empty detection and chunking
// ---------------------------------------------------------------------------------------------------------------------

const SCRIPT: Record<string, RegExp> = {
  he: /[֐-׿־׳״]/u,
  ar: /[؀-ۿ]/u,
  ru: /[Ѐ-ӿ]/u,
};

/** Characters of the source language in a text that should be in the target language. Unknown scripts: never. */
export function hasSourceScript(text: string, sourceLang: string): boolean {
  return (SCRIPT[sourceLang] ?? /$^/).test(text);
}

/** A target slot that must be (re)translated: empty, or corrupt ("Copy of ...", "(Copy)", source-language characters). */
export function isEmptyOrCorrupt(target: string | undefined, sourceLang: string): boolean {
  const t = (target ?? '').trim();
  if (!t) return true;
  return /^copy of\b/i.test(t) || /\(copy\)/i.test(t) || /\bcopy of\b/i.test(t) || hasSourceScript(t, sourceLang);
}

export interface StringEntry {
  id: string;
  source: string;
  kind: string;
  /** Up to 3 places the string is used: exercise id + path + the exercise's source name. */
  contexts: Array<{ exerciseId: string; path: string; exerciseName: string }>;
  /** The translator fills this. */
  target: string;
}

export interface Chunk {
  chunk: number;
  totalChunks: number;
  sourceLang: string;
  targetLang: string;
  instructions: string;
  items: StringEntry[];
}

/** Unique source strings that still need the target language, in a stable order (kind, then text). */
export function uniqueStrings(file: BulkFile): StringEntry[] {
  const map = new Map<string, StringEntry>();
  for (const p of file.exercises) {
    for (const { path, kind, slot } of slotsOf(p)) {
      const source = (slot[file.sourceLang] ?? '').trim();
      if (!source || !isEmptyOrCorrupt(slot[file.targetLang], file.sourceLang)) continue;
      let e = map.get(source);
      if (!e) { e = { id: '', source, kind, contexts: [], target: '' }; map.set(source, e); }
      if (e.contexts.length < 3) e.contexts.push({ exerciseId: p.exerciseId, path, exerciseName: p.name[file.sourceLang] ?? '' });
    }
  }
  const sorted = [...map.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.source.localeCompare(b.source));
  sorted.forEach((e, i) => { e.id = `s${String(i + 1).padStart(5, '0')}`; });
  return sorted;
}

export function chunkStrings(entries: StringEntry[], opts: { size: number; sourceLang: string; targetLang: string; instructions?: string }): Chunk[] {
  const total = Math.max(1, Math.ceil(entries.length / opts.size));
  const chunks: Chunk[] = [];
  for (let i = 0; i < entries.length; i += opts.size) {
    chunks.push({
      chunk: chunks.length + 1, totalChunks: total, sourceLang: opts.sourceLang, targetLang: opts.targetLang,
      instructions: opts.instructions ?? `Fill every "target" with the ${opts.targetLang} translation of "source". Keep ids, sources and the order. Follow docs/i18n/${opts.targetLang.toUpperCase()}-GLOSSARY.md and ${opts.targetLang.toUpperCase()}-EXERCISE-NAMES.md. No ${opts.sourceLang} characters, no "Copy of", no long dash.`,
      items: entries.slice(i, i + opts.size),
    });
  }
  return chunks;
}

// ---------------------------------------------------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------------------------------------------------

export interface MergeReport {
  filled: number;
  keptExisting: number;
  stillMissing: number;
  /** Translator output that was refused (empty, contains source-language characters, "Copy of", long dash, source echoed back). */
  rejected: Array<{ source: string; target: string; reason: string }>;
  /** Source strings present in chunks but not in the export (stale chunk). */
  unknownSources: string[];
}

export function mergeTranslations(exportFile: BulkFile, chunks: Array<{ items: Array<{ source: string; target: string }> }>): { file: BulkFile; report: MergeReport } {
  const { sourceLang: src, targetLang: tgt } = exportFile;
  const known = new Set<string>();
  for (const p of exportFile.exercises) for (const { slot } of slotsOf(p)) if ((slot[src] ?? '').trim()) known.add(slot[src]!.trim());

  const report: MergeReport = { filled: 0, keptExisting: 0, stillMissing: 0, rejected: [], unknownSources: [] };
  const translated = new Map<string, string>();
  for (const c of chunks) {
    for (const it of c.items) {
      const source = (it.source ?? '').trim();
      const target = (it.target ?? '').trim();
      if (!known.has(source)) { if (!report.unknownSources.includes(source)) report.unknownSources.push(source); continue; }
      if (!target) continue;
      let reason = '';
      if (isEmptyOrCorrupt(target, src)) reason = 'contains source-language characters or "Copy of"';
      else if (target.includes('—')) reason = 'long dash';
      else if (target === source && /[^\x00-\x7f]/.test(source)) reason = 'identical to source';
      if (reason) { report.rejected.push({ source, target, reason }); continue; }
      translated.set(source, target);
    }
  }

  const out: BulkFile = JSON.parse(JSON.stringify(exportFile));
  for (const p of out.exercises) {
    for (const { slot } of slotsOf(p)) {
      const source = (slot[src] ?? '').trim();
      if (!source) continue;
      if (!isEmptyOrCorrupt(slot[tgt], src)) { report.keptExisting++; continue; }
      const t = translated.get(source);
      if (t) { slot[tgt] = t; report.filled++; } else { slot[tgt] = ''; report.stillMissing++; }
    }
  }
  return { file: out, report };
}

// ---------------------------------------------------------------------------------------------------------------------
// Verify (export vs import)
// ---------------------------------------------------------------------------------------------------------------------

export interface VerifyIssue { exerciseId: string; path: string; check: string; message: string }

export function verifyImport(exportFile: BulkFile, importFile: BulkFile, opts: { requireComplete?: boolean } = {}): VerifyIssue[] {
  const issues: VerifyIssue[] = [];
  const add = (exerciseId: string, path: string, check: string, message: string) => issues.push({ exerciseId, path, check, message });
  const { sourceLang: src, targetLang: tgt } = exportFile;

  if (importFile.sourceLang !== src) add('*', 'file', 'lang', `sourceLang ${importFile.sourceLang} != ${src}`);
  if (importFile.targetLang !== tgt) add('*', 'file', 'lang', `targetLang ${importFile.targetLang} != ${tgt}`);
  for (const e of importFile.exercises) if (e.sourceLang !== src) add(e.exerciseId, 'file', 'lang', `payload sourceLang ${e.sourceLang} != ${src}`);
  const exIds = exportFile.exercises.map((e) => e.exerciseId);
  const imIds = importFile.exercises.map((e) => e.exerciseId);
  for (const id of exIds) if (!imIds.includes(id)) add(id, 'file', 'ids', 'exercise missing in import');
  for (const id of imIds) if (!exIds.includes(id)) add(id, 'file', 'ids', 'exercise not in export');
  if (new Set(imIds).size !== imIds.length) add('*', 'file', 'ids', 'duplicate exerciseId in import');
  if (exIds.join('|') !== imIds.join('|') && !issues.some((i) => i.check === 'ids')) add('*', 'file', 'ids', 'exercise order differs');
  if (importFile.exerciseCount !== importFile.exercises.length) add('*', 'file', 'ids', 'exerciseCount does not match exercises.length');

  const byId = new Map(importFile.exercises.map((e) => [e.exerciseId, e]));
  for (const ex of exportFile.exercises) {
    const im = byId.get(ex.exerciseId);
    if (!im) continue;
    const a = slotsOf(ex);
    const b = slotsOf(im);
    if (ex.methods.length !== im.methods.length) { add(ex.exerciseId, 'methods', 'structure', `methods ${ex.methods.length} != ${im.methods.length}`); continue; }
    ex.methods.forEach((m, i) => {
      const n = im.methods[i]!;
      if (m.specificCues.length !== n.specificCues.length) add(ex.exerciseId, `methods[${i}].specificCues`, 'structure', `cues ${m.specificCues.length} != ${n.specificCues.length}`);
      if (m.highlights.length !== n.highlights.length) add(ex.exerciseId, `methods[${i}].highlights`, 'structure', `highlights ${m.highlights.length} != ${n.highlights.length}`);
      if (!!m.notificationText !== !!n.notificationText) add(ex.exerciseId, `methods[${i}].notificationText`, 'structure', 'notificationText presence differs');
    });
    if (a.length !== b.length) continue;
    a.forEach((s, i) => {
      const t = b[i]!;
      if ((s.slot[src] ?? '') !== (t.slot[src] ?? '')) add(ex.exerciseId, s.path, 'source', 'source text changed');
      const target = t.slot[tgt] ?? '';
      if (target && hasSourceScript(target, src)) add(ex.exerciseId, s.path, 'script', `${src} characters in target`);
      if (/\bcopy of\b|\(copy\)/i.test(target)) add(ex.exerciseId, s.path, 'copy', '"Copy of" / "(Copy)" in target');
      if (opts.requireComplete && (s.slot[src] ?? '').trim() && !target.trim()) add(ex.exerciseId, s.path, 'empty', 'target is empty');
      // A filled target in the export must survive untouched (merge fills only empty/corrupt slots).
      const before = s.slot[tgt] ?? '';
      if (before && !isEmptyOrCorrupt(before, src) && before !== target) add(ex.exerciseId, s.path, 'overwrite', 'a good existing target was changed');
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------------------------------------------------
// Apply: patch building and post-write verification (mirrors importTranslationJSON + applyBulkTranslations' safePatch)
// ---------------------------------------------------------------------------------------------------------------------

export interface Patch { name: any; content: any; execution_methods: any[]; executionMethods: any[]; supportedLangs: string[] }

/** Writes only the `tgt` key of each LocalizedText; the source slot and every other key are kept verbatim. */
export function buildPatch(d: any, payload: Payload, tgt: string): Patch {
  const src = payload.sourceLang;
  if (tgt === 'he' || tgt === src) throw new Error(`buildPatch: target "${tgt}" is not allowed (never the source language or he)`);
  const write = (existing: unknown, translated: Slot | undefined) => {
    const base = typeof existing === 'string' ? { [src]: existing } : existing && typeof existing === 'object' ? (existing as Record<string, unknown>) : { he: '', en: '' };
    return { ...base, [tgt]: translated?.[tgt] ?? '' };
  };
  const writeNotification = (existing: unknown, translated: Slot | undefined) => {
    const base: Record<string, unknown> = (() => {
      if (!existing) return { he: '', en: '' };
      if (typeof existing === 'string') return { [src]: existing };
      const o = existing as Record<string, unknown>;
      if (typeof o.he === 'string' || typeof o.en === 'string' || typeof o[src] === 'string' || typeof o[tgt] === 'string') return { ...o };
      if (typeof o.male === 'string' || typeof o.female === 'string') return { [src]: String(o.male ?? o.female ?? '') };
      return { he: '', en: '' };
    })();
    return translated ? { ...base, [tgt]: translated[tgt] ?? '' } : base;
  };
  const methods = methodsOf(d).map((m: any, idx: number) => {
    const tm = payload.methods[idx];
    if (!tm) return m;
    return {
      ...m,
      methodName: write(m.methodName, tm.methodName),
      notificationText: tm.notificationText !== undefined ? writeNotification(m.notificationText, tm.notificationText) : m.notificationText,
      specificCues: (m.specificCues ?? []).map((c: unknown, ci: number) => (tm.specificCues[ci] ? write(c, tm.specificCues[ci]) : c)),
      highlights: (m.highlights ?? []).map((c: unknown, hi: number) => (tm.highlights[hi] ? write(c, tm.highlights[hi]) : c)),
    };
  });
  return {
    name: write(d.name, payload.name),
    content: { ...d.content, description: write(d.content?.description, payload.description), instructions: write(d.content?.instructions, payload.instructions) },
    execution_methods: methods,
    executionMethods: methods,
    supportedLangs: Array.from(new Set([...(d.supportedLangs ?? []), tgt])),
  };
}

/** Is the live document still what the export saw? (source text, structure, no newer good target). Returns the reasons it is not. */
export function sourceDrift(live: any, payload: Payload, tgt: string): string[] {
  const now = exerciseToPayload({ ...live, id: payload.exerciseId }, payload.sourceLang, tgt);
  const reasons: string[] = [];
  if (now.methods.length !== payload.methods.length) return [`methods ${now.methods.length} != ${payload.methods.length}`];
  const a = slotsOf(now);
  const b = slotsOf(payload);
  if (a.length !== b.length) return ['slot structure changed'];
  a.forEach((s, i) => {
    if ((s.slot[payload.sourceLang] ?? '') !== (b[i]!.slot[payload.sourceLang] ?? '')) reasons.push(`${s.path}: source text changed`);
    // A good live target that differs from the import was edited after the export: never overwrite it.
    const liveTarget = s.slot[tgt] ?? '';
    if (!isEmptyOrCorrupt(liveTarget, payload.sourceLang) && liveTarget !== (b[i]!.slot[tgt] ?? '')) reasons.push(`${s.path}: target changed since export`);
  });
  return reasons;
}

/** After a write: source slots unchanged, target slots equal the import, every field outside the patch unchanged. */
export function verifyApplied(before: any, after: any, payload: Payload, tgt: string): string[] {
  const problems: string[] = [];
  const src = payload.sourceLang;
  const pb = exerciseToPayload({ ...before, id: payload.exerciseId }, src, tgt);
  const pa = exerciseToPayload({ ...after, id: payload.exerciseId }, src, tgt);
  const sb = slotsOf(pb);
  const sa = slotsOf(pa);
  const si = slotsOf(payload);
  if (sb.length !== sa.length) problems.push('slot structure changed');
  else {
    sa.forEach((s, i) => {
      if ((s.slot[src] ?? '') !== (sb[i]!.slot[src] ?? '')) problems.push(`${s.path}: source slot changed`);
      if ((s.slot[tgt] ?? '') !== (si[i]?.slot[tgt] ?? '')) problems.push(`${s.path}: target slot differs from the import`);
    });
  }
  const PATCHED = new Set(['name', 'content', 'execution_methods', 'executionMethods', 'supportedLangs', 'updatedAt']);
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (PATCHED.has(k)) continue;
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) problems.push(`unrelated field "${k}" changed`);
  }
  for (const k of new Set([...Object.keys(before.content ?? {}), ...Object.keys(after.content ?? {})])) {
    if (k === 'description' || k === 'instructions') continue;
    if (JSON.stringify(before.content?.[k]) !== JSON.stringify(after.content?.[k])) problems.push(`content.${k} changed`);
  }
  return problems;
}
