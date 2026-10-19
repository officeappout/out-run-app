/**
 * Server-side capture gate: the real flag value (no super-admin override), the caller's
 * super-admin bit and the sample % (app_config/generation_review.samplePct, default 100).
 * The flag + config doc are cached for 60 s per instance — a log call costs one users/{uid} read.
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { getServerFeatureFlags } from '@/lib/ai/entitlement.server';
import { getIsraelDateKey } from '@/lib/israelTime';
import { normalizeSamplePct, shouldCapture } from '../sampling';
import { GENERATION_REVIEW_CONFIG_DOC } from '../types';

const TTL_MS = 60_000;
let cache: { at: number; flagOn: boolean; llmOn: boolean; samplePct: number } | null = null;

export async function loadGenerationReviewConfig(db: Firestore, now = Date.now()) {
  if (cache && now - cache.at < TTL_MS) return cache;
  const [flags, cfgSnap] = await Promise.all([
    getServerFeatureFlags(db),
    db.collection(GENERATION_REVIEW_CONFIG_DOC.collection).doc(GENERATION_REVIEW_CONFIG_DOC.doc).get().catch(() => null),
  ]);
  cache = {
    at: now,
    flagOn: flags.enableGenerationReview === true,
    llmOn: flags.enableGenerationReviewLlm === true,
    samplePct: normalizeSamplePct(cfgSnap?.exists ? cfgSnap.data()?.samplePct : undefined),
  };
  return cache;
}

/** Test-only. */
export function __resetGateCacheForTests() {
  cache = null;
}

export async function isSuperAdminUid(db: Firestore, uid: string): Promise<boolean> {
  const snap = await db.collection('users').doc(uid).get();
  return (snap.data()?.core as Record<string, unknown> | undefined)?.isSuperAdmin === true;
}

export interface CaptureDecision {
  capture: boolean;
  /** The user may report (super admin, or the flag is on). */
  canReport: boolean;
  isSuperAdmin: boolean;
}

export async function decideCapture(db: Firestore, uid: string, now = new Date()): Promise<CaptureDecision> {
  const cfg = await loadGenerationReviewConfig(db, now.getTime());
  const isSuperAdmin = await isSuperAdminUid(db, uid);
  return {
    capture: shouldCapture({ flagOn: cfg.flagOn, isSuperAdmin, uid, day: getIsraelDateKey(now), samplePct: cfg.samplePct }),
    canReport: isSuperAdmin || cfg.flagOn,
    isSuperAdmin,
  };
}
