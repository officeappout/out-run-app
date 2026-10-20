/**
 * League scope stats — pure helpers (no Firebase). Which league scopes and
 * periods a finished workout counts toward, and how many points it is worth.
 *
 * Why this exists (David, 17.10.2026): the neighborhood / city / group boards
 * used to SUM feed_posts on the client — so they only moved while the
 * community feed was on, and every board load scanned a whole period of posts.
 * The flag-independent `workouts` record now feeds small per-scope aggregates
 * instead (onWorkoutCreateLeagueStats), and the boards read those.
 *
 * The client mirrors periodKeysFor() in
 * src/features/arena/services/league-scope-keys.ts — keep the two identical
 * (both have tests pinning the same dates).
 */

export type LeagueGranularity = 'city' | 'neighborhood' | 'group';
export type LeagueWindow = 'weekly' | 'monthly';
export type LeagueActivity = 'strength' | 'cardio' | 'maintenance';

/** Same weighting as feed.service.ts CREDIT_MULTIPLIER (activityCredit). */
export const CREDIT_MULTIPLIER: Record<LeagueActivity, number> = {
  strength: 2,
  cardio: 1,
  maintenance: 1,
};

/** A workout doc's category → the league activity bucket. */
export function activityOf(category: unknown, workoutType?: unknown): LeagueActivity {
  const c = String(category ?? workoutType ?? '').toLowerCase();
  if (c === 'cardio' || c === 'running' || c === 'walking' || c === 'cycling') return 'cardio';
  if (c === 'recovery' || c === 'maintenance') return 'maintenance';
  return 'strength'; // strength, hybrid, legacy 'workout'
}

/** workouts.duration is SECONDS (WorkoutHistoryEntry). Whole minutes, ≥ 0. */
export function minutesOf(durationSeconds: unknown): number {
  const s = typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) ? durationSeconds : 0;
  return Math.max(0, Math.round(s / 60));
}

/** Points for a workout — minutes × the activity multiplier. */
export function creditOf(minutes: number, activity: LeagueActivity): number {
  return Math.max(0, Math.round(minutes)) * CREDIT_MULTIPLIER[activity];
}

export interface CreditPart {
  activity: LeagueActivity;
  credit: number;
}

