/**
 * Exercise Translation Utilities — Phase 5.5 (i18n)
 *
 * Two complementary functions:
 *
 *   exportExerciseToTranslationJSON(exercise, sourceLang?)
 *     Extracts every translatable text string from an Exercise document
 *     into a compact JSON structure.  Send this to Gemini / Claude with:
 *
 *       "Translate every empty `en` value in this JSON to English.
 *        Keep the JSON structure identical. Do not translate keys."
 *
 *   importTranslationJSON(exercise, translationJSON, targetLang?)
 *     Merges the translated JSON back into the exercise, filling the
 *     `en` slots of all LocalizedText fields.
 *
 * ── Coverage ─────────────────────────────────────────────────────────────────
 *
 *   Top-level:
 *     name                    LocalizedText
 *     content.description     LocalizedText
 *     content.instructions    LocalizedText
 *
 *   Per execution method (indexed by position):
 *     methodName              LocalizedText
 *     notificationText        LocalizedText     (push/alert copy, "before exercise")
 *     specificCues[]          LocalizedText[]   (each cue is { he, en })
 *     highlights[]            LocalizedText[]
 *
 *   NOT translated (intentionally excluded):
 *     • content.goal / notes / highlights (exercise-level — plain string legacy field)
 *     • media fields (video IDs, not text)
 *     • All enum / ID fields
 *
 * ── Usage example ────────────────────────────────────────────────────────────
 *
 *   // 1. Export
 *   const payload = exportExerciseToTranslationJSON(exercise, 'he');
 *   const json    = JSON.stringify(payload, null, 2);
 *
 *   // 2. Call Gemini/Claude (user does this manually or via API)
 *   const translatedJson = await callAI(json); // string → parse back
 *
 *   // 3. Import
 *   const updatedExercise = importTranslationJSON(
 *     exercise,
 *     JSON.parse(translatedJson),
 *     'en'
 *   );
 *
 *   // 4. Save
 *   await updateExercise(exercise.id, updatedExercise);
 */

import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Exercise, LocalizedText, ExerciseLang } from '../core/exercise.types';

const EXERCISES_COLLECTION = 'exercises';
const FIRESTORE_BATCH_LIMIT = 400; // Firestore hard limit is 500; leave headroom

// ============================================================================
// EXPORT
// ============================================================================

/** Shape of a single method's translatable strings inside the exported JSON. */
export interface TranslationMethod {
  methodName: { he: string; en: string };
  /**
   * Push / pre-exercise alert text (e.g. "Sit on a chair or sofa…").
   * Optional in the schema for backward compatibility with files exported
   * before this field was added — old files import without error.
   */
  notificationText?: { he: string; en: string };
  specificCues: Array<{ he: string; en: string }>;
  highlights:   Array<{ he: string; en: string }>;
}

/** Full shape of the exported translation payload. */
export interface TranslationPayload {
  exerciseId: string;
  sourceLang: ExerciseLang;
  /** Top-level translatable text fields. */
  name:         { he: string; en: string };
  description:  { he: string; en: string };
  instructions: { he: string; en: string };
  /** Per-execution-method text (ordered the same as execution_methods[]). */
  methods: TranslationMethod[];
}

function toLocalizedSlot(value: unknown): { he: string; en: string } {
  if (!value) return { he: '', en: '' };
  if (typeof value === 'object' && value !== null) {
    const v = value as Record<string, unknown>;
    return {
      he: String(v.he ?? ''),
      en: String(v.en ?? ''),
    };
  }
  if (typeof value === 'string') return { he: value, en: '' };
  return { he: '', en: '' };
}

/**
 * Same as {@link toLocalizedSlot} but also recognises legacy GenderedText
 * (`{ male, female }`) — used for notificationText which historically supported
 * gendered copy. Falls back to `male` then `female` for the HE slot.
 */
function notificationToLocalizedSlot(value: unknown): { he: string; en: string } {
  if (!value) return { he: '', en: '' };
  if (typeof value === 'string') return { he: value, en: '' };
  if (typeof value === 'object' && value !== null) {
    const v = value as Record<string, unknown>;
    if (typeof v.he === 'string' || typeof v.en === 'string') {
      return { he: String(v.he ?? ''), en: String(v.en ?? '') };
    }
    // Legacy GenderedText
    if (typeof v.male === 'string' || typeof v.female === 'string') {
      return { he: String(v.male ?? v.female ?? ''), en: '' };
    }
  }
  return { he: '', en: '' };
}

