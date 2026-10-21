/**
 * Push lifecycle helpers (push-lifecycle audit, owner-approved 21.10.2026).
 * Pure — no Firestore. Used by firstWorkoutScheduler, retentionScheduler and
 * onboardingDropoffDispatcher.
 *
 *  - the user's TRACK for copy (conditions.track): a runner or walker must not
 *    get "the park is waiting";
 *  - the signup STAGE a drop-off stopped at (conditions.stage): "נשאר רק עוד
 *    צעד" only for who stopped at the end;
 *  - the first-workout window (day 1 and day 2 after signup, at most 2 sends);
 *  - the cap on the legacy retention cadence (every 48h with no end → at most
 *    RETENTION_LEGACY_MAX_SENDS per absence).
 *
 * Flag: app_config/feature_flags.firstWorkoutPushEnabled (DEFAULT OFF) gates
 * the first-workout push, the "never trained → first-workout copy instead of
 * 'מוכן לחזור?'" switch in retention, and the legacy cadence cap. The track /
 * stage conditions are copy only and apply as soon as this is deployed.
 */

export type PushTrack = 'strength' | 'run' | 'walk';

type Levels = Record<string, { currentLevel?: number; level?: number } | null | undefined> | null | undefined;

/** Same rule as src/lib/track-ownership.ts hasStrengthTrack (assessed non-running domain). */
function hasStrength(progression: { domains?: Levels; tracks?: Levels } | undefined): boolean {
  const NON_STRENGTH = new Set(['running', 'flexibility']);
  const any = (obj: Levels) =>
    !!obj && Object.entries(obj).some(([k, v]) => !NON_STRENGTH.has(k) && ((v?.currentLevel ?? v?.level ?? 0) > 0));
  return any(progression?.domains) || any(progression?.tracks);
}

/**
 * The track push copy is written for, or null (mixed / unknown → only rows
 * without a track condition fit). A user with both strength and running uses
 * lifestyle.primaryTrack when it names one of them, else null.
 */
export function pushTrackFromUserData(data: Record<string, unknown> | undefined): PushTrack | null {
  if (!data) return null;
  const running = data.running as { isUnlocked?: unknown } | undefined;
  const lifestyle = data.lifestyle as { primaryTrack?: unknown } | undefined;
  const primary = lifestyle?.primaryTrack;
  const run = !!running?.isUnlocked;
  const strength = hasStrength(data.progression as { domains?: Levels; tracks?: Levels } | undefined);
  if (run && strength) return primary === 'run' ? 'run' : primary === 'strength' ? 'strength' : null;
  if (run) return 'run';
  if (strength) return 'strength';
  if (primary === 'run') return 'run';
  if (primary === 'strength') return 'strength';
  if (primary === 'health') return 'walk';
  return null;
}

export type DropoffStage = 'early' | 'mid' | 'near_end';

/** users.onboardingStep → the stage the drop-off copy is written for (null = unknown → neutral rows only). */
export function dropoffStageOf(step: unknown): DropoffStage | null {
  switch (step) {
    case 'IDENTITY':
    case 'LOCATION':
    case 'EQUIPMENT':
    case 'OTHER':
      return 'early';
    case 'ASSESSMENT':
      return 'mid';
    case 'VISUAL_ASSESSMENT_COMPLETE':
    case 'HEALTH':
      return 'near_end';
    default:
      return null;
  }
}

/** push library conditions for a track/stage (absent values are left out, never passed as empty). */
export function trackConditions(track: PushTrack | null, extra: Record<string, string | null | undefined> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(extra)) if (v) out[k] = v;
  if (track) out.track = track;
  return out;
}

// ─── First workout ────────────────────────────────────────────────────────────

export const FIRST_WORKOUT_MAX_SENDS = 2;
const HOUR_MS = 3_600_000;

/**
 * 'day1' (24–48h after signup) or 'day2' (48–72h), else null. Hours, not
 * calendar days, so a late-evening signup isn't nudged the next morning.
 */
export function firstWorkoutWindow(signupMs: number | null, nowMs: number): 'day1' | 'day2' | null {
  if (signupMs === null || !Number.isFinite(signupMs)) return null;
  const h = (nowMs - signupMs) / HOUR_MS;
  if (h >= 24 && h < 48) return 'day1';
  if (h >= 48 && h < 72) return 'day2';
  return null;
}

/** The sent log on push_rate/{uid}: which windows already got the push. */
export function firstWorkoutSentFrom(rateData: Record<string, unknown> | undefined): string[] {
  const raw = rateData?.firstWorkout_sent;
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

/** Whether this window's push is still due (not sent in it, under the lifetime cap). */
export function firstWorkoutDue(window: 'day1' | 'day2' | null, sent: string[]): boolean {
  return !!window && !sent.includes(window) && sent.length < FIRST_WORKOUT_MAX_SENDS;
}

// ─── Retention legacy cadence cap ─────────────────────────────────────────────

/**
 * Without retentionMilestoneCadence, retention went out every 48h for as long
 * as the user stayed away. With firstWorkoutPushEnabled it stops after this
 * many sends per absence — the same count as the milestone cadence (d4, d7,
 * d14, d30).
 */
export const RETENTION_LEGACY_MAX_SENDS = 4;

export interface RetentionLegacyLog {
  anchor: number | null;
  count: number;
}

export function retentionLegacyLogFrom(rateData: Record<string, unknown> | undefined): RetentionLegacyLog {
  const anchor = typeof rateData?.retention_legacyAnchor === 'number' ? rateData.retention_legacyAnchor : null;
  const count = typeof rateData?.retention_legacyCount === 'number' ? rateData.retention_legacyCount : 0;
  return { anchor, count };
}

/** True when this absence (anchored at the last activity) already got the max. A new activity resets it. */
export function retentionLegacyCapReached(log: RetentionLegacyLog, anchorMs: number): boolean {
  return log.anchor === anchorMs && log.count >= RETENTION_LEGACY_MAX_SENDS;
}

export function recordRetentionLegacySend(log: RetentionLegacyLog, anchorMs: number): RetentionLegacyLog {
  return { anchor: anchorMs, count: log.anchor === anchorMs ? log.count + 1 : 1 };
}
