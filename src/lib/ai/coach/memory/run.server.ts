/**
 * Kelly phase 3 — the nightly memory run (POST /api/ai-coach/memory/run, driven by the
 * kellyMemoryScheduler Cloud Function at 03:30 Israel). One slice: threads updated in the
 * last 26 hours, oldest uid first after `cursor`, each one extracted (extract.server.ts)
 * until the time budget. Flag ai_coach_memory off → nothing is read or written.
 *
 * Demo world: threads of demo users are never extracted (no LLM spend). `demo_` uids drop
 * for free; the rest of the slice's uids get ONE batched read of `core.demo` only (field
 * mask). That read failing stops the slice (fail closed — no extraction without the check).
 */
import 'server-only';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { AiUnavailableError } from '@/lib/ai/anthropic.server';
import { getServerFeatureFlags, type ServerFeatureFlags } from '@/lib/ai/entitlement.server';
import { isDemoCore, isDemoUid } from '@/lib/demo';
import { AI_COACH_THREADS } from '../thread-store.server';
import { extractMemoryForUser } from './extract.server';

export const MEMORY_LOOKBACK_MS = 26 * 3_600_000;
export const MEMORY_MAX_THREADS_PER_RUN = 300;

export interface MemoryRunResult {
  threads: number;
  /** Demo users' threads skipped (uid prefix or core.demo). */
  skippedDemo: number;
  extracted: number;
  updated: number;
  failed: number;
  costUsd: number;
  remaining: boolean;
  cursor: string | null;
  stoppedBy: string | null;
}

export async function runMemorySlice(
  db: Firestore,
  opts: { now?: Date; cursor?: string | null; timeBudgetMs?: number; flags?: ServerFeatureFlags } = {},
): Promise<MemoryRunResult> {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const out: MemoryRunResult = { threads: 0, skippedDemo: 0, extracted: 0, updated: 0, failed: 0, costUsd: 0, remaining: false, cursor: null, stoppedBy: null };
  const flags = opts.flags ?? (await getServerFeatureFlags(db));
  if (flags.aiCoachMemory !== true) return { ...out, stoppedBy: 'flag_off' };

  const snap = await db
    .collection(AI_COACH_THREADS)
    .where('updatedAt', '>=', Timestamp.fromMillis(now.getTime() - MEMORY_LOOKBACK_MS))
    .select()
    .limit(MEMORY_MAX_THREADS_PER_RUN)
    .get();
  const uids = snap.docs.map((d) => d.id).sort();
  out.threads = uids.length;
  const inSlice = opts.cursor ? uids.filter((u) => u > opts.cursor!) : uids;
  const demo = new Set(inSlice.filter(isDemoUid));
  const toCheck = inSlice.filter((u) => !demo.has(u));
  if (toCheck.length) {
    try {
      const snaps = await db.getAll(...toCheck.map((u) => db.collection('users').doc(u)), { fieldMask: ['core.demo'] });
      for (const s of snaps) if (isDemoCore(s.data()?.core)) demo.add(s.id);
    } catch (err) {
      console.warn('[kelly-memory] demo check failed', (err as Error)?.message);
      return { ...out, stoppedBy: 'demo_check_failed' };
    }
  }
  out.skippedDemo = demo.size;
  const todo = inSlice.filter((u) => !demo.has(u));
  for (const uid of todo) {
    if (Date.now() - started > (opts.timeBudgetMs ?? 40_000)) return { ...out, remaining: true, stoppedBy: 'time_budget' };
    out.cursor = uid;
    try {
      const r = await extractMemoryForUser(db, uid, now.getTime());
      if (r.status !== 'no_new_messages') out.extracted++;
      if (r.status === 'updated') out.updated++;
      if ('costUsd' in r) out.costUsd += r.costUsd;
    } catch (err) {
      if (err instanceof AiUnavailableError) return { ...out, remaining: false, stoppedBy: err.reason };
      out.failed++;
      console.warn('[kelly-memory] user failed', (err as Error)?.message);
    }
  }
  return { ...out, cursor: null, stoppedBy: 'done' };
}
