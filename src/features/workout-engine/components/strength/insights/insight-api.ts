'use client';

/**
 * Workout insights — the client of POST /api/insights/workout. One request per key for the
 * app session (the level-up screen and the summary share it). Never throws and never blocks:
 * no token, a non-200, a network error or the timeout → EMPTY (the screens show no line).
 */
import { auth } from '@/lib/firebase';
import { EMPTY_INSIGHT, type WorkoutInsightLines, type WorkoutInsightRequest } from '@/lib/ai/insights/schema';

export const INSIGHT_CLIENT_TIMEOUT_MS = 9000;

const inflight = new Map<string, Promise<WorkoutInsightLines>>();

function clean(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null;
}

/** The response body → lines (anything unexpected → null lines). Exported for the tests. */
export function linesFromResponse(status: number, data: unknown): WorkoutInsightLines {
  if (status !== 200 || !data || typeof data !== 'object') return EMPTY_INSIGHT;
  const o = data as Record<string, unknown>;
  return { insight: clean(o.insight), funny: clean(o.funny) };
}

async function post(req: WorkoutInsightRequest, fetchImpl: typeof fetch): Promise<WorkoutInsightLines> {
  const token = await auth.currentUser?.getIdToken().catch(() => undefined);
  if (!token) return EMPTY_INSIGHT;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), INSIGHT_CLIENT_TIMEOUT_MS);
  try {
    const res = await fetchImpl('/api/insights/workout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(req),
      signal: ctl.signal,
    });
    return linesFromResponse(res.status, await res.json().catch(() => null));
  } catch {
    return EMPTY_INSIGHT;
  } finally {
    clearTimeout(timer);
  }
}

export function fetchWorkoutInsight(req: WorkoutInsightRequest, fetchImpl: typeof fetch = fetch): Promise<WorkoutInsightLines> {
  const hit = inflight.get(req.key);
  if (hit) return hit;
  const p = post(req, fetchImpl);
  inflight.set(req.key, p);
  return p;
}

/** Tests only. */
export function __resetInsightCache(): void {
  inflight.clear();
}
