/**
 * Demonstrated-strength-level derivation (04.10.2026, §13.88). Read-only,
 * zero writes anywhere, no UI, no API route — a standalone building
 * block for a future comparison-to-thresholds feature, not wired to
 * anything yet. Given a uid and a fixed 30-day window, returns the
 * highest level a soldier actually DEMONSTRATED in real workouts, for
 * the `pull`/`push` base programs only, plus the reps behind that level.
 *
 * === Why not progression.domains.*.currentLevel ===
 * That field is NOT workout-derived evidence — it is directly
 * overwritable by the user's own "עדכן רמה" self-assessment re-entry
 * (ProgramDrawer.tsx) from 7 different entry points, AND by an admin's
 * "ערבב" (shuffle) button (admin/users/[uid]/page.tsx) that randomizes
 * it to 1-15. Reading it would not be reading evidence; it would be
 * reading whatever a human last typed or randomized. This module never
 * touches it — level is derived ONLY from real exerciseLog entries.
 *
 * === Derivation path ===
 * workouts (global collection) → segments[].actual.exerciseLog[].exerciseId
 * → exercises/{id}.targetPrograms[{programId, level}] → highest level.
 *
 * === The hybrid-workout structural finding (confirmed by reading the
 * actual save code, not assumed) ===
 * A pure-strength workout's `segments` is a single-element array with
 * the strength segment at index 0 (active/page.tsx:535). A HYBRID
 * workout's `segments` is a 3-element array — "legA / station / legB"
 * (hybrid-save.service.ts:64) — where the strength segment ("station")
 * sits at index 1, NOT 0. A naive `segments[0]` read (matching the
 * admin UI's own simpler read path, which only ever opens for
 * workoutType==='strength' docs) would silently miss EVERY hybrid
 * workout's strength evidence. This module instead iterates the WHOLE
 * `segments` array and filters each one by its own `kind === 'strength'`
 * (SessionSegmentKind = 'aerobic' | 'strength', storage.service.ts:18) —
 * correct for both pure-strength and hybrid workouts, with no branching
 * on the top-level `workoutType` at all.
 *
 * === The allowlist is resolved by slug, not hardcoded by raw id ===
 * `exercises/{id}.targetPrograms[].programId` is an opaque Firestore
 * document id into the `programs` collection (e.g. 'UPDBtTdCvX748dtBlWYj'),
 * never the literal string 'pull'/'push'. This module resolves the real
 * `pull`/`push` program ids ONCE per call via `programs.where('slug','in',
 * [...])` (single-field `in`, no composite index needed) rather than
 * hardcoding those ids directly — hardcoding a raw Firestore id would
 * silently break if that collection is ever re-seeded, with no error.
 * This is also what makes the allowlist a real allowlist and not a
 * name-match: a program whose SLUG merely contains "pull" (confirmed in
 * production: `one_arm_pullup`, a real, different program — exactly the
 * "pull_up_pro" case named in the spec) resolves to a DIFFERENT program
 * id and is correctly excluded, because its id never matches the
 * resolved `pull` id.
 *
 * === Rule 2 — same program, two levels on one exercise doc → the lower ===
 * Confirmed structurally possible (TargetProgramRef[] has no uniqueness
 * constraint) but NOT present in production as of 04.10.2026 (verified:
 * 0 of 371 exercises have this shape) — implemented defensively anyway,
 * per instruction, exercised only by this round's synthetic emulator
 * tests.
 *
 * === What this module does NOT do ===
 * It never decides "meets threshold" or "fit for duty" — it returns a
 * level and a rep count, nothing else. Threshold comparison (including
 * the male/female distinction) belongs wherever readiness thresholds
 * already live; duplicating that logic here was explicitly forbidden.
 *
 * === Extensibility for a future anomaly flag ===
 * `ProgramLevelResult` is a plain object specifically so a future
 * `anomalyFlag?: ...` field can be added without touching this
 * function's signature at all — not built now, per instruction.
 */
import type { Firestore } from 'firebase-admin/firestore';

export const STRENGTH_LEVEL_WINDOW_DAYS = 30;
/**
 * The minimum-evidence gate, 05.10.2026 correction (David) — this is a
 * PER-LEVEL minimum, not a per-program one. The determined level is the
 * HIGHEST level that has at least this many performances OF ITS OWN in
 * the window — one rep at level 11 followed by two real sets at level
 * 6 reads as level 6, never 11, even though the PROGRAM overall has 3
 * performances total. A single high performance can never carry a
 * level on the strength of some OTHER level's evidence.
 */
