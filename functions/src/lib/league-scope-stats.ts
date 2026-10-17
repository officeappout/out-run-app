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