const secOf = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * A workout's league points, PER PART (owner, 20.10.2026). A combined
 * ('hybrid') workout with segments counts its run / walk legs as cardio
 * (× 1) and its done stations as strength (× 2) — same rules as the app's
 * hybrid-counting.ts (a leg counts when it has an actual; a station when it
 * has an actual and wasn't skipped). Every other workout — and a hybrid doc
 * without segments — is one part, exactly as before (activityOf + creditOf).
 * Parts with 0 points are dropped.
 */
export function workoutCreditParts(data: {
  category?: unknown;
  workoutType?: unknown;
  activityType?: unknown;
  duration?: unknown;
  segments?: unknown;
}): CreditPart[] {
  const type = String(data.category ?? data.workoutType ?? data.activityType ?? '').toLowerCase();
  if (type === 'hybrid' && Array.isArray(data.segments) && data.segments.length > 0) {
    let aerobicSec = 0;
    let strengthSec = 0;
    for (const raw of data.segments) {
      const seg = (raw ?? {}) as { kind?: unknown; aerobicType?: unknown; skipped?: unknown; actual?: { durationSec?: unknown } | null };
      if (!seg.actual) continue;
      const sec = secOf(seg.actual.durationSec);
      if (seg.kind === 'aerobic') {
        if (seg.aerobicType === 'cycling') continue; // never part of a combined workout
        aerobicSec += sec;
      } else if (seg.kind === 'strength' && seg.skipped !== true) {
        strengthSec += sec;
      }
    }
    return [
      { activity: 'cardio' as const, credit: creditOf(minutesOf(aerobicSec), 'cardio') },
      { activity: 'strength' as const, credit: creditOf(minutesOf(strengthSec), 'strength') },
    ].filter((p) => p.credit > 0);
  }
  const activity = activityOf(data.category, data.workoutType ?? data.activityType);
  const credit = creditOf(minutesOf(data.duration), activity);
  return credit > 0 ? [{ activity, credit }] : [];
}

/** Calendar parts of a moment in Asia/Jerusalem. */
function jerusalemYmd(d: Date): { y: number; m: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return { y: Number(get('year')), m: Number(get('month')), day: Number(get('day')), weekday: weekdays.indexOf(get('weekday')) };
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Period keys for a moment: the Israeli week (starts Sunday) and the month,
 * both in Asia/Jerusalem. weekly = 'W2026-10-11' (that week's Sunday),
 * monthly = 'M2026-10'.
 */
export function periodKeysFor(d: Date): Record<LeagueWindow, string> {
  const { y, m, day, weekday } = jerusalemYmd(d);
  // Sunday of this week, computed on a UTC date so month/year roll correctly.
  const sunday = new Date(Date.UTC(y, m - 1, day - weekday));
  return {
    weekly: `W${sunday.getUTCFullYear()}-${pad(sunday.getUTCMonth() + 1)}-${pad(sunday.getUTCDate())}`,
    monthly: `M${y}-${pad(m)}`,
  };
}

export interface ScopeTarget {
  granularity: LeagueGranularity;
  scopeId: string;
  /** The city a neighborhood belongs to (lets the board query one city's neighborhoods). */
  parentId: string | null;
}

/** Scopes a user's workout counts toward, from their protected profile. */
export function scopeTargetsFor(core: { authorityId?: unknown; neighborhoodId?: unknown } | undefined, groupIds: unknown): ScopeTarget[] {
  const out: ScopeTarget[] = [];
  const city = typeof core?.authorityId === 'string' && core.authorityId ? core.authorityId : null;
  const hood = typeof core?.neighborhoodId === 'string' && core.neighborhoodId ? core.neighborhoodId : null;
  if (city) out.push({ granularity: 'city', scopeId: city, parentId: null });
  if (hood) out.push({ granularity: 'neighborhood', scopeId: hood, parentId: city });
  if (Array.isArray(groupIds)) {
    for (const g of Array.from(new Set(groupIds))) {
      if (typeof g === 'string' && g) out.push({ granularity: 'group', scopeId: g, parentId: null });
    }
  }
  return out;
}

/** league_scope_stats doc id — one per window × period × scope. */
export function statsDocId(window: LeagueWindow, periodKey: string, t: Pick<ScopeTarget, 'granularity' | 'scopeId'>): string {
  return `${window}_${periodKey}_${t.granularity}_${t.scopeId}`;
}

/**
 * Steps → league points (design lab rule, owner 17.10.2026): 3 points per
 * full 1,000 steps in a day. Counted under its own 'steps' bucket, so the
 * per-activity boards (strength / cardio) are unchanged and "overall" adds it.
 */
export const STEPS_PER_UNIT = 1000;
export const POINTS_PER_STEPS_UNIT = 3;
export function stepsCreditOf(steps: unknown): number {
  const n = typeof steps === 'number' && Number.isFinite(steps) ? steps : 0;
  return Math.max(0, Math.floor(n / STEPS_PER_UNIT)) * POINTS_PER_STEPS_UNIT;
}

// ── Distance (km) — shown next to the points, never part of them ────────────

/**
 * The steps → km estimate the app's steps screen uses when a day has no
 * synced distance (StepsAnalyticsView: ~1,300 steps per km). Keep the two
 * the same.
 */
export const STEPS_PER_KM_ESTIMATE = 1300;

/**
 * A dailyActivity day's distance in whole meters (owner 18.10.2026): the
 * synced distanceMeters (HealthKit / Health Connect) when > 0, otherwise the
 * steps estimate. dailyActivity already includes runs and walks, so workouts
 * never add distance on their own (no double counting). Never affects points.
 */
export function distanceMetersOfDay(steps: unknown, distanceMeters: unknown): number {
  const real = typeof distanceMeters === 'number' && Number.isFinite(distanceMeters) ? distanceMeters : 0;
  if (real > 0) return Math.round(real);
  const n = typeof steps === 'number' && Number.isFinite(steps) ? steps : 0;
  return n > 0 ? Math.round((n / STEPS_PER_KM_ESTIMATE) * 1000) : 0;
}

/**
 * What a rollup run adds for one user-day, given what was already applied
 * (league_steps_applied). Credit and distance are independent deltas, each
 * only ever added (never subtracted): a day whose estimate is later replaced
 * by a smaller synced distance just waits until it grows past the applied
 * value.
 */
export function stepsDayDelta(
  applied: { credit?: unknown; distanceMeters?: unknown } | undefined,
  credit: number,
  distanceMeters: number,
): { credit: number; distanceMeters: number } {
  const prevCredit = typeof applied?.credit === 'number' ? applied.credit : 0;
  const prevDist = typeof applied?.distanceMeters === 'number' ? applied.distanceMeters : 0;
  return { credit: Math.max(0, credit - prevCredit), distanceMeters: Math.max(0, distanceMeters - prevDist) };
}

/**
 * Does a dailyActivity day still have anything to add to the leagues, given
 * its league_steps_applied marker? The rollup's cheap pre-check (19.10.2026):
 * a day whose steps / km haven't grown since the last run needs no user read
 * and no transaction. Same arithmetic as the transaction itself
 * (stepsDayDelta), so skipping here never skips a real delta.
 */
export function stepsDayNeedsApply(
  applied: { credit?: unknown; distanceMeters?: unknown } | undefined,
  steps: unknown,
  distanceMeters: unknown,
): boolean {
  const d = stepsDayDelta(applied, stepsCreditOf(steps), distanceMetersOfDay(steps, distanceMeters));
  return d.credit > 0 || d.distanceMeters > 0;
}

/**
 * Is a league member doc an ACTIVE member (counted in activeMemberCount)?
 * Members always had credit > 0; a distance-only day (under 1,000 steps)
 * writes a member doc with credit 0 just to hold the km, and that must not
 * stop the person's first real points from counting them as active.
 */
export function isCountedMember(m: { credit?: unknown } | undefined): boolean {
  return typeof m?.credit === 'number' && m.credit > 0;
}
