/**
 * Client-side wrapper for the `ingestHealthSamples` Cloud Function
 * (Native Phase, Apr 2026 — "the Passive Door").
 *
 * Sole supported path for sending HealthKit / Health Connect samples
 * to the server. Server enforces:
 *   • App Check token (`enforceAppCheck: true`)
 *   • Firebase Auth UID
 *   • Per-day clamps (steps ≤ 100k, calories ≤ 10k, activeMin ≤ 1440)
 *   • Idempotent dedupe by `sampleUUID`
 *   • Daily Global-XP cap of 200 (no coins, no per-program XP)
 *
 * This wrapper is called from `OutboxFlusher` after the HealthBridge
 * Capacitor plugin enqueues samples in IndexedDB. Direct invocation
 * from UI code is discouraged — always go through the outbox so
 * offline gym workouts replay safely.
 *
 * Returns `null` on failure (offline, App Check missing, server 5xx).
 * Callers MUST NOT delete from the outbox until the call succeeds.
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '@/lib/firebase';

export type IngestSampleType = 'steps' | 'activeEnergy' | 'exerciseTime';
export type IngestSampleSource = 'healthkit' | 'healthconnect';

export interface IngestHealthSamplePayload {
  sampleUUID: string;
  type: IngestSampleType;
  value: number;
  startDate: string;
  endDate: string;
  source: IngestSampleSource;
  deviceModel?: string;
}

export interface IngestHealthSamplesInput {
  /** Local date the samples belong to, YYYY-MM-DD. */
  date: string;
  samples: IngestHealthSamplePayload[];
}

export interface IngestHealthSamplesResult {
  ok: true;
  accepted: number;
  deduped: number;
  rejected: number;
  xpAwarded: number;
  capReached: boolean;
  passiveXpAwardedToday: number;
}

export async function ingestHealthSamples(
  input: IngestHealthSamplesInput,
): Promise<IngestHealthSamplesResult | null> {
  if (typeof window === 'undefined') return null;
  if (!input.samples || input.samples.length === 0) return null;
  try {
    const functions = getFunctions(app, 'us-central1');
    const callable = httpsCallable<IngestHealthSamplesInput, IngestHealthSamplesResult>(
      functions,
      'ingestHealthSamples',
    );
    const { data } = await callable(input);
    return data;
  } catch (err) {
    console.error('[ingestHealthSamples] Passive Door call failed:', err);
    return null;
  }
}