/**
 * Export an exercise's translatable strings to a flat JSON payload.
 * Ready to be sent to an AI translation API.
 *
 * @param exercise     The exercise document from Firestore (normalized).
 * @param sourceLang   The language the content is already written in. Default 'he'.
 */
export function exportExerciseToTranslationJSON(
  exercise: Exercise,
  sourceLang: ExerciseLang = 'he',
): TranslationPayload {
  const methods = exercise.execution_methods ?? exercise.executionMethods ?? [];

  return {
    exerciseId: exercise.id,
    sourceLang,

    name:         toLocalizedSlot(exercise.name),
    description:  toLocalizedSlot(exercise.content?.description),
    instructions: toLocalizedSlot(exercise.content?.instructions),

    methods: methods.map((m) => ({
      methodName:       toLocalizedSlot(m.methodName),
      notificationText: notificationToLocalizedSlot(m.notificationText),
      specificCues:     (m.specificCues ?? []).map(toLocalizedSlot),
      highlights:       (m.highlights   ?? []).map(toLocalizedSlot),
    })),
  };
}

// ============================================================================
// IMPORT
// ============================================================================

/**
 * Merge a translated payload back into an exercise, writing only the
 * `targetLang` slot of each LocalizedText field.  The source language
 * slot is left untouched, so this is safe to call even on partial translations.
 *
 * @param exercise        Original exercise (used as the base — not mutated).
 * @param payload         Translated JSON returned by the AI.
 * @param targetLang      Language to write into. Default 'en'.
 * @returns               A shallow-merged copy suitable for `updateExercise()`.
 */
export function importTranslationJSON(
  exercise: Exercise,
  payload: TranslationPayload,
  targetLang: ExerciseLang = 'en',
): Partial<Exercise> {
  if (payload.exerciseId !== exercise.id) {
    throw new Error(
      `[importTranslationJSON] exerciseId mismatch: ` +
      `expected ${exercise.id}, got ${payload.exerciseId}`,
    );
  }

  const writeSlot = (
    existing: LocalizedText | undefined,
    translated: { he: string; en: string },
  ): LocalizedText => {
    const base: LocalizedText = existing ?? { he: '', en: '' };
    return { ...base, [targetLang]: translated[targetLang] ?? '' };
  };

  /**
   * Upgrade an existing notificationText (which may be a plain string,
   * GenderedText, or already LocalizedText) into a LocalizedText, then
   * write only the targetLang slot. The existing source-language value
   * is preserved verbatim.
   */
  const writeNotificationSlot = (
    existing: unknown,
    translated: { he: string; en: string } | undefined,
  ): LocalizedText => {
    const base: LocalizedText = (() => {
      if (!existing) return { he: '', en: '' };
      if (typeof existing === 'string') return { he: existing, en: '' };
      const o = existing as Record<string, unknown>;
      if (typeof o.he === 'string' || typeof o.en === 'string') {
        return { he: String(o.he ?? ''), en: String(o.en ?? '') };
      }
      // Legacy GenderedText → keep male as HE
      if (typeof o.male === 'string' || typeof o.female === 'string') {
        return { he: String(o.male ?? o.female ?? ''), en: '' };
      }
      return { he: '', en: '' };
    })();
    if (!translated) return base;
    return { ...base, [targetLang]: translated[targetLang] ?? '' };
  };

  const updatedMethods = (
    exercise.execution_methods ?? exercise.executionMethods ?? []
  ).map((m, idx) => {
    const tm = payload.methods[idx];
    if (!tm) return m; // No translation data for this index — leave untouched

    return {
      ...m,
      methodName: writeSlot(
        m.methodName as LocalizedText | undefined,
        tm.methodName,
      ) as LocalizedText,
      // Only touch notificationText if the payload actually carries a value
      // for this method (preserves backward compat with v1 export files that
      // didn't include this field).
      notificationText: tm.notificationText !== undefined
        ? writeNotificationSlot(m.notificationText, tm.notificationText)
        : m.notificationText,
      specificCues: (m.specificCues ?? []).map((cue, ci) => {
        const tc = tm.specificCues[ci];
        if (!tc) return cue;
        return writeSlot(cue as LocalizedText | undefined, tc) as LocalizedText;
      }),
      highlights: (m.highlights ?? []).map((hl, hi) => {
        const th = tm.highlights[hi];
        if (!th) return hl;
        return writeSlot(hl as LocalizedText | undefined, th) as LocalizedText;
      }),
    };
  });

  return {
    name: writeSlot(exercise.name, payload.name),
    content: {
      ...exercise.content,
      description:  writeSlot(exercise.content?.description,  payload.description),
      instructions: writeSlot(exercise.content?.instructions, payload.instructions),
    },
    execution_methods: updatedMethods,
    executionMethods:  updatedMethods,
    // Mark the language as now having translated text content
    supportedLangs: Array.from(
      new Set([...(exercise.supportedLangs ?? []), targetLang]),
    ),
  };
}

