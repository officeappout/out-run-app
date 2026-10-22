/**
 * Race-date adaptation for a return to running (enable_week_builder_v1, owner 22.10) — the
 * RULES, pure. "יש לך מירוץ / יעד בתאריך?" in the "חוזרים לרוץ" drawer: with a date, the plan
 * that's left is measured against the weeks to the race.
 *
 *   fits           — the remaining plan ends before the race: keep the recommendation.
 *   compress       — enough weeks to compress safely: weekly volume grows ≤ 10% a week, one
 *                    long run a week, never two hard days in a row, the last week tapers.
 *   finish_safely  — very little time (≤ 3 weeks for beginners, ≤ 2 otherwise), or a compression
 *                    deeper than the safe share: easy runs + short run/walk, taper the last week,
 *                    an honest line that the goal time may change, and a shorter goal offered.
 *
 * The stored field (OPTIONAL, additive, written only under the flag — no race date existed):
 *   running.raceGoal?: { date: 'YYYY-MM-DD'; v: 1 }
 *
 * TODO(race-plan): there is no race-plan generator yet. compressedVolumeRamp gives the weekly
 * volumes; turning them into a stored schedule (week entries with slots) is the follow-up —
 * until then the drawer stores the date and applies the safe recommendation.
 */

export const RACE_ADAPT = {
  /** Weekly volume may grow by at most this share week over week. */
  maxWeeklyIncrease: 0.1,
  /** The last week before the race: volume × this. */
  taperShare: 0.7,
  /** Weeks-to-race at or under which only "finish safely" is offered, by level. */
  finishSafelyMaxWeeks: { beginner: 3, intermediate: 2, advanced: 2 } as Record<string, number>,
  /** A compression below this share of the weeks the plan needs is not safe → finish safely. */
  minCompressShare: 0.6,
  longRunsPerWeek: 1,
} as const;

export type RaceAdaptKind = 'fits' | 'compress' | 'finish_safely';

export interface RaceAdaptation {
  kind: RaceAdaptKind;
  weeksToRace: number;
  weeksNeeded: number;
  offerShorterGoal: boolean;
  noteHe: string;
}

const DAY_MS = 86_400_000;
const keyMs = (k: string) => Date.parse(`${k}T00:00:00Z`);

export function weeksBetweenKeys(fromKey: string, toKey: string): number {
  return Math.max(0, Math.floor((keyMs(toKey) - keyMs(fromKey)) / DAY_MS / 7));
}

export function adaptToRace(i: {
  todayKey: string;
  raceDate: string;
  /** Weeks of the plan from the recommended start week to its end. */
  weeksNeeded: number;
  level: string | null | undefined;
}): RaceAdaptation {
  const weeksToRace = weeksBetweenKeys(i.todayKey, i.raceDate);
  const cap = RACE_ADAPT.finishSafelyMaxWeeks[i.level ?? 'intermediate'] ?? RACE_ADAPT.finishSafelyMaxWeeks.intermediate;
  const base = { weeksToRace, weeksNeeded: i.weeksNeeded };
  if (weeksToRace >= i.weeksNeeded) {
    return { ...base, kind: 'fits', offerShorterGoal: false, noteHe: 'התוכנית מסתיימת לפני המירוץ' };
  }
  if (weeksToRace <= cap || weeksToRace < i.weeksNeeded * RACE_ADAPT.minCompressShare) {
    return {
      ...base,
      kind: 'finish_safely',
      offerShorterGoal: true,
      noteHe: 'נבנה לך שבועות קלים כדי לסיים בריא. ייתכן שכדאי לעדכן את זמן היעד',
    };
  }
  return { ...base, kind: 'compress', offerShorterGoal: false, noteHe: 'נדחוס את התוכנית בזהירות כדי שתגיע מוכן' };
}

/**
 * Weekly volumes (minutes) from `start` toward `target` over `weeks` weeks: each week ≤ +10% over
 * the one before, never above target, the last week tapered. weeks ≤ 0 → [].
 */
export function compressedVolumeRamp(start: number, target: number, weeks: number): number[] {
  if (weeks <= 0) return [];
  const out: number[] = [];
  let v = Math.max(1, start);
  for (let w = 0; w < weeks; w++) {
    if (w > 0) v = Math.min(target, v * (1 + RACE_ADAPT.maxWeeklyIncrease));
    out.push(Math.round(v));
  }
  if (weeks > 1) out[weeks - 1] = Math.round(out[weeks - 2] * RACE_ADAPT.taperShare);
  return out;
}

export interface RaceGoal {
  date: string;
  v: 1;
}

export function normalizeRaceGoal(raw: unknown): RaceGoal | null {
  const d = (raw as RaceGoal | null)?.date;
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? { date: d, v: 1 } : null;
}
