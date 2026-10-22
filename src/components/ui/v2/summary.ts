/**
 * Post-workout summary (home v2) — pure display logic, zero React.
 * Shared by the strength, aerobic and hybrid summaries' v2 sections
 * (ProgramProgressRing, StreakDotsStrip, ExerciseSetsTable, ImprovementCard).
 */

// ── Per-set result tiles ─────────────────────────────────────────────────────

/** in = target met, below = done under target, missed = planned but not done. */
export type SetTone = 'in' | 'below' | 'missed';

export interface SetTile {
  /** What the tile prints ("8", "0:45", "–"). */
  value: string;
  tone: SetTone;
}

/** Tones present in a list of tiles, in legend order. */
export function tonesPresent(tiles: SetTile[]): SetTone[] {
  const order: SetTone[] = ['in', 'below', 'missed'];
  const seen = new Set(tiles.map((t) => t.tone));
  return order.filter((t) => seen.has(t));
}

/** Tile tone from a performed value vs its target (no target ⇒ "in"). */
export function toneFor(done: number | null | undefined, target: number | null | undefined): SetTone {
  if (done === null || done === undefined || done <= 0) return 'missed';
  if (target === null || target === undefined || target <= 0) return 'in';
  return done >= target ? 'in' : 'below';
}

// ── Program progress ring ────────────────────────────────────────────────────

export interface ProgramRingModel {
  /** % inside the level now (0–100, rounded). */
  percent: number;
  /** Arc that was already there before this workout (0–100). */
  basePercent: number;
  /** Arc added by this workout (0–100), drawn green after the base. */
  gainPercent: number;
}

/**
 * Splits "% inside the level" into before/after for the ring. A level-up
 * restarts the ring, so everything inside the new level came from today.
 */
export function programRingModel(newPercent: number, totalGain: number, leveledUp: boolean): ProgramRingModel {
  const now = Math.max(0, Math.min(100, Number.isFinite(newPercent) ? newPercent : 0));
  const g = Math.max(0, Number.isFinite(totalGain) ? totalGain : 0);
  const gainPercent = leveledUp ? now : Math.min(g, now);
  return { percent: Math.round(now), basePercent: now - gainPercent, gainPercent };
}

/** "+3.2%" (one decimal), or null when there is no gain to show. */
export function formatGain(gain: number): string | null {
  if (!Number.isFinite(gain) || gain <= 0) return null;
  return `+${(Math.round(gain * 10) / 10).toFixed(1)}%`;
}

// ── 7-day streak strip ───────────────────────────────────────────────────────

export type WeekDotState = 'done' | 'rest' | 'future';

export interface WeekDot {
  /** Local YYYY-MM-DD. */
  date: string;
  /** "א׳" … "ש׳". */
  label: string;
  state: WeekDotState;
  isToday: boolean;
  /** True when this day and the next one (in week order) are both training days. */
  chainToNext: boolean;
}

/** Minimal shape of the activity store's weekActivities entries. */
export interface WeekActivityLike {
  categories?: Partial<Record<string, { minutes?: number; sessions?: number } | undefined>>;
}

const DAY_LABELS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
/** Same "active day" bar useWeeklyProgress uses (10 minutes), or any logged session. */
const ACTIVE_DAY_MINUTES = 10;

export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isTrainingDay(day: WeekActivityLike | undefined): boolean {
  if (!day?.categories) return false;
  let minutes = 0;
  let sessions = 0;
  for (const c of Object.values(day.categories)) {
    minutes += c?.minutes ?? 0;
    sessions += c?.sessions ?? 0;
  }
  return sessions > 0 || minutes >= ACTIVE_DAY_MINUTES;
}

/**
 * This week (Sunday first), one dot per day. `todayDone` marks today as a
 * training day even before the session's activity write lands (the live
 * summary is shown right after a finished workout).
 */
export function buildWeekDots(
  activities: Record<string, WeekActivityLike | undefined>,
  today: Date,
  { todayDone = false }: { todayDone?: boolean } = {},
): WeekDot[] {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
  const todayKey = localDateKey(today);
  const dots: WeekDot[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = localDateKey(d);
    const isToday = key === todayKey;
    const future = i > today.getDay();
    const done = !future && (isTrainingDay(activities[key]) || (isToday && todayDone));
    dots.push({ date: key, label: DAY_LABELS[i], state: future ? 'future' : done ? 'done' : 'rest', isToday, chainToNext: false });
  }
  for (let i = 0; i < 6; i++) {
    dots[i].chainToNext = dots[i].state === 'done' && dots[i + 1].state === 'done';
  }
  return dots;
}

/**
 * Rebuilds the week dots of a past day from their saved states (history
 * view of a saved workout: the strip exactly as that summary showed it).
 * `day` is that workout's date; missing/unknown states read as 'rest'.
 */
export function weekDotsFromStates(states: readonly string[], day: Date): WeekDot[] {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate() - day.getDay());
  const dots: WeekDot[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const raw = states[i];
    const state: WeekDotState = raw === 'done' || raw === 'future' ? raw : 'rest';
    dots.push({ date: localDateKey(d), label: DAY_LABELS[i], state, isToday: i === day.getDay(), chainToNext: false });
  }
  for (let i = 0; i < 6; i++) {
    dots[i].chainToNext = dots[i].state === 'done' && dots[i + 1].state === 'done';
  }
  return dots;
}

// ── Improvement headline ─────────────────────────────────────────────────────

export type ImprovementUnit = 'reps' | 'seconds' | 'unknown';

/**
 * The big number on "שיפור מהפעם הקודמת": the summed delta when every item
 * shares one unit, otherwise the number of improved items.
 */
export function improvementHeadline(items: { delta: number; unit: ImprovementUnit }[]): { value: string; unit: string } | null {
  if (items.length === 0) return null;
  const unit = items[0].unit;
  if (unit !== 'unknown' && items.every((i) => i.unit === unit)) {
    const sum = items.reduce((a, i) => a + i.delta, 0);
    return { value: `+${sum}`, unit: unit === 'seconds' ? 'שנ׳' : sum === 1 ? 'חזרה' : 'חזרות' };
  }
  return { value: String(items.length), unit: items.length === 1 ? 'תרגיל' : 'תרגילים' };
}

/** "+1 חזרה" / "+3 חזרות" / "+5 שנ׳" / "+2". */
export function deltaLabel(delta: number, unit: ImprovementUnit): string {
  if (unit === 'seconds') return `+${delta} שנ׳`;
  if (unit === 'reps') return `+${delta} ${delta === 1 ? 'חזרה' : 'חזרות'}`;
  return `+${delta}`;
}
