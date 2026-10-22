/**
 * Measure every push type — system_config/feature_flags.enable_push_measure_all
 * (default OFF, owner-approved 22.10.2026; docs/admin/ADMIN-AI-ASSISTANT-PLAN.md §5 data gaps).
 *
 * Before this, only the senders that pass `measurement` to sendPush() wrote `push_sent` to
 * push_events (and only those pushes carried the `messageId` the app's tap handler needs to
 * write `push_opened`), so the open/act funnel covered a subset of the push types. With the
 * flag on:
 *   - every sendPush() caller that names its type (`measurementTypeId`) and doesn't already
 *     measure gets a default measurement → push_sent + messageId → push_opened (app) →
 *     outcome window → post_push_outcome (pushOutcomeSweeper), exactly like the measured ones;
 *   - the three legacy direct-FCM paths (chat, onboarding drop-off, queue broadcasts) do the
 *     same through `writeLegacyPushSentEvents`;
 *   - every push_sent / push_opened / landing_screen / post_push_outcome record of a measured
 *     send carries `typeId` (= the push_events `category`, the one type id per push type).
 *
 * Off = byte-identical: resolveSendMeasurement returns the caller's own measurement untouched
 * and no typeId is written anywhere (tested). The flag is read through a 60s cache, failing
 * CLOSED (a read error keeps the last known value, or off).
 */
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import type { SendPushMeasurement } from './push.service';

export const PUSH_MEASURE_ALL_FLAG = 'enable_push_measure_all';

/**
 * The type id (= push_events.category) of every sender that was NOT measured before this flag.
 * Existing measured senders keep their own categories (Daily_Goal, Future_Partner_Plan,
 * ScheduledWorkout, ReminderSweep, ReminderSweepWorkout, FirstWeek, SecondWorkout, Streak,
 * FirstWorkout, Inactivity) — retentionScheduler reuses 'Inactivity' for its untoned sends.
 */
export const PUSH_TYPE_IDS = {
  levelUp: 'LevelUp',
  kudos: 'Kudos',
  groupWelcome: 'GroupWelcome',
  groupAdminJoin: 'GroupAdminJoin',
  contributionApproved: 'ContributionApproved',
  weekStart: 'WeekStart',
  coachMessage: 'CoachMessage',
  chatMessage: 'ChatMessage',
  onboardingDropoff: 'OnboardingDropoff',
  broadcast: 'AdminBroadcast',
  retention: 'Inactivity',
} as const;

/** The measurement a type-only sender gets when the flag is on. */
export function defaultMeasurement(typeId: string): SendPushMeasurement {
  return { variantId: `default:${typeId}`, category: typeId, persona: 'all' };
}

/**
 * Pure. What sendPush() should measure, and which typeId to stamp.
 *   flag off            → the caller's measurement exactly as passed, no typeId
 *   flag on + explicit  → the caller's measurement, typeId = its category
 *   flag on + type only → defaultMeasurement(typeId)
 *   flag on + neither   → nothing (an unnamed sender stays unmeasured)
 */
export function resolveSendMeasurement(
  explicit: SendPushMeasurement | undefined,
  typeId: string | undefined,
  measureAll: boolean,
): { measurement: SendPushMeasurement | undefined; typeId: string | undefined } {
  if (!measureAll) return { measurement: explicit, typeId: undefined };
  if (explicit) return { measurement: explicit, typeId: explicit.category };
  if (typeId) return { measurement: defaultMeasurement(typeId), typeId };
  return { measurement: undefined, typeId: undefined };
}

const FLAG_TTL_MS = 60_000;
let flagCache: { at: number; on: boolean } | null = null;

/** Test-only. */
export function __resetPushMeasureAllCache(): void {
  flagCache = null;
}

export async function isPushMeasureAllEnabled(): Promise<boolean> {
  const now = Date.now();
  if (flagCache && now - flagCache.at < FLAG_TTL_MS) return flagCache.on;
  let on = flagCache?.on ?? false;
  try {
    const snap = await admin.firestore().doc('system_config/feature_flags').get();
    on = (snap.data() as Record<string, unknown> | undefined)?.[PUSH_MEASURE_ALL_FLAG] === true;
  } catch (e: unknown) {
    logger.warn(`[push-measure-all] ${PUSH_MEASURE_ALL_FLAG} read failed — keeping ${on}`, e);
  }
  flagCache = { at: now, on };
  return on;
}

/** A fresh pushId (same id space sendPush() mints from). */
export function mintPushId(): string {
  return admin.firestore().collection('push_events').doc().id;
}

/**
 * Pure. Per-uid delivery for a legacy multicast batch: a uid counts as delivered if ANY of its
 * tokens succeeded (same rule as sendPush()). `results[i]` is the outcome of `tokens[i]`;
 * `null` results = the whole batch threw.
 */
export function accumulateUidDelivery(
  into: Map<string, boolean>,
  tokens: string[],
  owners: Map<string, string> | ((token: string) => string | undefined),
  results: boolean[] | null,
): void {
  const ownerOf = typeof owners === 'function' ? owners : (t: string) => owners.get(t);
  tokens.forEach((token, i) => {
    const uid = ownerOf(token);
    if (!uid) return;
    const ok = results ? results[i] === true : false;
    if (ok) into.set(uid, true);
    else if (!into.has(uid)) into.set(uid, false);
  });
}
