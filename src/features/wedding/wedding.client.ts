'use client';

import { adminFetch } from '@/lib/admin-fetch';
import type { WeddingDocument, WeddingState } from './wedding.types';

/** How the page reaches the data: the admin session, or the share-link token. */
export type WeddingAccess = { mode: 'admin' } | { mode: 'share'; token: string };

export class WeddingAccessError extends Error {}
export class WeddingConflictError extends Error {
  constructor(public readonly latest: WeddingDocument) {
    super('conflict');
  }
}

function request(access: WeddingAccess, init: RequestInit = {}): Promise<Response> {
  if (access.mode === 'admin') return adminFetch('/api/admin/wedding', init);
  return fetch('/api/public/wedding', {
    ...init,
    cache: 'no-store',
    headers: { ...(init.headers as Record<string, string> | undefined), 'x-wedding-token': access.token },
  });
}

export async function loadWedding(access: WeddingAccess): Promise<WeddingDocument> {
  const res = await request(access);
  if (res.status === 403 || res.status === 404) throw new WeddingAccessError('forbidden');
  if (!res.ok) throw new Error(`טעינה נכשלה (${res.status})`);
  return (await res.json()) as WeddingDocument;
}

export async function saveWedding(access: WeddingAccess, state: WeddingState, rev: number): Promise<WeddingDocument> {
  const res = await request(access, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, rev }),
  });
  if (res.status === 409) {
    const body = (await res.json()) as WeddingDocument;
    throw new WeddingConflictError({ state: body.state, rev: body.rev });
  }
  if (res.status === 403 || res.status === 404) throw new WeddingAccessError('forbidden');
  if (!res.ok) throw new Error(`שמירה נכשלה (${res.status})`);
  return (await res.json()) as WeddingDocument;
}
