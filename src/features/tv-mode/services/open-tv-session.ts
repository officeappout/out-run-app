export interface OpenedTvSession {
  code: string;
  expiresAtMs: number;
}

/** Asks the server for a fresh pairing code (POST /api/tv/session). Throws on any failure. */
export async function openTvSession(fetchImpl: typeof fetch = fetch): Promise<OpenedTvSession> {
  const res = await fetchImpl('/api/tv/session', { method: 'POST', cache: 'no-store' });
  if (!res.ok) throw new Error(`tv-session-${res.status}`);
  const body = (await res.json()) as Partial<OpenedTvSession>;
  if (typeof body.code !== 'string' || typeof body.expiresAtMs !== 'number') throw new Error('tv-session-shape');
  return { code: body.code, expiresAtMs: body.expiresAtMs };
}
