/**
 * Optional detail fields on a home-v2 feed post (design lab "strength post" /
 * "run post", approved 18.10.2026). Everything here is something the workout
 * summary already knew when the workout finished — never an invented value.
 * A post without them renders exactly like before; each card section hides
 * itself when its field is missing.
 *
 * Pure — no Firebase, unit-tested.
 */

export type FeedSetUnit = 'reps' | 'seconds';

export interface FeedTopExercise {
  name: string;
  /** Planned sets (or the sets done when the plan didn't say). */
  sets: number;
  /** Sets actually done (≤ sets). Drives the per-set dots. */
  setsDone: number;
  /** Typical per-set target (or the best set when there was no target). */
  value?: number;
  unit: FeedSetUnit;
}

export interface FeedPostDetails {
  /** The program the level belongs to (Hebrew display name). */
  programName?: string;
  /** 1-based level and the program's level count — both or neither. */
  levelIndex?: number;
  levelCount?: number;
  /** Up to MAX_TOP_EXERCISES main-phase exercises. */
  topExercises?: FeedTopExercise[];
  /** Further main exercises not listed ("ועוד N תרגילים"). */
  moreExercises?: number;
  /** One line the summary computed ("improved vs last time"). */
  personalBest?: string;
  /** Per-lap pace, seconds per km, in order (max MAX_PACE_SPLITS). */
  paceSplits?: number[];
  /** The author's streak (days) after this workout; only when ≥ 2. */
  streakDays?: number;
  /** One photo (Firebase Storage download URL + its storage path). */
  photoUrl?: string;
  photoPath?: string;
  /**
   * Only ever 'cycling' (a ride, enable_home_v2): the card shows the ride's
   * average speed (km/h) instead of a runner's pace. Absent = run / walk.
   */
  activityType?: 'cycling';
}

export const MAX_TOP_EXERCISES = 3;
export const MAX_PACE_SPLITS = 10;
const MAX_NAME = 40;
const MAX_TEXT = 80;

export const FEED_DETAIL_KEYS: (keyof FeedPostDetails)[] = [
  'programName',
  'levelIndex',
  'levelCount',
  'topExercises',
  'moreExercises',
  'personalBest',
  'paceSplits',
  'streakDays',
  'photoUrl',
  'photoPath',
  'activityType',
];

// ── Builders (at workout finish) ────────────────────────────────────────────

/** Structural subset of phase-summary's ExerciseSummary. */
export interface SummaryExerciseLike {
  name: string;
  unit: 'reps' | 'seconds' | 'unknown';
  plannedSets: number | null;
  doneSets: number;
  sets: { done: number | null; target: number | null }[];
  status: 'done' | 'partial' | 'skipped';
  improvedBy: number | null;
}

export interface SummaryPhaseLike {
  phase: 'warmup' | 'main' | 'cooldown';
  blocks: { exercises: SummaryExerciseLike[] }[];
}

const posInt = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** The most common positive value (ties → the larger one). */
function typical(values: (number | null)[]): number | undefined {
  const counts = new Map<number, number>();
  for (const v of values) if (posInt(v)) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: number | undefined;
  let bestCount = 0;
  counts.forEach((c, v) => {
    if (c > bestCount || (c === bestCount && best !== undefined && v > best)) {
      best = v;
      bestCount = c;
    }
  });
  return best;
}

export function topExerciseFrom(ex: SummaryExerciseLike): FeedTopExercise {
  const setsDone = Math.max(0, Math.round(ex.doneSets));
  const sets = Math.max(setsDone, posInt(ex.plannedSets) ? Math.round(ex.plannedSets) : 0);
  const target = typical(ex.sets.map((s) => s.target));
  const done = ex.sets.map((s) => s.done).filter(posInt);
  const value = target ?? (done.length ? Math.max(...done) : undefined);
  return {
    name: ex.name.slice(0, MAX_NAME),
    sets,
    setsDone,
    ...(value !== undefined ? { value: Math.round(value) } : {}),
    unit: ex.unit === 'seconds' ? 'seconds' : 'reps',
  };
}

export function unitShort(unit: FeedSetUnit, n: number): string {
  if (unit === 'seconds') return 'שנ׳';
  return n === 1 ? 'חזרה' : 'חזרות';
}

/**
 * "Improved vs last time" — the summary's own improvedBy (best set this
 * session minus the previous session's best set). The biggest one wins.
 */
export function personalBestFrom(exercises: SummaryExerciseLike[]): string | undefined {
  let best: SummaryExerciseLike | null = null;
  for (const e of exercises) {
    if (posInt(e.improvedBy) && (!best || e.improvedBy > (best.improvedBy ?? 0))) best = e;
  }
  if (!best || !best.improvedBy) return undefined;
  const unit: FeedSetUnit = best.unit === 'seconds' ? 'seconds' : 'reps';
  const top = Math.max(...best.sets.map((s) => s.done ?? 0));
  const what = top > 0 ? `${top} ${unitShort(unit, top)} ${best.name}` : best.name;
  return `${what} (+${best.improvedBy} מהפעם הקודמת)`.slice(0, MAX_TEXT);
}

