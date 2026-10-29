import { describe, it, expect, vi } from 'vitest';

const docs = vi.hoisted(() => ({ list: [] as Array<{ id: string; data: Record<string, unknown> }>, written: null as unknown }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null } }));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  doc: () => ({ id: 'new' }),
  getDocs: async () => ({ docs: docs.list.map((d) => ({ id: d.id, data: () => d.data })) }),
  getDoc: async () => ({ exists: () => true, id: docs.list[0]?.id, data: () => docs.list[0]?.data }),
  setDoc: async (_r: unknown, data: unknown) => { docs.written = data; },
  updateDoc: async (_r: unknown, data: unknown) => { docs.written = data; },
  deleteDoc: async () => undefined,
  serverTimestamp: () => 'TS',
}));

import {
  createRunWorkoutTemplate,
  getRunProgramTemplate,
  getRunProgramTemplates,
  getRunWorkoutTemplate,
  getRunWorkoutTemplates,
  updateRunWorkoutTemplate,
} from '../running-admin.service';

const tplDoc = {
  name: { he: 'סולם יורד', en: 'Descending ladder' },
  description: { he: 'תיאור', en: 'Description' },
  isQualityWorkout: true,
  targetProfileTypes: [1],
  category: 'long_intervals',
  blocks: [
    { id: 'b1', label: { he: 'חימום', en: 'Warm-up' }, restLabel: { he: 'הליכה', en: 'Walk' }, sets: 2 },
    { id: 'b2', label: 'ריצה', sets: 1 },
  ],
};

describe('running templates: object-shaped docs reach the engines as Hebrew strings', () => {
  it('getRunWorkoutTemplates / getRunWorkoutTemplate', async () => {
    docs.list = [{ id: 't1', data: tplDoc }];
    for (const t of [(await getRunWorkoutTemplates())[0], (await getRunWorkoutTemplate('t1'))!]) {
      expect(t.name).toBe('סולם יורד');
      expect(t.nameLocalized?.en).toBe('Descending ladder');
      expect((t as { description?: string }).description).toBe('תיאור');
      expect(t.blocks[0].label).toBe('חימום');
      expect(t.blocks[0].labelLocalized?.en).toBe('Warm-up');
      expect(t.blocks[0].restLabel).toBe('הליכה');
      expect(t.blocks[1].label).toBe('ריצה');
      expect('labelLocalized' in t.blocks[1]).toBe(false);
      // the engines' Hebrew matching keeps working
      expect(t.blocks[0].label.toLowerCase().includes('חימ')).toBe(true);
      expect(JSON.stringify([t.name, t.blocks.map((b) => b.label)])).not.toContain('"{');
    }
  });
  it('a plain doc is unchanged', async () => {
    const plain = { name: 'ריצה קלה', blocks: [{ id: 'b', label: 'קל', sets: 1 }], isQualityWorkout: false, targetProfileTypes: [1] };
    docs.list = [{ id: 'p', data: plain }];
    expect(await getRunWorkoutTemplate('p')).toEqual({ id: 'p', ...plain });
  });
  it('program templates: name and volumeCaps[].description', async () => {
    docs.list = [{ id: 'g', data: { name: { he: '0-3 ק״מ', en: '0-3 km' }, volumeCaps: [{ type: 'cap', description: { he: 'מגבלה', en: 'Cap' } }] } }];
    for (const p of [(await getRunProgramTemplates())[0], (await getRunProgramTemplate('g'))!]) {
      expect(p.name).toBe('0-3 ק״מ');
      expect(p.volumeCaps?.[0].description).toBe('מגבלה');
      expect(p.volumeCaps?.[0].descriptionLocalized?.en).toBe('Cap');
    }
  });
  it('writes: English entered -> {he,en}; Hebrew-only -> plain, identical', async () => {
    await createRunWorkoutTemplate({ name: 'אימון', blocks: [{ id: 'b', label: 'קל', sets: 1 }] } as never);
    expect(docs.written).toMatchObject({ name: 'אימון', blocks: [{ label: 'קל' }] });
    await updateRunWorkoutTemplate('t1', {
      name: 'סולם',
      nameLocalized: { he: 'סולם', en: 'Ladder' },
      blocks: [{ id: 'b', label: 'חימום', labelLocalized: { he: 'חימום', en: 'Warm-up' }, sets: 1 }],
    } as never);
    expect(docs.written).toMatchObject({ name: { he: 'סולם', en: 'Ladder' }, blocks: [{ label: { he: 'חימום', en: 'Warm-up' } }] });
    await updateRunWorkoutTemplate('t1', { name: 'סולם', nameLocalized: { he: 'סולם', en: '' } } as never);
    expect((docs.written as { name: unknown }).name).toBe('סולם');
  });
});
