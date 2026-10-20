/**
 * Kelly on the demo world (owner, 20.10.2026): the batch runs (proactive, memory, AI coach
 * review, generation review) skip demo users unless the `demo_kelly` switch is on. When it
 * is on, demo users run like anyone else and every LLM call made FOR a demo user is counted
 * in the demo center's cost counter. Real users never write here.
 *
 * Flag: system_config/feature_flags.demo_kelly (default OFF). Registered in FLAG_DEFS +
 * the /admin/demo switch by the demo control center PR (#552); read here straight from the
 * flag doc so this guard does not depend on that PR's merge order. Read failure ⇒ OFF.
 *
 * Usage: demo_registry/usage/days/{YYYY-MM-DD} (Israel day) — the doc the demo center reads
 * (src/lib/demo-control/paths.ts in #552: `usage` is a doc, `days` a subcollection, since a
 * document path needs an even number of segments). Several writers share a day doc, so
 * everything is FieldValue.increment with merge: the totals AND bySource.kelly.*.
 * A failed usage write is logged and never breaks the run.
 */
import 'server-only';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getIsraelDateKey } from '@/lib/israelTime';
import type { AiUsage } from './ai-pricing';

export const DEMO_KELLY_FLAG = 'demo_kelly';
export const DEMO_USAGE_SOURCE = 'kelly';

/** demo_kelly switch. Any read failure → false (skip demo users, no spend). */
export async function isDemoKellyOn(db: Firestore): Promise<boolean> {
  try {
    const snap = await db.collection('system_config').doc('feature_flags').get();
    return snap.data()?.[DEMO_KELLY_FLAG] === true;
  } catch (err) {
    console.warn('[demo-kelly] flag read failed — demo users skipped', (err as Error)?.message);
    return false;
  }
}

/** The demo center's usage day doc. */
export function demoUsageDayRef(db: Firestore, now: Date) {
  return db.collection('demo_registry').doc('usage').collection('days').doc(getIsraelDateKey(now));
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
