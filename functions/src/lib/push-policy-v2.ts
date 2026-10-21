/**
 * Push policy v2 (owner decisions 21.10.2026). Pure — no Firestore.
 *
 * Gate: app_config/feature_flags.pushPolicyV2 (DEFAULT OFF; only an explicit
 * true turns it on). Flag off → push.service behaves exactly as before.
 *
 * With the flag on, for every send that counts toward the daily engagement
 * cap (ENGAGEMENT_CHANNELS or countTowardDailyCap, not a personal interaction):
 *   - proactive daily cap: 2 by default (settings.notificationFrequency
 *     min 1 · balanced 2 · high 3);
 *   - weekly cap: 8 proactive pushes in any rolling 7 days;
 *   - spacing: at least 3 hours between two proactive pushes;
 *   - first week after signup: at most 1 push a day of ANY kind (proactive or
 *     a requested reminder), except a streak rescue;
 *   - quiet hours: proactive 21:30–08:00; a reminder the user asked for
 *     (policyKind 'requested') may go out from 06:00 (its evening end stays
 *     at 22:00, as today).
 *
 * The log lives on push_rate/{uid}.policyLog: [{ t: epochMs, k: kind }],
 * trimmed to the last 8 days (≤ ~20 entries).
 */

export type PushPolicyKind = 'proactive' | 'requested' | 'streak_rescue';

export interface PolicyLogEntry {
  t: number;
  k: PushPolicyKind;
}

export const POLICY_WEEKLY_CAP = 8;
export const POLICY_SPACING_HOURS = 3;
export const POLICY_FIRST_WEEK_DAYS = 7;
export const POLICY_LOG_KEEP_DAYS = 8;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const TZ = 'Asia/Jerusalem';

const V2_DAILY_CAPS: Record<string, number> = { min: 1, balanced: 2, high: 3 };

/** settings.notificationFrequency → the v2 proactive daily cap (default 2). */
export function policyDailyCap(settings: Record<string, unknown> | undefined): number {
  const f = settings?.notificationFrequency;
  return typeof f === 'string' && f in V2_DAILY_CAPS ? V2_DAILY_CAPS[f] : V2_DAILY_CAPS.balanced;
}

/** 'YYYY-MM-DD' in Israel. */
export function israelDay(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ });
}

/** Minutes since midnight in Israel. */
export function israelMinuteOfDay(ms: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms));
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

/**
 * v2 quiet window. proactive / streak_rescue: 21:30–08:00. requested: 22:00–06:00.
 */
export function isPolicyQuietTime(ms: number, kind: PushPolicyKind): boolean {
  const min = israelMinuteOfDay(ms);
  if (kind === 'requested') return min >= 22 * 60 || min < 6 * 60;
  return min >= 21 * 60 + 30 || min < 8 * 60;
}

export function policyLogFrom(rateData: Record<string, unknown> | undefined): PolicyLogEntry[] {
  const raw = rateData?.policyLog;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is PolicyLogEntry =>
      !!e &&
      typeof (e as PolicyLogEntry).t === 'number' &&
      ((e as PolicyLogEntry).k === 'proactive' || (e as PolicyLogEntry).k === 'requested' || (e as PolicyLogEntry).k === 'streak_rescue'),
  );
}

export type PolicyBlock = 'first_week_daily' | 'daily_cap' | 'weekly_cap' | 'spacing' | null;

export interface PolicyCheckInput {
  log: PolicyLogEntry[];
  kind: PushPolicyKind;
  nowMs: number;
  dailyCap: number;
  /** users/{uid}.createdAt in ms (null = unknown → not treated as first week). */
  signupMs: number | null;
}

/** Whether the user is inside the first 7 days after signup. */
export function inFirstWeek(signupMs: number | null, nowMs: number): boolean {
  return signupMs !== null && Number.isFinite(signupMs) && nowMs - signupMs >= 0 && nowMs - signupMs < POLICY_FIRST_WEEK_DAYS * DAY_MS;
}

/** The reason this send is held back, or null to send. */
export function policyBlockReason({ log, kind, nowMs, dailyCap, signupMs }: PolicyCheckInput): PolicyBlock {
  const today = israelDay(nowMs);
  if (kind !== 'streak_rescue' && inFirstWeek(signupMs, nowMs)) {
    const sentToday = log.some((e) => e.k !== 'streak_rescue' && israelDay(e.t) === today);
    if (sentToday) return 'first_week_daily';
  }
  if (kind === 'requested') return null;
  const proactive = log.filter((e) => e.k !== 'requested');
  if (proactive.filter((e) => israelDay(e.t) === today).length >= dailyCap) return 'daily_cap';
  if (proactive.filter((e) => nowMs - e.t < 7 * DAY_MS).length >= POLICY_WEEKLY_CAP) return 'weekly_cap';
  const last = proactive.reduce<number | null>((m, e) => (m === null || e.t > m ? e.t : m), null);
  if (last !== null && nowMs - last < POLICY_SPACING_HOURS * HOUR_MS) return 'spacing';
  return null;
}

/** The log after a send, trimmed to the last POLICY_LOG_KEEP_DAYS days. */
export function appendPolicyLog(log: PolicyLogEntry[], kind: PushPolicyKind, nowMs: number): PolicyLogEntry[] {
  return [...log.filter((e) => nowMs - e.t < POLICY_LOG_KEEP_DAYS * DAY_MS), { t: nowMs, k: kind }];
}
