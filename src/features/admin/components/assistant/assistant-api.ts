/**
 * assistant-api — the drawer's calls to /api/admin/assistant/**. Same-origin; the admin session
 * cookie authenticates, plus the Firebase ID token when available (same pattern as the Kelly
 * admin pages). Errors come back as Hebrew messages from the server when it sent one.
 */
import { auth } from '@/lib/firebase';
import { parseSseChunk, type AdminAssistantEvent, type QuickCard } from '@/lib/ai/admin-assistant/sse';

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await auth.currentUser?.getIdToken().catch(() => undefined);
  return fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { ...(init.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
  });
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
  return typeof body?.message === 'string' ? body.message : fallback;
}

export async function fetchQuickCard(metric: string): Promise<QuickCard> {
  const res = await authedFetch(`/api/admin/assistant/quick/${encodeURIComponent(metric)}`, { method: 'GET' });
  if (!res.ok) throw new Error(await errorMessage(res, 'לא הצלחנו להביא את המספר.'));
  return ((await res.json()) as { card: QuickCard }).card;
}

export function reportLocalNav(): void {
  void authedFetch('/api/admin/assistant/event', { method: 'POST', body: JSON.stringify({ type: 'local_nav' }) }).catch(() => undefined);
}

export async function sendFeedback(auditId: string, rating: 'up' | 'down'): Promise<boolean> {
  const res = await authedFetch('/api/admin/assistant/feedback', { method: 'POST', body: JSON.stringify({ auditId, rating }) }).catch(() => null);
  return !!res?.ok;
}

export interface ThreadMessageDto {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  links: Array<{ href: string; title: string; pageId: string }>;
  unverified?: boolean;
  auditId?: string | null;
}

export async function fetchThread(): Promise<ThreadMessageDto[]> {
  const res = await authedFetch('/api/admin/assistant/thread', { method: 'GET' });
  if (!res.ok) return [];
  return ((await res.json()) as { messages: ThreadMessageDto[] }).messages ?? [];
}

/** Streams one question; calls onEvent for every server event. Throws with a Hebrew message on HTTP errors. */
export async function streamQuestion(
  body: { question: string; localKind: 'data_question' | 'no_match' | 'empty' | 'forced'; currentPath: string | null },
  onEvent: (ev: AdminAssistantEvent) => void,
): Promise<void> {
  const res = await authedFetch('/api/admin/assistant/chat', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok || !res.body) throw new Error(await errorMessage(res, 'העוזר לא זמין כרגע.'));
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseChunk(buffer);
    buffer = rest;
    events.forEach(onEvent);
  }
  if (buffer.trim()) parseSseChunk(`${buffer}\n\n`).events.forEach(onEvent);
}
