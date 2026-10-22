/**
 * signup-failures-summary.server — signup failures in the last N days as counts by stage /
 * reason ONLY (no uids — plan §6.6). Same collection + timestamp field as
 * /api/admin/signup-failures and the home page's 7-day count. ROOT ONLY (that page and the home
 * row are root-gated: isRootAdmin) — the caller enforces it.
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { DAY_MS } from './dates';

export interface SignupFailuresSummary {
  days: number;
  total: number;
  byStage: Array<{ key: string; count: number }>;
  byReason: Array<{ key: string; count: number }>;
}

const MAX_DOCS = 2000;

function top(map: Map<string, number>, n: number) {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([key, count]) => ({ key, count }));
}

export async function computeSignupFailuresSummary(db: Firestore, opts: { days?: number; now?: Date } = {}): Promise<SignupFailuresSummary> {
  const days = opts.days ?? 7;
  const now = opts.now ?? new Date();
  const snap = await db
    .collection('signup_failures')
    .where('timestamp', '>=', new Date(now.getTime() - days * DAY_MS))
    .select('stage', 'reason')
    .limit(MAX_DOCS)
    .get();
  const stages = new Map<string, number>();
  const reasons = new Map<string, number>();
  for (const d of snap.docs) {
    const st = typeof d.data()?.stage === 'string' ? (d.data()?.stage as string).slice(0, 60) : '(ללא שלב)';
    // reason is a system error string; emails / long ids are masked anyway (no PII, plan §6.6)
    const re = typeof d.data()?.reason === 'string' ? maskPii(d.data()?.reason as string).slice(0, 60) : '(ללא סיבה)';
    stages.set(st, (stages.get(st) ?? 0) + 1);
    reasons.set(re, (reasons.get(re) ?? 0) + 1);
  }
  return { days, total: snap.size, byStage: top(stages, 5), byReason: top(reasons, 5) };
}

/** Masks emails, phone-like digit runs and long opaque ids in a free-text reason. */
export function maskPii(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\+?\d[\d\s-]{7,}\d/g, '[number]')
    .replace(/\b[A-Za-z0-9]{20,}\b/g, '[id]');
}