const MIN_PERFORMANCES_FOR_LEVEL = 2;
const PROGRAM_SLUGS = ['pull', 'push'] as const;
export type BaseProgramSlug = typeof PROGRAM_SLUGS[number];

export interface ProgramLevelResult {
  /** null = not enough evidence in the window (zero workouts, or no single level individually reached MIN_PERFORMANCES_FOR_LEVEL) — "unknown," never a real level and never "fails to meet." */
  level: number | null;
  /** null = "no count" — either no level was determined, or every performance at the highest demonstrated level came from a time-held exercise (no rep count exists) or an empty set. Never 0 — 0 would claim "did it and got zero," which is a different, false statement. */
  reps: number | null;
}

export type StrengthLevelsBySlug = Record<BaseProgramSlug, ProgramLevelResult>;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

interface ExerciseLevelInfo {
  /** 'rest'-type log entries are never a demonstrated strength performance — excluded entirely, not just reps-less. */
  type: 'reps' | 'time' | 'rest';
  levelBySlug: Partial<Record<BaseProgramSlug, number>>;
}

interface Performance {
  level: number;
  /** null when this specific performance can't contribute a rep count (time-type exercise, or an empty confirmedReps) — the performance still counts as evidence toward the level, it just has nothing to offer the reps output. */
  reps: number[] | null;
}

/**
 * Given a list of uids, returns each one's demonstrated pull/push level
 * + reps from the last STRENGTH_LEVEL_WINDOW_DAYS days. Every requested
 * uid is present in the result (never silently missing) — a uid with
 * zero qualifying workouts simply gets { level: null, reps: null } for
 * both programs, same meaning as "no level individually had enough
 * performances of its own" (MIN_PERFORMANCES_FOR_LEVEL's own comment).
 *
 * Throws (never returns a null-filled result) if the `pull`/`push`
 * program-id allowlist itself fails to resolve — see that block's own
 * comment for why this must be loud, not a silent null.
 */
