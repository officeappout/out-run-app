/**
 * Kelly phase 3 — the nightly memory run (POST /api/ai-coach/memory/run, driven by the
 * kellyMemoryScheduler Cloud Function at 03:30 Israel). One slice: threads updated in the
 * last 26 hours, oldest uid first after `cursor`, each one extracted (extract.server.ts)
 * until the time budget. Flag ai_coach_memory off → nothing is read or written.
 */
import 'server-only';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { AiUnavailableError } from '@/lib/ai/anthropic.server';
import { getServerFeatureFlags, type ServerFeatureFlags } from '@/lib/ai/entitlement.server';
import { AI_COACH_THREADS } from '../thread-store.server';
import { extractMemoryForUser } from './extract.server';

export const MEMORY_LOOKBACK_MS = 26 * 3_600_000;
export const MEMORY_MAX_THREADS_PER_RUN = 300;

export interface MemoryRunResult {
  threads: number;
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
  const out: MemoryRunResult = { threads: 0, extracted: 0, updated: 0, failed: 0, costUsd: 0, remaining: false, cursor: null, stoppedBy: null };
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
  const todo = opts.cursor ? uids.filter((u) => u > opts.cursor!) : uids;
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
