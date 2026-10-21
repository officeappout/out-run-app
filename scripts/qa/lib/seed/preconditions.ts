/**
 * Mission preconditions — the state a tester account starts a mission in (pure data).
 *
 * The first real run (21.10.2026) showed that a fresh account lands on /gateway → onboarding,
 * so a mission about the home screen / players / progress never reached them. Each mission now
 * declares `precondition`; scripts/qa/register-testers.ts resets every tester account and seeds
 * it into that state with the SAME builders as the demo world (scripts/demo): the engine-v2 /
 * walking-plan week, the history, the users doc.
 *
 *   fresh                   — no Firestore docs at all. Reset on every run. NOTE: a signed-in
 *                             account without a users doc lands on the legacy /gateway — no real
 *                             new user starts there any more; prefer map_only.
 *   map_only                — what the landing's quick signup writes for a real new user
 *                             (runExploreMapFlow → buildExploreMapProfileWrite: MAP_ONLY scaffold,
 *                             no name, no program). "/" → /explorer → map → home → onboarding,
 *                             exactly the real first-launch path (agent-briefs/first-launch-journey.md).
 *   strength_plan           — onboarded, strength program (full body ×3), today is a strength day.
 *   strength_after_workout  — the same, and today's workout is already done (summary / progress).
 *   run_plan                — onboarded runner (10k, improve time, 4 runs a week) with a generated
 *                             running program; today is a run day.
 *   walk_plan               — onboarded walker (walking plan); today is a walk day.
 *   all_tracks              — strength + running (hybrid week) + a walking goal; a session today.
 */
export const PRECONDITIONS = ['fresh', 'map_only', 'strength_plan', 'strength_after_workout', 'run_plan', 'walk_plan', 'all_tracks'] as const;
export type Precondition = (typeof PRECONDITIONS)[number];

export function isPrecondition(v: unknown): v is Precondition {
  return typeof v === 'string' && (PRECONDITIONS as readonly string[]).includes(v);
}

/** How a seeded precondition is built from the demo world's pieces. */
export interface SeedSpec {
  /** schedule-combos scenario (engine v2) or 'WR' (walking plan). */
  scenario: string;
  journey: 'J1' | 'J2' | 'J3' | 'WR';
  /** The session kind that must fall on today (the week is rotated so it does). */
  todayKind: 'strength' | 'run' | 'walk';
  /** Today's sessions are already done. */
  completeToday: boolean;
  /** Days of history before today. */
  historyDays: number;
  /** Generate the running program (running.activeProgram) like the onboarding does. */
  runPlan: boolean;
  /** Also store a walking goal (lifestyle.walkingGoal) on a non-walking week. */
  walkingGoal: boolean;
}

/** Preconditions without an onboarded profile (no SeedSpec). */
export type UnonboardedPrecondition = 'fresh' | 'map_only';
export type OnboardedPrecondition = Exclude<Precondition, UnonboardedPrecondition>;

export function isOnboardedPrecondition(p: Precondition): p is OnboardedPrecondition {
  return p !== 'fresh' && p !== 'map_only';
}

export const SEED_SPECS: Record<OnboardedPrecondition, SeedSpec> = {
  strength_plan: { scenario: 'S03', journey: 'J1', todayKind: 'strength', completeToday: false, historyDays: 14, runPlan: false, walkingGoal: false },
  strength_after_workout: { scenario: 'S03', journey: 'J1', todayKind: 'strength', completeToday: true, historyDays: 28, runPlan: false, walkingGoal: false },
  run_plan: { scenario: 'S04', journey: 'J2', todayKind: 'run', completeToday: false, historyDays: 14, runPlan: true, walkingGoal: false },
  walk_plan: { scenario: 'WR', journey: 'WR', todayKind: 'walk', completeToday: false, historyDays: 14, runPlan: false, walkingGoal: false },
  all_tracks: { scenario: 'S13', journey: 'J3', todayKind: 'strength', completeToday: false, historyDays: 21, runPlan: true, walkingGoal: true },
};

/** The default for a mission file without `precondition` (keeps today's behaviour). */
export const DEFAULT_PRECONDITION: Precondition = 'fresh';

/**
 * One account = one state. Two missions that share a tester uid must ask for the same
 * precondition (else the second would start from the wrong state). Returns the conflicts.
 */
export function preconditionConflicts(rows: ReadonlyArray<{ mission: string; uid: string; precondition: Precondition }>): string[] {
  const byUid = new Map<string, { mission: string; precondition: Precondition }>();
  const out: string[] = [];
  for (const r of rows) {
    const seen = byUid.get(r.uid);
    if (!seen) byUid.set(r.uid, r);
    else if (seen.precondition !== r.precondition) out.push(`${r.uid}: ${seen.mission}=${seen.precondition} but ${r.mission}=${r.precondition}`);
  }
  return out;
}