export async function computeDemonstratedStrengthLevels(
  db: Firestore,
  uids: string[],
): Promise<Record<string, StrengthLevelsBySlug>> {
  const result: Record<string, StrengthLevelsBySlug> = {};
  for (const uid of uids) {
    result[uid] = {
      pull: { level: null, reps: null },
      push: { level: null, reps: null },
    };
  }
  if (uids.length === 0) return result;

  // Resolve the two real program ids by slug — never hardcoded, never a name-match.
  //
  // 05.10.2026 (David's correction) — a resolution failure here (the
  // `pull`/`push` slug renamed, or duplicated across two program docs)
  // must NEVER produce a silent `null` result. `null` is reserved for
  // EXACTLY ONE meaning throughout this module: "this soldier didn't
  // train enough to tell." An infrastructure problem — the allowlist
  // itself failing to resolve — would otherwise look IDENTICAL to that
  // from every caller's perspective ("not enough linked users," David's
  // own example), and could sit undetected for months. Thrown loudly
  // instead, naming exactly what's missing or ambiguous.
  const programsSnap = await db.collection('programs').where('slug', 'in', PROGRAM_SLUGS as unknown as string[]).get();
  const matchedIdsBySlug = new Map<BaseProgramSlug, string[]>(PROGRAM_SLUGS.map((slug) => [slug, [] as string[]]));
  programsSnap.docs.forEach((d) => {
    const slug = d.data().slug;
    if (slug === 'pull' || slug === 'push') matchedIdsBySlug.get(slug)!.push(d.id);
  });
  const programIdBySlug = new Map<BaseProgramSlug, string>();
  for (const slug of PROGRAM_SLUGS) {
    const matches = matchedIdsBySlug.get(slug)!;
    if (matches.length === 0) {
      throw new Error(`computeDemonstratedStrengthLevels: no program found with slug "${slug}". This is a configuration problem, not "no data" — refusing to return null for every soldier.`);
    }
    if (matches.length > 1) {
      throw new Error(`computeDemonstratedStrengthLevels: ${matches.length} programs found with slug "${slug}" (expected exactly 1, ambiguous) — refusing to guess which one is real.`);
    }
    programIdBySlug.set(slug, matches[0]);
  }

  // Read exercises ONCE, hold in memory — never per-workout.
  const exercisesSnap = await db.collection('exercises').get();
  const exerciseInfoById = new Map<string, ExerciseLevelInfo>();
  exercisesSnap.docs.forEach((d) => {
    const data = d.data();
    const targetPrograms = Array.isArray(data.targetPrograms) ? data.targetPrograms as { programId: unknown; level: unknown }[] : [];
    if (targetPrograms.length === 0) return;

    const levelBySlug: Partial<Record<BaseProgramSlug, number>> = {};
    for (const slug of PROGRAM_SLUGS) {
      const programId = programIdBySlug.get(slug);
      if (!programId) continue;
      const levels = targetPrograms
        .filter((t) => t.programId === programId && typeof t.level === 'number')
        .map((t) => t.level as number);
      // Rule 2: same program, two+ levels on this one exercise → the LOWER (most conservative — performance proves the lower requirement, not the higher).
      if (levels.length > 0) levelBySlug[slug] = Math.min(...levels);
    }
    if (Object.keys(levelBySlug).length === 0) return; // doesn't map to pull or push at all

    const type = data.type === 'time' || data.type === 'rest' ? data.type : 'reps';
    exerciseInfoById.set(d.id, { type, levelBySlug });
  });

  const cutoff = new Date(Date.now() - STRENGTH_LEVEL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const performancesByKey = new Map<string, Performance[]>(); // key = `${uid}__${slug}`

  for (const uidChunk of chunk(uids, 30)) {
    if (uidChunk.length === 0) continue;
    const snap = await db.collection('workouts')
      .where('userId', 'in', uidChunk)
      .where('date', '>=', cutoff)
      .get();

    snap.docs.forEach((doc) => {
      const data = doc.data();
      const uid = data.userId;
      if (typeof uid !== 'string') return;
      const segments = Array.isArray(data.segments) ? data.segments as { kind?: unknown; actual?: { exerciseLog?: unknown } }[] : [];

      for (const segment of segments) {
        if (segment.kind !== 'strength') continue;
        const log = Array.isArray(segment.actual?.exerciseLog) ? segment.actual!.exerciseLog as { exerciseId?: unknown; confirmedReps?: unknown }[] : [];

        for (const entry of log) {
          if (typeof entry.exerciseId !== 'string') continue;
          const info = exerciseInfoById.get(entry.exerciseId);
          if (!info || info.type === 'rest') continue; // not a strength performance at all

          const rawReps = Array.isArray(entry.confirmedReps) ? entry.confirmedReps as number[] : [];
          const repsCandidate = info.type === 'reps' && rawReps.length > 0 ? rawReps : null;

          for (const slug of PROGRAM_SLUGS) {
            const level = info.levelBySlug[slug];
            if (level === undefined) continue; // this exercise doesn't map to this program
            const key = `${uid}__${slug}`;
            const list = performancesByKey.get(key) ?? [];
            list.push({ level, reps: repsCandidate });
            performancesByKey.set(key, list);
          }
        }
      }
    });
  }

  for (const uid of uids) {
    for (const slug of PROGRAM_SLUGS) {
      const perfs = performancesByKey.get(`${uid}__${slug}`) ?? [];

      // David's correction, 05.10.2026 — the minimum-evidence gate is
      // PER LEVEL, not per program. One rep at level 11 followed by two
      // real sets at level 6 must read as level 6, not 11 — a single
      // high performance can't carry a level on its own just because
      // the PROGRAM overall has enough performances at some OTHER
      // level. Group by level first, then only consider levels that
      // individually clear the minimum, then take the highest of those.
      const perfsByLevel = new Map<number, Performance[]>();
      for (const p of perfs) {
        const group = perfsByLevel.get(p.level) ?? [];
        group.push(p);
        perfsByLevel.set(p.level, group);
      }
      const qualifyingLevels = Array.from(perfsByLevel.keys()).filter(
        (level) => perfsByLevel.get(level)!.length >= MIN_PERFORMANCES_FOR_LEVEL,
      );
      if (qualifyingLevels.length === 0) continue; // no single level has enough evidence of its own

      const level = Math.max(...qualifyingLevels);
      // Rule 4: reps only from sets of exercises AT the determined level — a different level's reps never counts, no matter how high.
      const repsAtLevel = perfsByLevel.get(level)!.filter((p) => p.reps !== null).flatMap((p) => p.reps as number[]);
      result[uid][slug] = {
        level,
        reps: repsAtLevel.length > 0 ? Math.max(...repsAtLevel) : null,
      };
    }
  }

  return result;
}
