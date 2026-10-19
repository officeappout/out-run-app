/**
 * In-memory record of what this device logged this session (pure state, no I/O): the last
 * drafts (so a report can attach to — or carry — the session the user is looking at), the
 * fingerprint dedupe (a re-render of the same session is not logged twice) and the outcome
 * tracking (which shown session the user started, swaps, abandon).
 */
import type { GenerationLogDraft, GenerationType } from '@/lib/generation-review/types';

export type Family = 'strength' | 'hybrid' | 'run';

export function familyOf(type: GenerationType): Family {
  if (type === 'home_strength' || type === 'kelly_workout') return 'strength';
  if (type.startsWith('hybrid_')) return 'hybrid';
  return 'run';
}

export interface Remembered {
  draft: GenerationLogDraft;
  family: Family;
  exerciseIds: Set<string>;
  routeId: string | null;
  /** The server stored it (sampled / super admin). */
  stored: boolean;
}

const MAX = 30;
const DEDUPE_MS = 6 * 3_600_000;
export const MATCH_WINDOW_MS = 3 * 3_600_000;

const recent: Remembered[] = [];
const seen = new Map<string, number>();
const active: Partial<Record<Family, { id: string; swaps: number; abandoned: boolean }>> = {};

export function seenRecently(type: GenerationType, fingerprint: string, now = Date.now()): boolean {
  const k = `${type}|${fingerprint}`;
  const at = seen.get(k);
  if (at && now - at < DEDUPE_MS) return true;
  seen.set(k, now);
  if (seen.size > 200) seen.delete(seen.keys().next().value as string);
  return false;
}

export function remember(r: Remembered) {
  recent.unshift(r);
  if (recent.length > MAX) recent.length = MAX;
}

export function markStored(id: string, stored: boolean) {
  const r = recent.find((x) => x.draft.id === id);
  if (r) r.stored = stored;
}

export function latest(filter: (r: Remembered) => boolean, now = Date.now()): Remembered | null {
  return recent.find((r) => filter(r) && now - r.draft.shownAtMs < MATCH_WINDOW_MS) ?? null;
}

export function findById(id: string): Remembered | null {
  return recent.find((r) => r.draft.id === id) ?? null;
}

/** The shown session that best matches what the user started. */
export function matchStarted(family: Family, hint: { exerciseIds?: string[]; routeId?: string | null } = {}, now = Date.now()): Remembered | null {
  const pool = recent.filter((r) => r.family === family && now - r.draft.shownAtMs < MATCH_WINDOW_MS);
  if (!pool.length) return null;
  if (hint.routeId) {
    // A route the user started that we did not log (official route, the hybrid line) → no match.
    return pool.find((r) => r.routeId === hint.routeId) ?? null;
  }
  if (hint.exerciseIds?.length) {
    const want = new Set(hint.exerciseIds);
    let best: Remembered | null = null;
    let bestScore = 0;
    for (const r of pool) {
      const inter = Array.from(want).filter((x) => r.exerciseIds.has(x)).length;
      const union = new Set(Array.from(want).concat(Array.from(r.exerciseIds))).size || 1;
      const score = inter / union;
      if (score > bestScore) [best, bestScore] = [r, score];
    }
    return bestScore >= 0.5 ? best : null;
  }
  return pool[0];
}

export function setActive(family: Family, id: string | null) {
  if (id) active[family] = { id, swaps: 0, abandoned: false };
  else delete active[family];
}

export function getActive(family: Family) {
  return active[family] ?? null;
}

/** Test-only. */
export function __resetMemoryForTests() {
  recent.length = 0;
  seen.clear();
  for (const k of Object.keys(active)) delete active[k as Family];
}
