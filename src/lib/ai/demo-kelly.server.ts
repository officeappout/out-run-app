/**
 * Kelly on the demo world (owner, 20.10.2026): the batch runs (proactive, memory, AI coach
 * review, generation review) skip demo users unless the `demo_kelly` switch is on. When it
 * is on, demo users run like anyone else and every LLM call made FOR a demo user is counted
 * in the demo center's cost counter. Real users never write here.
 *
 * Flag: demo_kelly (FLAG_DEFS `demoKelly`, default OFF; the /admin/demo switch "קלי לדמו"),
 * read through the server flag reader — a read failure returns the defaults ⇒ OFF.
 *
 * Usage: demo_registry/usage/days/{YYYY-MM-DD} (Israel day) — exactly the doc the demo center
 * reads (src/lib/demo-control/paths.ts: `usage` is a doc, `days` a subcollection, since a
 * document path needs an even number of segments). Several writers share a day doc, so
 * everything is FieldValue.increment with merge: the totals AND bySource.kelly.*.
 * A failed usage write is logged and never breaks the run.
 */
import 'server-only';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getIsraelDateKey } from '@/lib/israelTime';
import { DEMO_REGISTRY, DEMO_USAGE_DAYS, DEMO_USAGE_DOC, type UsageSource } from '@/lib/demo-control/paths';
import type { AiUsage } from './ai-pricing';
import { getServerFeatureFlags, type ServerFeatureFlags } from './entitlement.server';

export const DEMO_USAGE_SOURCE: UsageSource = 'kelly';

/**
 * demo_kelly switch. Pass the run's flags when it already has them (no extra read); a flag
 * read failure yields the FLAG_DEFS defaults → false (skip demo users, no spend).
 */
export async function isDemoKellyOn(db: Firestore, flags?: Pick<ServerFeatureFlags, 'demoKelly'>): Promise<boolean> {
  try {
    return (flags ?? (await getServerFeatureFlags(db))).demoKelly === true;
  } catch {
    return false;
  }
}

/** The demo center's usage day doc. */
export function demoUsageDayRef(db: Firestore, now: Date) {
  return db.collection(DEMO_REGISTRY).doc(DEMO_USAGE_DOC).collection(DEMO_USAGE_DAYS).doc(getIsraelDateKey(now));
}

/** The merge payload for one LLM call (exported for tests). */
export function demoUsageIncrements(usage: Pick<AiUsage, 'inputTokens' | 'outputTokens'> & Partial<AiUsage>, model: string | null): Record<string, unknown> {
  const inc = (n: number) => FieldValue.increment(Number.isFinite(n) && n > 0 ? n : 0);
  const counters = {
    llmCalls: inc(1),
    inputTokens: inc(usage.inputTokens),
    outputTokens: inc(usage.outputTokens),
    cachedTokens: inc(usage.cacheReadTokens ?? 0),
  };
  return {
    ...counters,
    bySource: { [DEMO_USAGE_SOURCE]: { ...counters, ...(model ? { model } : {}) } },
    updatedAt: FieldValue.serverTimestamp(),
  };
}

/** Count one demo user's LLM call. Never throws. */
export async function recordDemoKellyUsage(
  db: Firestore,
  usage: (Pick<AiUsage, 'inputTokens' | 'outputTokens'> & Partial<AiUsage>) | null | undefined,
  model: string | null,
  now: Date = new Date(),
): Promise<void> {
  if (!usage) return;
  try {
    await demoUsageDayRef(db, now).set(demoUsageIncrements(usage, model), { merge: true });
  } catch (err) {
    console.warn('[demo-kelly] usage write failed', (err as Error)?.message);
  }
}
