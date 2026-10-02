'use client';

import type { WeddingDocument, WeddingState } from './wedding.types';

const URL = '/api/public/wedding';

export class WeddingAccessError extends Error {}
export class WeddingConflictError extends Error {
  constructor(public readonly latest: WeddingDocument) {
    super('conflict');
  }
}

export async function loadWedding(): Promise<WeddingDocument> {
  const res = await fetch(URL, { cache: 'no-store' });
  if (res.status === 403 || res.status === 404) throw new WeddingAccessError('forbidden');
  if (!res.ok) throw new Error(`טעינה נכשלה (${res.status})`);
  return (await res.json()) as WeddingDocument;
}

export async function saveWedding(state: WeddingState, rev: number): Promise<WeddingDocument> {
  const res = await fetch(URL, {
    method: 'PUT',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, rev }),
  });
  if (res.status === 409) {
    const body = (await res.json()) as WeddingDocument;
    throw new WeddingConflictError({ state: body.state, rev: body.rev });
  }
  if (!res.ok) throw new Error(`שמירה נכשלה (${res.status})`);
  return (await res.json()) as WeddingDocument;
}
