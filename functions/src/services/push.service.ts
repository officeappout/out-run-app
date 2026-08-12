/**
 * push.service — Centralized push notification delivery for the OUT Social Engagement Engine.
 *
 * All new push triggers (level-up, retention, training_reminder, social, community)
 * call sendPush() from this module. Existing triggers (sendPushFromQueue,
 * chatMessageNotification, onboardingDropoffDispatcher) retain their own delivery
 * paths until a future consolidation pass.
 *
 * FEATURES ENFORCED HERE (not in callers)
 * ────────────────────────────────────────
 * 0. Global kill-switch      — app_config/notification_configs.pushEnabled. Emergency
 *    halt for ALL channels except `system`. Absent/undefined = enabled (safe default).
 *    Unlike the per-channel switch below, this FAILS CLOSED on a Firestore read error —
 *    an emergency switch that fails open during the exact kind of incident (Firestore
 *    degradation) that might prompt reaching for it would defeat its own purpose.
 * 1. User preference filter  — settings.pushEnabled + settings.notificationPrefs.{channel}
 *    `system` channel is force-on and bypasses all filters.
 * 2. Quiet hours             — 22:00–07:00 Asia/Jerusalem; skippable for scheduled jobs.
 * 3. Rate cap                — max 1 push per (uid, channel) per N hours; stored in
 *    `push_rate/{uid}.{channel}_lastSentAt`. Default 24 h; pass rateCapHours=0 to disable.
 * 4. Dead token cleanup      — invalid tokens removed from user docs after every batch.
 * 5. dryRun mode             — resolves tokens and logs intent but makes zero writes.
 * 6. Admin per-channel switch — app_config/notification_configs.channels.{channel}.enabled.
 *    Fails OPEN on a read error (deliberately the opposite bias from the global switch
 *    above — see admin per-channel kill-switch section for why).
 *
 * RATE CAP STORAGE
 * ────────────────
 * Collection: `push_rate`
 * Document:   `push_rate/{uid}`
 * Fields:     `{channel}_lastSentAt: Timestamp`
 *             `{channel}_count: number`  (lifetime counter, for analytics)
 *
 * QUIET HOURS
 * ───────────
 * The app is Israel-only, so we use a fixed timezone ('Asia/Jerusalem').
 * Quiet window: hour >= 22 OR hour < 7 (inclusive).
 * Scheduled functions (retention, training_reminder) pass skipQuietHours=true
 * because their cron expressions already target the active-hours window.
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { writePushSentEvent } from './push-events.service';

// Lazy accessors — admin is initialized by the calling Cloud Function entry point.
const getDb = () => admin.firestore();
const getMessaging = () => admin.messaging();

// ─── Constants ────────────────────────────────────────────────────────────────

const MULTICAST_BATCH_SIZE = 500;
const TOKEN_FETCH_BATCH = 100;
const PRUNE_BATCH_SIZE = 400;
const QUIET_START_HOUR = 22;
const QUIET_END_HOUR = 7;
const TZ = 'Asia/Jerusalem';

// ─── Admin channel-config cache ───────────────────────────────────────────────
// Reads app_config/notification_configs once per 5 min so admin toggles take
// effect within one cache window without adding a Firestore read per sendPush call.
// Shared by both the per-channel switch and the global kill-switch below — they
// read the same document, so refreshing once serves both checks at no extra cost.

const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;

interface ChannelConfigCache {
  enabled: Record<string, boolean>;
  /** Global emergency kill-switch — app_config/notification_configs.pushEnabled. */
  globalEnabled: boolean;
  fetchedAt: number;
}

let channelConfigCache: ChannelConfigCache | null = null;

/**
 * Refresh channelConfigCache from app_config/notification_configs if stale.
 * Returns the current cache, or null if the doc is unreadable and no fresh
 * cache could be built — callers decide their own fail-open/fail-closed
 * behavior based on whether they get null back (see isAdminChannelEnabled
 * vs isGlobalPushEnabled).
 */
