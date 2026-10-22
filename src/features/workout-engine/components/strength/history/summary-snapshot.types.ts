/**
 * Saved strength-summary snapshot (history parity, 22.10.2026).
 *
 * Written on every strength workout doc as the optional `summarySnapshot`
 * map (additive — older docs have none and keep the reduced history view).
 * Holds only what the post-workout summary showed and can't be recomputed
 * later: a compact plan (no full plan copy), the "vs last time" values, the
 * level ring and the streak card of that moment. Read back only while
 * enable_history_summary_parity is on. Keys are present only when known
 * (Firestore rejects undefined); `null` is a real value (unknown count).
 */

export type SavedPhase = 'warmup' | 'main' | 'cooldown';

export interface SavedPlanExercise {
  id: string;
  name: string;
  unit: 'reps' | 'seconds';
  /** Planned set count; null = open-ended (AMRAP). */
  sets: number | null;
  /** Per-set planned target, as the summary resolved it (null = unknown). */
  targets?: (number | null)[];
  image?: string;
  swapped?: true;
}

export interface SavedPlanSegment {
  id: string;
  title?: string;
  protocol?: string;
  phase: SavedPhase;
  exercises: SavedPlanExercise[];
}

export interface SavedLevelSnapshot {
  programId?: string;
  before: { level: number; percent: number };
  /** What the level ring showed (after this workout). */
  after: { level: number; percent: number };
  maxLevel: number;
  /** This workout's total gain (%), 0 when progression didn't run. */
  gain: number;
  leveledUp: boolean;
  /** No questionnaire → no level was written; the ring stays hidden. */
  skipped?: true;
}

export interface SavedStreakSnapshot {
  streak: number;
  best: number;
  /** Sunday-first, 7 entries: 'done' | 'rest' | 'future'. */
  days: string[];
  week?: { sessions: number; plannedSessions: number | null; minutes: number; cardio?: true };
}

export interface StrengthSummarySnapshot {
  v: 1;
  plan?: SavedPlanSegment[];
  /** exerciseId → that exercise's previous-session sets (for "improved vs last time"). */
  previousSets?: Record<string, number[]>;
  level?: SavedLevelSnapshot;
  streak?: SavedStreakSnapshot;
}