export function buildStrengthPostDetails(input: {
  phases: SummaryPhaseLike[] | null | undefined;
  programName?: string | null;
  levelIndex?: number | null;
  levelCount?: number | null;
  streakDays?: number | null;
}): FeedPostDetails {
  const out: FeedPostDetails = {};
  const name = input.programName?.trim();
  if (name) out.programName = name.slice(0, MAX_NAME);
  if (posInt(input.levelIndex) && posInt(input.levelCount) && input.levelIndex <= input.levelCount) {
    out.levelIndex = Math.round(input.levelIndex);
    out.levelCount = Math.round(input.levelCount);
  }
  const main = (input.phases ?? [])
    .filter((p) => p.phase === 'main')
    .flatMap((p) => p.blocks.flatMap((b) => b.exercises))
    .filter((e) => e.status !== 'skipped' && e.doneSets > 0);
  if (main.length) {
    out.topExercises = main.slice(0, MAX_TOP_EXERCISES).map(topExerciseFrom);
    if (main.length > MAX_TOP_EXERCISES) out.moreExercises = main.length - MAX_TOP_EXERCISES;
    const pb = personalBestFrom(main);
    if (pb) out.personalBest = pb;
  }
  if (posInt(input.streakDays) && input.streakDays >= 2) out.streakDays = Math.round(input.streakDays);
  return out;
}

/**
 * Per-lap pace (sec/km) from the run's completed laps. Laps shorter than
 * 200 m (a stray tap) are skipped; fewer than 2 usable laps → none.
 */
export function buildPaceSplits(
  laps: { distanceMeters: number; durationSeconds: number; isActive?: boolean }[] | null | undefined,
): number[] | undefined {
  const out: number[] = [];
  for (const l of laps ?? []) {
    if (l.isActive) continue;
    if (!(l.distanceMeters >= 200) || !(l.durationSeconds > 0)) continue;
    const secPerKm = Math.round(l.durationSeconds / (l.distanceMeters / 1000));
    if (secPerKm >= 120 && secPerKm <= 1800) out.push(secPerKm);
    if (out.length >= MAX_PACE_SPLITS) break;
  }
  return out.length >= 2 ? out : undefined;
}

export function streakFor(days: number | null | undefined): number | undefined {
  return posInt(days) && days >= 2 ? Math.round(days) : undefined;
}

// ── Reading (server → client) ───────────────────────────────────────────────

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

/** Whatever is on the doc → only well-formed detail fields (the API route). */
export function sanitizePostDetails(data: Record<string, unknown>): FeedPostDetails {
  const out: FeedPostDetails = {};
  const programName = str(data.programName, MAX_NAME);
  if (programName) out.programName = programName;
  if (posInt(data.levelIndex) && posInt(data.levelCount) && data.levelIndex <= data.levelCount) {
    out.levelIndex = data.levelIndex;
    out.levelCount = data.levelCount;
  }
  if (Array.isArray(data.topExercises)) {
    const list: FeedTopExercise[] = [];
    for (const raw of data.topExercises.slice(0, MAX_TOP_EXERCISES)) {
      const r = (raw ?? {}) as Record<string, unknown>;
      const name = str(r.name, MAX_NAME);
      if (!name || !posInt(r.sets)) continue;
      const setsDone = typeof r.setsDone === 'number' && r.setsDone >= 0 ? Math.min(r.setsDone, r.sets) : r.sets;
      list.push({
        name,
        sets: r.sets,
        setsDone,
        ...(posInt(r.value) ? { value: r.value } : {}),
        unit: r.unit === 'seconds' ? 'seconds' : 'reps',
      });
    }
    if (list.length) out.topExercises = list;
  }
  if (posInt(data.moreExercises)) out.moreExercises = data.moreExercises;
  const pb = str(data.personalBest, MAX_TEXT);
  if (pb) out.personalBest = pb;
  if (Array.isArray(data.paceSplits)) {
    const splits = data.paceSplits.filter(posInt).slice(0, MAX_PACE_SPLITS);
    if (splits.length >= 2) out.paceSplits = splits;
  }
  if (posInt(data.streakDays)) out.streakDays = data.streakDays;
  const photoUrl = str(data.photoUrl, 2048);
  if (photoUrl && /^https:\/\//.test(photoUrl)) out.photoUrl = photoUrl;
  const photoPath = str(data.photoPath, 300);
  if (photoPath) out.photoPath = photoPath;
  if (data.activityType === 'cycling') out.activityType = 'cycling';
  return out;
}

/** Drop every detail field (the author isn't on home v2). */
export function withoutPostDetails<P extends object>(params: P): P {
  const out = { ...params } as Record<string, unknown>;
  for (const k of FEED_DETAIL_KEYS) delete out[k];
  return out as P;
}

/** The detail fields present on params, ready for addDoc (no undefined). */
export function postDetailsForWrite(params: FeedPostDetails): FeedPostDetails {
  const out: Record<string, unknown> = {};
  for (const k of FEED_DETAIL_KEYS) {
    const v = params[k];
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out as FeedPostDetails;
}

// ── Display helpers ─────────────────────────────────────────────────────────

export function formatSecPerKm(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec - m * 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Bar heights (0.35–1) for pace splits — faster lap = taller bar. */
export function paceBarHeights(splits: number[]): number[] {
  if (!splits.length) return [];
  const min = Math.min(...splits);
  const max = Math.max(...splits);
  if (max === min) return splits.map(() => 0.75);
  return splits.map((s) => 0.35 + 0.65 * ((max - s) / (max - min)));
}

export function exerciseLine(ex: FeedTopExercise): string {
  if (ex.value === undefined) return `${ex.sets} סטים`;
  return ex.unit === 'seconds' ? `${ex.sets} × ${ex.value} שנ׳` : `${ex.sets} × ${ex.value}`;
}
