/**
 * Calm return — the running half (pure).
 *
 * buildFreshWeekRunningProgram replaces the realign popup (7–20 days) and the rebuild
 * popup (21+ days, which sent the user back to onboarding): the program silently resumes
 * from the week the user had reached, starting TODAY, with no backlog — past weeks keep
 * their history, the resumed week and every later week are pending again.
 *
 * calmRunWorkout lightens one materialized run: quality runs (intervals, tempo, hills,
 * fartlek) become an easy run of the same core time, and the core volume shrinks by the
 * load's runVolumeReduction. Warm-up / cool-down blocks are kept as they are.
 */
import type { CalmLoad } from './policy';

/** The schedule-entry fields this module reads/writes (ActiveRunningProgram['schedule'][n]). */
export interface FreshWeekScheduleEntry {
  week: number;
  day: number;
  status?: 'pending' | 'completed' | 'skipped' | string;
  actualPerformance?: unknown;
  [key: string]: unknown;
}

export interface FreshWeekProgramInput<E extends FreshWeekScheduleEntry> {
  startDate: unknown;
  currentWeek?: number;
  schedule: E[];
}

export interface FreshWeekProgramResult<E> {
  /** ISO string at local midnight of `now` minus (resumeWeek − 1) weeks. */
  startDate: string;
  currentWeek: number;
  schedule: E[];
  resumeWeek: number;
}

/**
 * The week the user had reached: the first week, from the last week with a completed
 * session onward, that still has an unfinished session. Falls back to the last completed
 * week + 1, and to week 1 for a program never started. Never past the program's last week.
 */
export function resolveResumeWeek(schedule: FreshWeekScheduleEntry[]): number {
  if (schedule.length === 0) return 1;
  const maxWeek = Math.max(...schedule.map((e) => e.week));
  const completedWeeks = schedule.filter((e) => e.status === 'completed').map((e) => e.week);
  if (completedWeeks.length === 0) return 1;
  const lastCompletedWeek = Math.max(...completedWeeks);
  const weekHasOpen = (w: number) => schedule.some((e) => e.week === w && e.status !== 'completed');
  for (let w = lastCompletedWeek; w <= maxWeek; w++) {
    if (weekHasOpen(w)) return w;
  }
  return Math.min(maxWeek, lastCompletedWeek + 1);
}

export function buildFreshWeekRunningProgram<E extends FreshWeekScheduleEntry>(
  program: FreshWeekProgramInput<E>,
  now: Date,
): FreshWeekProgramResult<E> {
  const resumeWeek = resolveResumeWeek(program.schedule);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (resumeWeek - 1) * 7);
  const schedule = program.schedule.map((entry) => {
    if (entry.week < resumeWeek) return entry;
    const rest: FreshWeekScheduleEntry = { ...entry, status: 'pending' };
    delete rest.actualPerformance; // the resumed week is not done yet
    return rest as E;
  });
  return { startDate: start.toISOString(), currentWeek: resumeWeek, schedule, resumeWeek };
}

/** The run-block fields calmRunWorkout reads (RunBlock satisfies it). */
export interface CalmRunBlock {
  id: string;
  type: string;
  label: string;
  durationSeconds?: number;
  distanceMeters?: number;
  targetPacePercentage?: { min: number; max: number };
  zoneType?: string;
  isQualityExercise?: boolean;
  colorHex: string;
  blockMode?: 'pace' | 'effort';
  _isDynamicWrapper?: true;
  [key: string]: unknown;
}

export interface CalmRunWorkoutShape<B extends CalmRunBlock> {
  isQualityWorkout: boolean;
  blocks: B[];
  category?: string;
  [key: string]: unknown;
}

const EASY_RUN_COLOR_HEX = '#34D399'; // emerald-400 — an easy, steady block

function isWrapper(b: CalmRunBlock): boolean {
  return b._isDynamicWrapper === true || b.type === 'warmup' || b.type === 'cooldown';
}

function scaled(n: number | undefined, factor: number): number | undefined {
  return n == null ? undefined : Math.max(1, Math.round(n * factor));
}

/**
 * Returns the workout unchanged (same object) when the load asks for nothing.
 * `easyPace` is the user's easy-zone pace window (computeZones(...).easy), when known.
 */
export function calmRunWorkout<B extends CalmRunBlock, W extends CalmRunWorkoutShape<B>>(
  workout: W,
  load: Pick<CalmLoad, 'runEasyOnly' | 'runVolumeReduction'>,
  opts: { easyPace?: { min: number; max: number } | null; easyLabel?: string } = {},
): W {
  const factor = 1 - Math.min(0.9, Math.max(0, load.runVolumeReduction));
  const toEasy = load.runEasyOnly && workout.isQualityWorkout;
  if (!toEasy && factor === 1) return workout;

  const head: B[] = [];
  const tail: B[] = [];
  const core: B[] = [];
  let seenCore = false;
  for (const b of workout.blocks) {
    if (isWrapper(b)) (seenCore ? tail : head).push(b);
    else {
      seenCore = true;
      core.push(b);
    }
  }

  if (!toEasy) {
    const lighter = core.map((b) => ({
      ...b,
      durationSeconds: scaled(b.durationSeconds, factor),
      distanceMeters: scaled(b.distanceMeters, factor),
    }));
    return { ...workout, blocks: [...head, ...lighter, ...tail] };
  }

  // Quality → one easy block: same core time (or distance when the core is distance-only).
  const coreSeconds = core.reduce((s, b) => s + (b.durationSeconds ?? 0), 0);
  const coreMeters = core.reduce((s, b) => s + (b.durationSeconds == null ? b.distanceMeters ?? 0 : 0), 0);
  const easy: CalmRunBlock = {
    id: `calm-easy-${core[0]?.id ?? 'run'}`,
    type: 'run',
    label: opts.easyLabel ?? 'ריצה קלה',
    colorHex: EASY_RUN_COLOR_HEX,
    isQualityExercise: false,
    blockMode: 'pace',
    zoneType: 'easy',
  };
  if (coreSeconds > 0) easy.durationSeconds = Math.max(60, Math.round(coreSeconds * factor));
  else if (coreMeters > 0) easy.distanceMeters = Math.max(200, Math.round(coreMeters * factor));
  if (opts.easyPace) easy.targetPacePercentage = { ...opts.easyPace };

  return {
    ...workout,
    isQualityWorkout: false,
    category: 'easy_run',
    blocks: [...head, easy as B, ...tail],
  };
}
