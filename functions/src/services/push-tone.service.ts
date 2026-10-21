/**
 * push-tone.service — tone rotation for push copy (owner, 21.10.2026).
 *
 * The sender gets a random order of the tones the user's segment allows
 * (shared/first-week.core.ts toneOrder). Each tone is tried as
 * conditions.tone; the first that resolves to a row WRITTEN for that tone
 * wins. If none does, the untoned copy goes out and the tone is recorded as
 * 'none'. The tone actually sent is recorded on push_events (measurement.tone)
 * so the engine can learn what works per user.
 *
 * Flag: app_config/feature_flags.pushToneRotation (DEFAULT OFF) for the
 * EXISTING senders (retention, step goal). The first-week sequence and the
 * second-workout push always rotate (they are new, behind their own flag).
 */
import * as admin from 'firebase-admin';
import { resolvePushCopy } from './push-copy.service';
import type { PushCopyContext, ResolvedPushCopy } from '../shared/push-library.core';
import type { PushTone, ToneSegment } from '../shared/first-week.core';

export interface TonedCopy {
  copy: ResolvedPushCopy;
  tone: PushTone | 'none';
}

/** Pure: the tone a resolved row was written for, if it is `tone`. */
export function copyHasTone(copy: ResolvedPushCopy | null, tone: PushTone): boolean {
  return !!copy?.conditions?.tone?.includes(tone);
}

/** Tries `tones` in order, then the untoned copy. null when nothing fits at all. */
export async function resolveTonedCopy(
  pushType: string,
  ctx: PushCopyContext,
  tones: ReadonlyArray<PushTone>,
  resolve: typeof resolvePushCopy = resolvePushCopy,
): Promise<TonedCopy | null> {
  for (const tone of tones) {
    const copy = await resolve(pushType, { ...ctx, conditions: { ...(ctx.conditions ?? {}), tone } });
    if (copy && copyHasTone(copy, tone)) return { copy, tone };
  }
  const plain = await resolve(pushType, ctx);
  return plain ? { copy: plain, tone: 'none' } : null;
}

/** The segment a user's audience values describe (city broadcasts pass cityBroadcast themselves). */
export function toneSegmentFrom(audience: { ageBand?: string | null; persona?: string | null } | undefined): ToneSegment {
  return { ageBand: audience?.ageBand ?? null, persona: audience?.persona ?? null };
}

// ─── Engagement flags (cached 60s; read failure → all off) ───────────────────

export interface EngagementFlags {
  /** First-week sequence + second-workout push (firstWorkoutScheduler). */
  firstWeekSequence: boolean;
  /** Tone rotation on the existing senders (retention, step goal). */
  toneRotation: boolean;
  /** Retention ladder v2: d4, d7, d14, d21, d28, then quiet. */
  retentionLadderV2: boolean;
}

export function engagementFlagsFrom(raw: Record<string, unknown> | undefined): EngagementFlags {
  return {
    firstWeekSequence: raw?.firstWeekSequenceEnabled === true,
    toneRotation: raw?.pushToneRotation === true,
    retentionLadderV2: raw?.retentionLadderV2 === true,
  };
}

const TTL_MS = 60_000;
let cache: { at: number; flags: EngagementFlags } | null = null;

export async function readEngagementFlags(db: admin.firestore.Firestore, nowMs: number = Date.now()): Promise<EngagementFlags> {
  if (cache && nowMs - cache.at < TTL_MS) return cache.flags;
  let flags = engagementFlagsFrom(undefined);
  try {
    flags = engagementFlagsFrom((await db.doc('app_config/feature_flags').get()).data() as Record<string, unknown> | undefined);
  } catch {
    // all off
  }
  cache = { at: nowMs, flags };
  return flags;
}

/** Tests only. */
export function __resetEngagementFlagsCache(): void {
  cache = null;
}
