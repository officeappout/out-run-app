import { describe, it, expect, vi } from 'vitest';

const col = vi.hoisted(() => ({ docs: [] as Array<{ id: string; name: unknown }> }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  query: (_c: unknown, w: { field: string; value: string }) => w,
  where: (field: string, _op: string, value: string) => ({ field, value }),
  getDocs: async (w: { field: string; value: string }) => ({
    docs: col.docs.filter((d) => (w.field === 'name' ? d.name === w.value : (d.name as { he?: string })?.he === w.value)),
  }),
}));

import { findRunWorkoutTemplatesByName } from '../running-template-lookup';
import { hebrewOrEmpty } from '@/features/content/shared/stored-text-fields';

describe('import idempotency by Hebrew name', () => {
  it('finds plain and {he,en} docs (a rerun after the English import does not duplicate)', async () => {
    col.docs = [{ id: 'a', name: 'ריצה ארוכה' }, { id: 'b', name: { he: 'סולם', en: 'Ladder' } }];
    expect((await findRunWorkoutTemplatesByName('ריצה ארוכה')).size).toBe(1);
    expect((await findRunWorkoutTemplatesByName('סולם')).docs[0].id).toBe('b');
    expect((await findRunWorkoutTemplatesByName('חדש')).size).toBe(0);
  });
  it('protected-name check works on an object name', () => {
    const PROTECTED = ['אימון פירמידה'];
    expect(PROTECTED.includes(hebrewOrEmpty({ he: 'אימון פירמידה', en: 'Pyramid' }))).toBe(true);
  });
});
