import { describe, it, expect, vi } from 'vitest';

const docs = vi.hoisted(() => ({ list: [] as Array<{ id: string; data: Record<string, unknown> }> }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/persistentTtlCache', () => ({ createPersistentTtlCache: () => ({}) }));
vi.mock('@/lib/idbRecordStore', () => ({ createIdbRecordStore: () => ({}) }));
vi.mock('@/lib/fast-startup/flag', () => ({ isFastStartupOn: () => false }));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  doc: () => ({}),
  query: () => ({}),
  orderBy: () => ({}),
  where: () => ({}),
  getDocs: async () => ({ docs: docs.list.map((d) => ({ id: d.id, data: () => d.data })) }),
  getDoc: async () => ({ exists: () => true, id: docs.list[0]?.id, data: () => docs.list[0]?.data }),
  addDoc: async (_c: unknown, data: unknown) => {
    (globalThis as { __written?: unknown }).__written = data;
    return { id: 'new' };
  },
  updateDoc: async (_r: unknown, data: unknown) => {
    (globalThis as { __written?: unknown }).__written = data;
  },
  deleteDoc: async () => undefined,
  serverTimestamp: () => 'TS',
  Timestamp: class {},
}));

import { getAllGymEquipment, getGymEquipment, createGymEquipment, updateGymEquipment } from '../gym-equipment.service';
import { buildEquipmentLocalizedFields, buildEquipmentMethodText, resolveEquipmentCues, resolveEquipmentPrepNote, resolveEquipmentTips } from '../gym-equipment-text.utils';
import { localizeGymEquipment } from '../gym-equipment-localized';
import { classifyGear } from '@/lib/ai/coach/round4/parks-rank';

const objectDoc = {
  name: { he: 'מכונת חתירה', en: 'Rowing machine' },
  description: { he: 'שורה א\nשורה ב', en: 'Line a\nLine b' },
  prepNote: { he: 'כוונו מושב', en: 'Adjust the seat' },
  cues: [{ he: 'גב ישר', en: 'Straight back' }, 'משוך לחזה'],
  tips: [{ he: 'קשה? קצרו טווח', en: 'Too hard? Shorten the range' }],
  type: 'reps',
  brands: [],
  muscleGroups: [],
};

describe('gym_equipment service: object-shaped docs never leak objects', () => {
  it('getAllGymEquipment / getGymEquipment give Hebrew strings + *Localized pairs', async () => {
    docs.list = [{ id: 'g1', data: objectDoc }];
    for (const eq of [(await getAllGymEquipment())[0], (await getGymEquipment('g1'))!]) {
      expect(eq.name).toBe('מכונת חתירה');
      expect(eq.description).toBe('שורה א\nשורה ב');
      expect(eq.prepNote).toBe('כוונו מושב');
      expect(eq.cues).toEqual(['גב ישר', 'משוך לחזה']);
      expect(eq.tips).toEqual(['קשה? קצרו טווח']);
      expect(eq.nameLocalized?.en).toBe('Rowing machine');
      expect(eq.cuesLocalized?.[0].en).toBe('Straight back');
      expect(`${eq.name}${eq.prepNote}${eq.cues!.join()}`).not.toContain('[object Object]');
    }
  });
  it('a plain-Hebrew doc is returned exactly as before (no *Localized keys)', async () => {
    docs.list = [{ id: 'g2', data: { name: 'מתח', cues: ['א'], type: 'reps', brands: [], muscleGroups: [] } }];
    const eq = (await getAllGymEquipment())[0] as unknown as Record<string, unknown>;
    expect(Object.keys(eq).filter((k) => k.endsWith('Localized'))).toEqual([]);
    expect(eq.name).toBe('מתח');
  });
  it('text utils tolerate a raw {he,en} item', () => {
    expect(resolveEquipmentTips({ tips: [{ he: 'טיפ', en: 't' }] as never })).toEqual(['טיפ']);
    expect(resolveEquipmentPrepNote({ prepNote: { he: 'הכנה', en: 'p' } as never })).toBe('הכנה');
    expect(resolveEquipmentCues({ cues: [{ he: 'דגש', en: 'cue' }] as never }).cues).toEqual(['דגש']);
  });
  it('Kelly parks classifier reads the Hebrew of an object name', () => {
    expect(classifyGear({ name: { he: 'מתח ומקבילים', en: 'Pull-up' }, iconKey: '' })).toBe('pullup');
    expect(classifyGear({ name: 'מתח', iconKey: '' })).toBe('pullup');
  });
});

