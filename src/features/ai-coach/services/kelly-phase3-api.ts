'use client';

/**
 * Kelly phase 3 — the client side of the server-only collections:
 *   rateWorkout     "איך היה?" → POST /api/ai-coach/proactive/feedback (flag ai_coach_proactive)
 *   memory*         "מה קלי זוכר" → /api/ai-coach/memory (flag ai_coach_memory)
 * Token-scoped: the server takes the uid from the ID token only.
 */
import { auth } from '@/lib/firebase';
import type { WorkoutRating } from '@/lib/ai/coach/action-chips';
import type { MemoryCategory } from '@/lib/ai/coach/memory/types';

async function call(path: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<{ status: number; data: Record<string, unknown> }> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) return { status: 401, data: {} };
  try {
    const res = await fetch(path, {
      method: init.method,
      headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}` },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    });
    return { status: res.status, data: ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown> };
  } catch {
    return { status: 0, data: {} };
  }
}

/** true = stored (or already answered before). */
export async function rateWorkout(messageId: string, rating: WorkoutRating): Promise<boolean> {
  const r = await call('/api/ai-coach/proactive/feedback', { method: 'POST', body: { messageId, rating } });
  return r.status === 200 || r.status === 409;
}

export interface MemoryFactView {
  id: string;
  category: MemoryCategory;
  text: string;
}

export async function listMemory(): Promise<MemoryFactView[] | null> {
  const r = await call('/api/ai-coach/memory', { method: 'GET' });
  if (r.status !== 200 || !Array.isArray(r.data.facts)) return null;
  return (r.data.facts as Array<Record<string, unknown>>)
    .filter((f) => typeof f.id === 'string' && typeof f.text === 'string' && typeof f.category === 'string')
    .map((f) => ({ id: f.id as string, category: f.category as MemoryCategory, text: f.text as string }));
}

export async function deleteMemoryFact(id: string): Promise<boolean> {
  const r = await call('/api/ai-coach/memory', { method: 'POST', body: { action: 'delete', id } });
  return r.status === 200 || r.status === 404;
}

export async function deleteAllMemory(): Promise<boolean> {
  const r = await call('/api/ai-coach/memory', { method: 'POST', body: { action: 'delete_all' } });
  return r.status === 200;
}
