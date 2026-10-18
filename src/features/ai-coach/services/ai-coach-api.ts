'use client';

/**
 * Thin client for POST /api/ai-coach/chat: attaches the Firebase ID token, turns denials
 * into CoachHttpError, and feeds the SSE body to `onEvent` as events arrive.
 * Works the same in the Capacitor app (it loads the site, so fetch streaming is native).
 */
import { auth } from '@/lib/firebase';
import { createSseParser, type ChatRequest, type CoachStreamEvent } from '@/lib/ai/coach/protocol';

export class CoachHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    readonly retryAfterSec: number | undefined,
  ) {
    super(`ai-coach http ${status} ${code ?? ''}`);
    this.name = 'CoachHttpError';
  }
}

export class CoachOfflineError extends Error {
  constructor() {
    super('offline');
    this.name = 'CoachOfflineError';
  }
}

export async function postCoach(
  body: ChatRequest,
  onEvent: (ev: CoachStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new CoachOfflineError();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new CoachHttpError(401, 'missing_token', undefined);

  let res: Response;
  try {
    res = await fetch('/api/ai-coach/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') throw err;
    throw new CoachOfflineError();
  }

  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    const ra = Number(res.headers.get('Retry-After'));
    throw new CoachHttpError(res.status, data.error, Number.isFinite(ra) && ra > 0 ? ra : undefined);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parse = createSseParser();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    for (const ev of parse(decoder.decode(value, { stream: true }))) onEvent(ev);
  }
  for (const ev of parse(decoder.decode() + '\n\n')) onEvent(ev);
}
