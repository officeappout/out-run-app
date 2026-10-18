/**
 * onKellyThreadMessage — Firestore trigger (onCreate ai_coach_threads/{uid}/messages/{id}).
 *
 * Unified Kelly, phase 1 (flag system_config/feature_flags.kelly_unified_v1). Pushes the user
 * when a PERSON or the APP wrote to them in their Kelly conversation:
 *   source 'human'  — a team reply from the admin panel
 *   source 'system' — an app message (the welcome)
 * Never for 'ai' (a synchronous reply the user is watching) or 'user'. Early-exits on those
 * with a single field check, so the per-message cost of the AI chat is one invocation.
 *
 * Also skipped:
 *   - flag off (read per invocation; a missing doc/key = off, a read error = off)
 *   - messages copied by scripts/migrate-kelly-dms.ts (`migratedFrom` set, or `noPush`), and
 *     anything whose createdAt is more than STALE_MS old — a backfill must never push
 *
 * Delivery: push.service sendPush(), channel 'coach', deep link /ai-coach. Applies the user's
 * prefs (settings.pushEnabled, notificationPrefs.coach), the admin channel switch, quiet hours
 * 22:00–07:00 (no skipQuietHours), the Shabbat/yom-tov window for observers (not a 1:1 'chat'
 * send, so not exempt), and a short per-user rate cap (RATE_CAP_HOURS) so a burst of replies is
 * one push. 'coach' is not an engagement channel (a reply, not a nudge), so the daily cap
 * doesn't apply.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendPush } from './services/push.service';

if (!admin.apps.length) {
  admin.initializeApp();
}

export const KELLY_PUSH_DEEP_LINK = '/ai-coach';
export const KELLY_PUSH_TITLE = 'קלי';
const RATE_CAP_HOURS = 0.25;
const STALE_MS = 10 * 60 * 1000;
const BODY_MAX = 100;

interface KellyMessage {
  source?: unknown;
  text?: unknown;
  createdAt?: unknown;
  migratedFrom?: unknown;
  noPush?: unknown;
}

function msOf(v: unknown): number | null {
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') return (v as { toMillis: () => number }).toMillis();
  return null;
}

/** Pure decision, exported for tests: should this new message be pushed (flag aside)? */
export function kellyPushDecision(msg: KellyMessage | undefined, nowMs: number): { push: boolean; reason: string } {
  if (!msg) return { push: false, reason: 'empty' };
  if (msg.source !== 'human' && msg.source !== 'system') return { push: false, reason: 'source' };
  if (msg.migratedFrom || msg.noPush === true) return { push: false, reason: 'migrated' };
  const created = msOf(msg.createdAt);
  if (created !== null && nowMs - created > STALE_MS) return { push: false, reason: 'stale' };
  if (typeof msg.text !== 'string' || !msg.text.trim()) return { push: false, reason: 'no_text' };
  return { push: true, reason: 'ok' };
}

export function kellyPushBody(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > BODY_MAX ? `${t.slice(0, BODY_MAX)}...` : t;
}

export const onKellyThreadMessage = onDocumentCreated(
  { document: 'ai_coach_threads/{uid}/messages/{messageId}', timeoutSeconds: 60, memory: '256MiB' },
  async (event) => {
    const msg = event.data?.data() as KellyMessage | undefined;
    const decision = kellyPushDecision(msg, Date.now());
    if (!decision.push) return; // the AI chat's own messages land here — stay silent and cheap

    const uid = event.params.uid as string;
    let enabled = false;
    try {
      const flags = await admin.firestore().doc('system_config/feature_flags').get();
      enabled = flags.exists && flags.data()?.kelly_unified_v1 === true;
    } catch (e) {
      logger.warn('[onKellyThreadMessage] feature flags read failed — skipping', e);
      return;
    }
    if (!enabled) return;

    const result = await sendPush({
      toUids: [uid],
      channel: 'coach',
      title: KELLY_PUSH_TITLE,
      body: kellyPushBody(String(msg!.text)),
      deepLink: KELLY_PUSH_DEEP_LINK,
      data: { kind: 'kelly_message', source: String(msg!.source) },
      rateCapHours: RATE_CAP_HOURS,
      isPersonalInteraction: true,
    });
    logger.info(
      `[onKellyThreadMessage] ${uid}/${event.params.messageId} source=${String(msg!.source)} ` +
        `delivered=${result.delivered} skippedPrefs=${result.skippedPrefs} quiet=${result.skippedQuietHours} ` +
        `shabbat=${result.skippedShabbat} rateCap=${result.skippedRateCap}`,
    );
  },
);