// ============================================================================
// PROMPT TEMPLATE
// ============================================================================

/**
 * Returns a ready-to-paste AI prompt string for the given payload.
 * Paste the result of this function directly into Gemini / Claude.
 */
export function buildTranslationPrompt(payload: TranslationPayload): string {
  const json = JSON.stringify(payload, null, 2);
  return (
    `You are a professional fitness content translator.\n` +
    `Translate every empty "en" string value in the following JSON from ` +
    `${payload.sourceLang === 'he' ? 'Hebrew' : payload.sourceLang} to English.\n` +
    `Rules:\n` +
    `  - Keep the JSON structure identical — do NOT add or remove keys.\n` +
    `  - Do NOT translate the keys (e.g. "he", "en", "methodName").\n` +
    `  - If a field is already filled in English, keep it as-is.\n` +
    `  - Use clear, motivating fitness language suitable for a training app.\n` +
    `  - Maintain the tone: instructional, concise, encouraging.\n` +
    `  - Keep "exerciseId" and "sourceLang" unchanged.\n\n` +
    `JSON:\n\`\`\`json\n${json}\n\`\`\``
  );
}

// ============================================================================
// BULK EXPORT / IMPORT
// ============================================================================

/**
 * Wrapper format for a bulk-translation file containing many exercises.
 * Versioned so future schema changes can be detected and migrated.
 */
export const BULK_FORMAT_TAG = 'out-run-bulk-translation' as const;
export const BULK_FORMAT_VERSION = 1 as const;

export interface BulkTranslationFile {
  format: typeof BULK_FORMAT_TAG;
  version: typeof BULK_FORMAT_VERSION;
  sourceLang: ExerciseLang;
  /** Suggested target language. The importer can override at apply time. */
  targetLang: ExerciseLang;
  exportedAt: string; // ISO timestamp
  exerciseCount: number;
  exercises: TranslationPayload[];
}

/**
 * Build a single JSON file containing translatable text from EVERY exercise.
 * Designed to be downloaded, sent to an AI in one batch, and re-imported.
 *
 * Filtering: optionally skips exercises that already have all `en` slots filled.
 */
export function exportAllExercisesToTranslationJSON(
  exercises: Exercise[],
  options: {
    sourceLang?: ExerciseLang;
    targetLang?: ExerciseLang;
    /** When true, skip exercises whose `name.en` already has a value. */
    skipAlreadyTranslated?: boolean;
  } = {},
): BulkTranslationFile {
  const sourceLang = options.sourceLang ?? 'he';
  const targetLang = options.targetLang ?? 'en';

  const filtered = options.skipAlreadyTranslated
    ? exercises.filter((ex) => {
        const enName = (ex.name as LocalizedText | undefined)?.en;
        return !enName || !enName.trim();
      })
    : exercises;

  return {
    format: BULK_FORMAT_TAG,
    version: BULK_FORMAT_VERSION,
    sourceLang,
    targetLang,
    exportedAt: new Date().toISOString(),
    exerciseCount: filtered.length,
    exercises: filtered.map((ex) => exportExerciseToTranslationJSON(ex, sourceLang)),
  };
}

/**
 * Validate a parsed JSON object is a well-formed bulk translation file.
 * Throws with a user-readable Hebrew message if validation fails.
 */