async function refreshConfigCache(): Promise<ChannelConfigCache | null> {
  const now = Date.now();
  if (channelConfigCache && now - channelConfigCache.fetchedAt <= CONFIG_CACHE_TTL_MS) {
    return channelConfigCache;
  }
  try {
    const snap = await getDb().doc('app_config/notification_configs').get();
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};
    const channels = (data?.channels ?? {}) as Record<string, { enabled?: boolean }>;
    const enabled: Record<string, boolean> = {};
    for (const [ch, cfg] of Object.entries(channels)) {
      enabled[ch] = cfg?.enabled !== false;
    }
    // Global master switch: absent/undefined → enabled (matches the per-channel
    // field's own default-true philosophy, so this ships byte-identical to
    // current behavior until someone explicitly writes pushEnabled: false).
    const globalEnabled = data?.pushEnabled !== false;
    channelConfigCache = { enabled, globalEnabled, fetchedAt: now };
    return channelConfigCache;
  } catch (e) {
    logger.warn('[push.service] app_config read failed', e);
    return null;
  }
}

async function isAdminChannelEnabled(channel: PushChannel): Promise<boolean> {
  if (channel === 'system') return true;
  const cache = await refreshConfigCache();
  // Fail-open: if config unreadable, allow the push through.
  if (!cache) return true;
  return cache.enabled[channel] !== false;
}

/**
 * Global emergency kill-switch. `system` stays exempt, consistent with its
 * force-on contract everywhere else in this file — a "kill literally
 * everything including security pushes" scenario is rare enough to handle
 * as a deploy-time action instead of a runtime flag.
 *
 * Fails CLOSED on a Firestore read error — deliberately the opposite bias
 * from isAdminChannelEnabled above. See header comment §0 for why.
 */
