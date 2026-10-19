import { describe, expect, it } from 'vitest';
import { ContentInputSchema, contentItemFromDoc, toPublicItem } from '../schema';

describe('contentItemFromDoc (field guards)', () => {
  it('reads a help doc, never trusting fields', () => {
    const i = contentItemFromDoc('help-x', { type: 'help', q: 'שאלה', a: ['ת', 3], status: 'published', updatedAt: { toMillis: () => 42 }, updatedBy: 'seed-content-items', seedHash: 'h' });
    expect(i).toMatchObject({ id: 'help-x', slug: 'help-x', type: 'help', q: 'שאלה', a: ['ת'], tags: [], status: 'published', audience: 'users', locale: 'he', updatedAt: 42, seedHash: 'h' });
  });
  it('unknown status → draft; unknown type → null; bad article body → []', () => {
    expect(contentItemFromDoc('a', { type: 'faq', status: 'live' })?.status).toBe('draft');
    expect(contentItemFromDoc('a', { type: 'blog' })).toBeNull();
    expect(contentItemFromDoc('a', undefined)).toBeNull();
    const art = contentItemFromDoc('a', { type: 'article', body: [{ type: 'video' }], category: 'yoga', cover: {} });
    expect(art).toMatchObject({ body: [], category: 'strength', cover: { illustration: 'nutrition' } });
  });
  it('toPublicItem drops the editor bookkeeping', () => {
    const i = contentItemFromDoc('f', { type: 'faq', q: 'q', a: ['a'], updatedBy: 'uid', seedHash: 'h', status: 'published' })!;
    const pub = toPublicItem(i) as Record<string, unknown>;
    expect(pub.updatedBy).toBeUndefined();
    expect(pub.seedHash).toBeUndefined();
    expect(pub.q).toBe('q');
  });
});

describe('ContentInputSchema', () => {
  const qa = { type: 'faq', slug: 'x', locale: 'he', audience: 'users', topic: 'users', tags: [], status: 'draft', order: 0, q: 'שאלה?', a: ['תשובה'] };
  it('accepts a Q&A and rejects unknown fields / empty answers / bad slugs', () => {
    expect(ContentInputSchema.safeParse(qa).success).toBe(true);
    expect(ContentInputSchema.safeParse({ ...qa, a: [] }).success).toBe(false);
    expect(ContentInputSchema.safeParse({ ...qa, slug: 'Has Space' }).success).toBe(false);
    expect(ContentInputSchema.safeParse({ ...qa, isAdmin: true }).success).toBe(false);
  });
});