export function validateBulkTranslationFile(raw: unknown): BulkTranslationFile {
  if (!raw || typeof raw !== 'object') {
    throw new Error('הקובץ אינו JSON תקין.');
  }
  const o = raw as Record<string, unknown>;
  if (o.format !== BULK_FORMAT_TAG) {
    throw new Error(
      `פורמט קובץ לא מזוהה. צפוי "${BULK_FORMAT_TAG}", התקבל "${String(o.format)}".`,
    );
  }
  if (typeof o.version !== 'number' || o.version > BULK_FORMAT_VERSION) {
    throw new Error(`גרסת קובץ לא נתמכת: ${String(o.version)}.`);
  }
  if (!Array.isArray(o.exercises)) {
    throw new Error('שדה "exercises" חסר או אינו מערך.');
  }
  for (const [i, ex] of (o.exercises as unknown[]).entries()) {
    if (!ex || typeof ex !== 'object') {
      throw new Error(`רשומה ${i} בקובץ לא תקינה.`);
    }
    const e = ex as Record<string, unknown>;
    if (typeof e.exerciseId !== 'string' || !e.exerciseId.trim()) {
      throw new Error(`רשומה ${i}: שדה exerciseId חסר.`);
    }
  }
  return raw as BulkTranslationFile;
}

// ----------------------------------------------------------------------------
// SAFE BULK WRITE
// ----------------------------------------------------------------------------

export interface BulkApplyResult {
  attempted: number;
  updated: number;
  skipped: { exerciseId: string; reason: string }[];
  errors:  { exerciseId: string; message: string }[];
}

/**
 * Apply a bulk translation file to Firestore.
 *
 * Safety guarantees:
 *   1. We work off the `existingExercises` snapshot the caller provides — this
 *      means the Hebrew (or any source-lang) value is read from the live doc,
 *      NOT from the JSON file. The translator can never overwrite source content.
 *   2. We write only the explicitly-translated language fields:
 *        - `name`               (LocalizedText, full object — `he` preserved from existing)
 *        - `content.description` / `content.instructions` (same)
 *        - `execution_methods`  (rebuilt with original HE + new EN slots only)
 *   3. Every other field on the document is left untouched.
 *   4. Writes are batched (Firestore allows 500 ops / batch).
 *
 * @param existingExercises  Live exercise snapshot (from getAllExercises()).
 * @param file               Parsed and validated bulk translation file.
 * @param overrideTargetLang Optional language override; defaults to file.targetLang.
 */
export async function applyBulkTranslations(
  existingExercises: Exercise[],
  file: BulkTranslationFile,
  overrideTargetLang?: ExerciseLang,
): Promise<BulkApplyResult> {
  const targetLang = overrideTargetLang ?? file.targetLang ?? 'en';
  const byId = new Map(existingExercises.map((ex) => [ex.id, ex]));

  const result: BulkApplyResult = {
    attempted: file.exercises.length,
    updated: 0,
    skipped: [],
    errors: [],
  };

  // Build patches in memory first so we can fail fast on bad input
  type WriteTask = { id: string; patch: Record<string, unknown> };
  const tasks: WriteTask[] = [];

  for (const payload of file.exercises) {
    const existing = byId.get(payload.exerciseId);
    if (!existing) {
      result.skipped.push({
        exerciseId: payload.exerciseId,
        reason: 'תרגיל לא נמצא בבסיס הנתונים',
      });
      continue;
    }

    try {
      const patch = importTranslationJSON(existing, payload, targetLang);
      // Only keep the fields we actually intend to update — extra safety
      const safePatch: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };
      if (patch.name !== undefined)              safePatch.name = patch.name;
      if (patch.content !== undefined)           safePatch.content = patch.content;
      if (patch.execution_methods !== undefined) safePatch.execution_methods = patch.execution_methods;
      if (patch.executionMethods !== undefined)  safePatch.executionMethods  = patch.executionMethods;
      if (patch.supportedLangs !== undefined)    safePatch.supportedLangs    = patch.supportedLangs;
      tasks.push({ id: payload.exerciseId, patch: safePatch });
    } catch (e) {
      result.errors.push({
        exerciseId: payload.exerciseId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Commit in batched chunks
  for (let i = 0; i < tasks.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = tasks.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const { id, patch } of chunk) {
      batch.update(doc(db, EXERCISES_COLLECTION, id), patch);
    }
    try {
      await batch.commit();
      result.updated += chunk.length;
    } catch (e) {
      // If the whole batch fails, mark all its tasks as errors
      const message = e instanceof Error ? e.message : String(e);
      for (const t of chunk) {
        result.errors.push({ exerciseId: t.id, message });
      }
    }
  }

  return result;
}

/**
 * Helper: trigger a browser download of the bulk export JSON file.
 * Filename includes the timestamp for traceability.
 */
export function downloadBulkTranslationFile(file: BulkTranslationFile): void {
  if (typeof window === 'undefined') return;
  const json = JSON.stringify(file, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  a.href = url;
  a.download = `out-run-translations-${file.sourceLang}-to-${file.targetLang}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
