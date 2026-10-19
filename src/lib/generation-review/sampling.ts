/**
 * Who is captured. Pure.
 *   - flag off  → super admins only
 *   - flag on   → super admins always + users whose (uid, day) hash falls under samplePct
 * The hash is per user per Israel day, so a sampled user's whole day is logged (outcomes and
 * reports then always find their session) and the sample rotates daily.
 */
import { fingerprintOf } from './fingerprint';

export const DEFAULT_SAMPLE_PCT = 100;

export function normalizeSamplePct(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : DEFAULT_SAMPLE_PCT;
}

export function inSample(uid: string, day: string, samplePct: number): boolean {
  if (samplePct >= 100) return true;
  if (samplePct <= 0) return false;
  const bucket = parseInt(fingerprintOf(`${uid}|${day}`), 36) % 10_000;
  return bucket < samplePct * 100;
}

export function shouldCapture(opts: { flagOn: boolean; isSuperAdmin: boolean; uid: string; day: string; samplePct: number }): boolean {
  if (opts.isSuperAdmin) return true;
  if (!opts.flagOn) return false;
  return inSample(opts.uid, opts.day, opts.samplePct);
}