async function isGlobalPushEnabled(channel: PushChannel): Promise<boolean> {
  if (channel === 'system') return true;
  const cache = await refreshConfigCache();
  if (!cache) return false;
  return cache.globalEnabled;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type PushChannel =
  | 'system'           // operational / security — force-on, no rate cap
  | 'chat'             // direct messages
  | 'encouragement'    // manual admin broadcasts
  | 'health_milestone' // auto-generated park/health achievements
  | 'training_reminder'// scheduled workout reminders
  | 'social'           // group joins, kudos
  | 'progression'      // level-up, streak, PR
  | 'community'        // people nearby, new group
  | 'retention'        // re-engagement after inactivity
  | 'onboarding_dropoff'; // stale-signup nudge — deliberately distinct from
                          // 'training_reminder' so it does NOT share that
                          // channel's independent rate-cap clock on
                          // push_rate/{uid}.training_reminder_lastSentAt
                          // (see onboardingDropoffDispatcher.ts)

/**
 * Opt-in measurement (Wave 1 notification engine). When provided, sendPush()
 * writes a `push_sent` event to `push_events` per attempted uid and stamps
 * `data.messageId` with the generated pushId (reusing the field the native
 * tap handler already reads for its notification_clicks CTR write) so the
 * client can log push_opened/landing_screen against the same pushId. See
 * `push-events.service.ts`'s header comment for the storage-decision
 * reasoning. Absent = zero behavior change (no write, no messageId stamp) —
 * every existing caller stays byte-identical.
 */
export interface SendPushMeasurement {
  variantId: string; // = bundleId
  category: string; // = triggerType
  persona: string;
  activityType?: string;
  framing?: string; // = psychologicalTrigger
  timeOfDay?: string;
  /** Hours after which post_push_outcome should be evaluated. Default 6. */
  outcomeWindowHours?: number;
}

export interface SendPushOpts {
  /** Target user UIDs. For authority-scoped broadcasts use sendPushFromQueue instead. */
  toUids: string[];
  channel: PushChannel;
  title: string;
  body: string;
  /** Optional in-app deep-link path navigated to on notification tap. */
  deepLink?: string;
  /** Extra string fields merged into FCM data payload. */
  data?: Record<string, string>;
  /**
   * When true, resolves tokens + applies all filters but makes no FCM calls or
   * Firestore writes. Useful for verifying delivery estimates before enabling a
   * new trigger.
   */
  dryRun?: boolean;
  /**
   * Hours between two pushes on the same channel to the same user.
   * - Default: 24 for all channels except `system` (which has no cap).
   * - Pass 0 to disable.
   */
  rateCapHours?: number;
  /**
   * Skip quiet-hours check (22:00–07:00 IST). Set to true for scheduled
   * functions whose cron expression already targets active hours.
   */
  skipQuietHours?: boolean;
  /** See SendPushMeasurement's doc comment. Opt-in, absent = no-op. */
  measurement?: SendPushMeasurement;
}

export interface SendPushResult {
  attempted: number;
  delivered: number;
  failed: number;
  /** Blocked by the global emergency kill-switch — tracked separately from
   *  skippedPrefs so an intentional emergency halt is never confused with
   *  routine per-user unsubscribes in operational metrics. */
  skippedGlobalKill: number;
  skippedPrefs: number;
  skippedQuietHours: number;
  skippedRateCap: number;
  tokensPruned: number;
  /** Present only when opts.measurement was provided — the pushId used to
   *  correlate push_events records for this send. */
  pushId?: string;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Send a push notification to a set of user UIDs with all guardrails applied.
 * Returns a stats object describing what happened (useful for dryRun introspection
 * and Cloud Function log summaries).
 */
export async function sendPush(opts: SendPushOpts): Promise<SendPushResult> {
  const {
    toUids,
    channel,
    title,
    body,
    deepLink,
    data: extraData,
    dryRun = false,
    skipQuietHours = false,
  } = opts;

  // system channel: no rate cap, no quiet hours, no pref filter
  const isSystem = channel === 'system';
  const rateCapHours =
    isSystem ? 0 : (opts.rateCapHours !== undefined ? opts.rateCapHours : 24);

  const result: SendPushResult = {
    attempted: toUids.length,
    delivered: 0,
    failed: 0,
    skippedGlobalKill: 0,
    skippedPrefs: 0,
    skippedQuietHours: 0,
    skippedRateCap: 0,
    tokensPruned: 0,
  };

  if (toUids.length === 0) return result;

  // ── Global emergency kill-switch (app_config/notification_configs.pushEnabled) ──
  if (!isSystem && !(await isGlobalPushEnabled(channel))) {
    result.skippedGlobalKill = toUids.length;
    logger.warn(`[push.service] ${channel} — global kill-switch active, skipping ${toUids.length} uid(s)`);
    return result;
  }

  // ── Admin kill-switch (app_config/notification_configs, cached 5 min) ─────
  if (!isSystem && !(await isAdminChannelEnabled(channel))) {
    result.skippedPrefs = toUids.length;
    logger.info(`[push.service] ${channel} — disabled via admin config`);
    return result;
  }

  // ── Check quiet hours once (single timezone for all Israel users) ─────────
  if (!isSystem && !skipQuietHours && isQuietHours()) {
    result.skippedQuietHours = toUids.length;
    logger.info(`[push.service] ${channel} — quiet hours, skipping ${toUids.length} uid(s)`);
    return result;
  }

  // ── Per-uid: pref check + rate cap + token collection ────────────────────
  const tokenList: string[] = [];
  const tokenOwners = new Map<string, string>(); // token → uid

  const db = getDb();

  // Fetch user docs in batches of 100 (Firestore getAll limit)
  for (let i = 0; i < toUids.length; i += TOKEN_FETCH_BATCH) {
    const slice = toUids.slice(i, i + TOKEN_FETCH_BATCH);
    const refs = slice.map((uid) => db.collection('users').doc(uid));
    const docs = await db.getAll(...refs);

    // Fetch rate cap docs for this slice
    const rateRefs = rateCapHours > 0
      ? slice.map((uid) => db.collection('push_rate').doc(uid))
      : [];
    const rateDocs = rateRefs.length > 0 ? await db.getAll(...rateRefs) : [];
    const rateByUid = new Map<string, Record<string, unknown>>();
    rateDocs.forEach((d) => { if (d.exists) rateByUid.set(d.id, d.data() as Record<string, unknown>); });

    for (const userDoc of docs) {
      if (!userDoc.exists) continue;
      const uid = userDoc.id;
      const userData = userDoc.data() as Record<string, unknown>;

      // ── Preference filter (skip for system) ──────────────────────────────
      if (!isSystem) {
        const settings = (userData?.settings ?? {}) as Record<string, unknown>;
        if (settings.pushEnabled === false) {
          result.skippedPrefs++;
          continue;
        }
        const prefs = (settings.notificationPrefs ?? {}) as Record<string, unknown>;
        if (prefs[channel] === false) {
          result.skippedPrefs++;
          continue;
        }
      }

      // ── Rate cap check ────────────────────────────────────────────────────
      if (rateCapHours > 0) {
        const rateData = rateByUid.get(uid);
        const lastSentRaw = rateData?.[`${channel}_lastSentAt`];
        if (lastSentRaw) {
          const lastMs = toMillis(lastSentRaw);
          if (lastMs !== null && Date.now() - lastMs < rateCapHours * 3600 * 1000) {
            result.skippedRateCap++;
            logger.info(`[push.service] uid=${uid} rate-capped on channel=${channel}`);
            continue;
          }
        }
      }

      // ── Collect FCM tokens ────────────────────────────────────────────────
      const tokens = userData?.fcmTokens;
      if (!Array.isArray(tokens)) continue;
      tokens.forEach((t: unknown) => {
        if (typeof t !== 'string' || t.length === 0) return;
        if (!tokenOwners.has(t)) {
          tokenOwners.set(t, uid);
          tokenList.push(t);
        }
      });
    }
  }

  if (tokenList.length === 0) {
    logger.info(`[push.service] ${channel} — 0 tokens after filtering`);
    return result;
  }

  if (dryRun) {
    logger.info(
      `[push.service] dryRun channel=${channel} tokens=${tokenList.length} ` +
        `skippedPrefs=${result.skippedPrefs} skippedRateCap=${result.skippedRateCap}`,
    );
    return result;
  }

  // ── Measurement (opt-in, Wave 1) — mint a pushId and stamp it as
  // messageId so the client tap handler can correlate push_opened /
  // landing_screen against this send (see push-events.service.ts). ────────
  const measurement = opts.measurement;
  const pushId = measurement ? getDb().collection('push_events').doc().id : undefined;
  if (pushId) result.pushId = pushId;

  // ── Build FCM message ─────────────────────────────────────────────────────
  const messageBase: admin.messaging.MulticastMessage = {
    tokens: [],
    notification: { title, body },
    data: {
      channel,
      ...(deepLink ? { deepLink } : {}),
      ...(pushId ? { messageId: pushId } : {}),
      ...(extraData ?? {}),
    },
    apns: {
      payload: { aps: { sound: 'default', badge: 1 } },
    },
    android: {
      priority: 'high',
      notification: { sound: 'default' },
    },
  };

  const deadTokens: string[] = [];
  const messaging = getMessaging();
  // Per-uid delivery, for the measurement write below — a uid counts as
  // delivered if ANY of its tokens (multi-device) succeeded.
  const uidDelivered = new Map<string, boolean>();

  // ── Multicast in batches of 500 ───────────────────────────────────────────
  for (let i = 0; i < tokenList.length; i += MULTICAST_BATCH_SIZE) {
    const batch = tokenList.slice(i, i + MULTICAST_BATCH_SIZE);
    try {
      const response = await messaging.sendEachForMulticast({ ...messageBase, tokens: batch });
      response.responses.forEach((resp, idx) => {
        const uid = tokenOwners.get(batch[idx]);
        if (resp.success) {
          result.delivered++;
          if (uid) uidDelivered.set(uid, true);
        } else {
          result.failed++;
          if (uid && !uidDelivered.has(uid)) uidDelivered.set(uid, false);
          const code = resp.error?.code ?? '';
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/invalid-argument'
          ) {
            deadTokens.push(batch[idx]);
          }
        }
      });
    } catch (e: unknown) {
      result.failed += batch.length;
      logger.warn(`[push.service] multicast batch failed channel=${channel}`, e);
    }
  }

  // ── Update rate cap + prune dead tokens (parallel) ───────────────────────
  await Promise.all([
    rateCapHours > 0 ? updateRateCap(toUids, channel) : Promise.resolve(),
    deadTokens.length > 0 ? pruneTokens(deadTokens, tokenOwners) : Promise.resolve(),
  ]);

  result.tokensPruned = deadTokens.length;

  if (measurement && pushId) {
    await Promise.all(
      Array.from(uidDelivered.entries()).map(([uid, delivered]) =>
        writePushSentEvent({
          pushId,
          uid,
          delivered,
          channel,
          variantId: measurement.variantId,
          category: measurement.category,
          persona: measurement.persona,
          activityType: measurement.activityType,
          framing: measurement.framing,
          timeOfDay: measurement.timeOfDay,
          outcomeWindowHours: measurement.outcomeWindowHours,
        }),
      ),
    );
  }

  logger.info(
    `[push.service] ${channel} done: ` +
      `delivered=${result.delivered} failed=${result.failed} ` +
      `skippedPrefs=${result.skippedPrefs} skippedRateCap=${result.skippedRateCap} ` +
      `pruned=${result.tokensPruned}` +
      (pushId ? ` pushId=${pushId}` : ''),
  );

  return result;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns true when the current time in Israel falls inside the quiet window (22:00–07:00). */
function isQuietHours(): boolean {
  const hour = new Date(
    new Date().toLocaleString('en-US', { timeZone: TZ }),
  ).getHours();
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/**
 * Stamp `{channel}_lastSentAt` on `push_rate/{uid}` for each uid that received
 * the push. Batched to avoid Firestore write limit.
 */
async function updateRateCap(uids: string[], channel: PushChannel): Promise<void> {
  const db = getDb();
  const now = admin.firestore.FieldValue.serverTimestamp();
  const countField = `${channel}_count`;
  const lastSentField = `${channel}_lastSentAt`;

  for (let i = 0; i < uids.length; i += PRUNE_BATCH_SIZE) {
    const slice = uids.slice(i, i + PRUNE_BATCH_SIZE);
    const batch = db.batch();
    slice.forEach((uid) => {
      batch.set(
        db.collection('push_rate').doc(uid),
        {
          [lastSentField]: now,
          [countField]: admin.firestore.FieldValue.increment(1),
        },
        { merge: true },
      );
    });
    try {
      await batch.commit();
    } catch (e: unknown) {
      logger.warn(`[push.service] rate cap update batch failed`, e);
    }
  }
}

/**
 * Remove dead tokens from user docs. Mirrors sendPushFromQueue's pruning logic.
 * Batches up to 400 user updates per Firestore commit.
 */
async function pruneTokens(
  tokens: string[],
  owners: Map<string, string>,
): Promise<void> {
  const db = getDb();
  const byOwner = new Map<string, string[]>();
  tokens.forEach((t) => {
    const uid = owners.get(t);
    if (!uid) return;
    if (!byOwner.has(uid)) byOwner.set(uid, []);
    byOwner.get(uid)!.push(t);
  });

  const writers = Array.from(byOwner.entries());
  for (let i = 0; i < writers.length; i += PRUNE_BATCH_SIZE) {
    const slice = writers.slice(i, i + PRUNE_BATCH_SIZE);
    const batch = db.batch();
    slice.forEach(([uid, deadTokens]) => {
      const ref = db.collection('users').doc(uid);
      const update: Record<string, unknown> = {
        fcmTokens: admin.firestore.FieldValue.arrayRemove(...deadTokens),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      deadTokens.forEach((t) => {
        update[`fcmTokenMeta.${t}`] = admin.firestore.FieldValue.delete();
      });
      batch.update(ref, update);
    });
    try {
      await batch.commit();
    } catch (e: unknown) {
      logger.warn('[push.service] token prune batch failed', e);
    }
  }
}

/** Convert a Firestore Timestamp / number / Date to millis. Returns null on unknown type. */
function toMillis(v: unknown): number | null {
  if (!v) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && v !== null) {
    const t = v as { toMillis?: () => number; seconds?: number };
    if (typeof t.toMillis === 'function') return t.toMillis();
    if (typeof t.seconds === 'number') return t.seconds * 1000;
  }
  return null;
}