describe('English display + method text', () => {
  it('localizeGymEquipment: he returns the SAME object; en swaps per item with Hebrew fallback', async () => {
    docs.list = [{ id: 'g1', data: objectDoc }];
    const eq = (await getAllGymEquipment())[0];
    expect(localizeGymEquipment(eq, 'he')).toBe(eq);
    const en = localizeGymEquipment(eq, 'en');
    expect(en.name).toBe('Rowing machine');
    expect(en.cues).toEqual(['Straight back', 'משוך לחזה']);
    expect(en.prepNote).toBe('Adjust the seat');
  });
  it('buildEquipmentMethodText: Hebrew slot unchanged, English rides in en', async () => {
    docs.list = [{ id: 'g1', data: objectDoc }];
    const eq = (await getAllGymEquipment())[0];
    const m = buildEquipmentMethodText(eq);
    expect(m.specificCues).toEqual([{ he: 'גב ישר', en: 'Straight back' }, { he: 'משוך לחזה', en: '' }]);
    expect(m.highlights).toEqual([{ he: 'קשה? קצרו טווח', en: 'Too hard? Shorten the range' }]);
    expect(m.notificationText).toBe('כוונו מושב');
  });
});

describe('admin write', () => {
  const w = () => (globalThis as { __written?: Record<string, unknown> }).__written!;
  const base = { type: 'reps', recommendedLevel: 1, isFunctional: false, muscleGroups: [], brands: [] } as never;
  it('Hebrew-only save is byte-identical (plain strings, no localized keys)', async () => {
    await createGymEquipment({ ...(base as object), name: 'מתח', cues: ['א'] } as never);
    expect(w().name).toBe('מתח');
    expect(w().cues).toEqual(['א']);
    expect(Object.keys(w()).some((k) => k.endsWith('Localized'))).toBe(false);
  });
  it('English entered writes {he,en}; list items per item', async () => {
    await updateGymEquipment('g1', {
      name: 'מתח',
      nameLocalized: { he: 'מתח', en: 'Pull-up' },
      cues: ['א', 'ב'],
      cuesLocalized: [{ he: 'א', en: '' }, { he: 'ב', en: 'b' }],
    } as never);
    expect(w().name).toEqual({ he: 'מתח', en: 'Pull-up' });
    expect(w().cues).toEqual(['א', { he: 'ב', en: 'b' }]);
    expect('nameLocalized' in w()).toBe(false);
  });
  it('editor mapping: emits keys only when English exists or the doc had it', () => {
    expect(buildEquipmentLocalizedFields({ name: 'מתח', cues: ['א'], cuesEn: [''] })).toEqual({});
    expect(buildEquipmentLocalizedFields({ name: 'מתח', nameEn: 'Pull-up', cues: ['א', '', 'ג'], cuesEn: ['a', 'x', 'c'] })).toEqual({
      nameLocalized: { he: 'מתח', en: 'Pull-up' },
      cuesLocalized: [{ he: 'א', en: 'a' }, { he: 'ג', en: 'c' }],
    });
    // English removed from a doc that had it -> key kept with empty en so the write folds back to plain Hebrew
    expect(buildEquipmentLocalizedFields({ name: 'מתח', nameEn: '' }, { nameLocalized: { he: 'מתח', en: 'Pull-up' } })).toEqual({
      nameLocalized: { he: 'מתח', en: '' },
    });
  });
});
