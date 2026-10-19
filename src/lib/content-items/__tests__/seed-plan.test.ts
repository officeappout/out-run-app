import { describe, expect, it } from 'vitest';
import { ContentInputSchema } from '../schema';
import { articlesToSeedDocs, faqId, faqToSeedDocs, helpToSeedDocs, planSeed, stableHash, type ExistingMarker, type SeedDoc } from '../seed-plan';
import { SEED_ACTOR } from '../types';

const FAQ = {
  he: [
    { id: 'users' as const, label: 'מתאמנים', items: [{ q: 'מה זה OUT?', a: ['אפליקציה.'] }, { q: 'כמה  זה עולה? ', a: ['חינם.', 'ויש פרימיום.'] }] },
    { id: 'authorities' as const, label: 'רשויות', items: [{ q: 'איך מצטרפים?', a: ['פונים אלינו.'] }] },
  ],
  en: [{ id: 'users' as const, label: 'Trainees', items: [{ q: 'What is OUT?', a: ['An app.'] }] }],
};
const ARTICLES = [
  { slug: 'start-calisthenics', category: 'strength' as const, title: 'איך מתחילים', excerpt: 'בלי ציוד', cover: { video: 'eec52034-bab9-4d69-8ab7-de179e4314cf' }, readMin: 4, date: '2026-10-14', author: 'צוות OUT', body: [{ type: 'p' as const, text: 'טקסט' }, { type: 'exercises' as const, ids: ['0AoeD3sBQjqWvchrHPYp'] }] },
  { slug: 'first-pull-up', category: 'strength' as const, title: 'המתח הראשון', excerpt: '...', cover: { illustration: 'map' as const }, readMin: 5, date: '2026-10-15', author: 'צוות OUT', draft: true, body: [{ type: 'tip' as const, text: 'טיפ' }] },
];
const HELP = [{ id: 'schedule', title: 'איך מזיזים אימון?', keywords: ['לו״ז', 'להזיז'], answer: 'בלו״ז.\n\nאו בהגדרות.' }];

const strip = ({ id, seedHash, ...input }: SeedDoc) => (void id, void seedHash, input);

describe('seed mapping', () => {
  it('FAQ → stable ids per audience + locale, normalized question, order kept', () => {
    const docs = faqToSeedDocs(FAQ);
    expect(docs).toHaveLength(4);
    expect(docs[1]).toMatchObject({ id: faqId('users', 'he', 'כמה זה עולה?'), type: 'faq', audience: 'users', locale: 'he', q: 'כמה זה עולה?', a: ['חינם.', 'ויש פרימיום.'], order: 1, status: 'published' });
    expect(docs[2]).toMatchObject({ audience: 'authorities', topic: 'authorities' });
    expect(docs[3]).toMatchObject({ locale: 'en' });
    // same input → same ids + hashes (idempotent)
    expect(faqToSeedDocs(FAQ).map((d) => [d.id, d.seedHash])).toEqual(docs.map((d) => [d.id, d.seedHash]));
  });
  it('articles keep the draft flags and blocks', () => {
    const docs = articlesToSeedDocs(ARTICLES);
    expect(docs.map((d) => [d.id, d.status])).toEqual([['article-start-calisthenics-he', 'published'], ['article-first-pull-up-he', 'draft']]);
    expect(docs[0]).toMatchObject({ topic: 'strength', cover: { video: 'eec52034-bab9-4d69-8ab7-de179e4314cf' } });
  });
  it('help entries → help-<id>, paragraphs split, tags = keywords', () => {
    const [d] = helpToSeedDocs(HELP, () => 'schedule');
    expect(d).toMatchObject({ id: 'help-schedule', slug: 'schedule', type: 'help', topic: 'schedule', tags: ['לו״ז', 'להזיז'], a: ['בלו״ז.', 'או בהגדרות.'] });
  });
  it('every seed doc passes the editor schema', () => {
    for (const d of [...faqToSeedDocs(FAQ), ...articlesToSeedDocs(ARTICLES), ...helpToSeedDocs(HELP, () => 'x')]) {
      expect(ContentInputSchema.safeParse(strip(d)).success, d.id).toBe(true);
    }
  });
  it('stableHash is deterministic and short', () => {
    expect(stableHash('abc')).toBe(stableHash('abc'));
    expect(stableHash('abc')).not.toBe(stableHash('abd'));
    expect(stableHash('x'.repeat(5000)).length).toBeLessThanOrEqual(7);
  });
});

describe('planSeed — idempotent, never overwrites an admin edit', () => {
  const docs = [...faqToSeedDocs(FAQ), ...articlesToSeedDocs(ARTICLES)];
  it('empty collection → create everything', () => {
    const p = planSeed(docs, new Map());
    expect(p.create).toHaveLength(docs.length);
    expect(p.update.length + p.unchanged.length + p.skippedEdited.length).toBe(0);
  });
  it('second run with the same source → nothing to write', () => {
    const existing = new Map(docs.map((d) => [d.id, { updatedBy: SEED_ACTOR, seedHash: d.seedHash }]));
    const p = planSeed(docs, existing);
    expect(p.unchanged).toHaveLength(docs.length);
    expect(p.create.length + p.update.length).toBe(0);
  });
  it('source text changed on a seed-owned item → update; edited in admin → skipped', () => {
    const existing = new Map<string, ExistingMarker>(docs.map((d) => [d.id, { updatedBy: SEED_ACTOR, seedHash: d.seedHash }]));
    existing.set(docs[0].id, { updatedBy: SEED_ACTOR, seedHash: 'old' });
    existing.set(docs[1].id, { updatedBy: 'admin_uid_123', seedHash: 'old' });
    existing.set(docs[2].id, { updatedBy: 'admin_uid_123' });
    const p = planSeed(docs, existing);
    expect(p.update.map((d) => d.id)).toEqual([docs[0].id]);
    expect(p.skippedEdited).toEqual([docs[1].id, docs[2].id]);
  });
  it('a duplicate question in the source is written once', () => {
    const dup = faqToSeedDocs({ he: [{ id: 'users', label: '', items: [{ q: 'א?', a: ['1'] }, { q: 'א?', a: ['2'] }] }] });
    expect(planSeed(dup, new Map()).create).toHaveLength(1);
  });
});
