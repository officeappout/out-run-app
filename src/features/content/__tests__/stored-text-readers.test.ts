import { describe, it, expect, vi } from 'vitest';

const fs = vi.hoisted(() => ({ list: [] as Array<{ id: string; data: Record<string, unknown> }>, written: null as unknown }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  doc: () => ({}),
  query: () => ({}),
  where: () => ({}),
  orderBy: () => ({}),
  getDocs: async () => ({ docs: fs.list.map((d) => ({ id: d.id, data: () => d.data })) }),
  getDoc: async () => ({ exists: () => true, id: fs.list[0]?.id, data: () => fs.list[0]?.data }),
  addDoc: async (_c: unknown, data: unknown) => { fs.written = data; return { id: 'new' }; },
  setDoc: async (_r: unknown, data: unknown) => { fs.written = data; },
  updateDoc: async (_r: unknown, data: unknown) => { fs.written = data; },
  deleteDoc: async () => undefined,
  onSnapshot: () => () => undefined,
  serverTimestamp: () => 'TS',
  Timestamp: class {},
}));

import { messageService } from '@/features/messages/services/MessageService';
import { getAllOutdoorBrands, getOutdoorBrand, createOutdoorBrand, updateOutdoorBrand } from '../equipment/brands/core/outdoor-brand.service';
import { normalizeLevelGoals, exerciseNameForWrite } from '../programs/core/level-goals-localized';
import { getAllProgramLevelSettings, saveProgramLevelSettings } from '../programs/core/programLevelSettings.service';
import { pickText } from '../shared/stored-text-fields';

describe('smart_messages', () => {
  it('getAllMessages / getMessageById: text + subText stay Hebrew strings, pair in *Localized', async () => {
    fs.list = [{ id: 'm1', data: { type: 'pr_record', text: { he: 'שיא חדש! 🏆', en: 'New record! 🏆' }, subText: { he: 'ככה בונים כוח', en: 'That is how strength is built' }, priority: 10, isActive: true } }];
    for (const m of [(await messageService.getAllMessages())[0], (await messageService.getMessageById('m1'))!]) {
      expect(m.text).toBe('שיא חדש! 🏆');
      expect(m.subText).toBe('ככה בונים כוח');
      expect(pickText(m, 'text', 'en')).toBe('New record! 🏆');
      expect(pickText(m, 'text', 'he')).toBe('שיא חדש! 🏆');
    }
  });
  it('getMessagesByType normalizes too', async () => {
    fs.list = [{ id: 'm1', data: { type: 'default', text: { he: 'יאללה', en: 'Go' }, priority: 5, isActive: true } }];
    const [m] = await messageService.getMessagesByType('default');
    expect(typeof m.text).toBe('string');
    expect(m.text).toBe('יאללה');
  });
  it('writes: Hebrew-only create is plain; English entered folds to {he,en}', async () => {
    await messageService.createMessage({ type: 'default', text: 'שלום', priority: 5, isActive: true });
    expect((fs.written as { text: unknown }).text).toBe('שלום');
    await messageService.createMessage({ type: 'default', text: 'שלום', textLocalized: { he: 'שלום', en: 'Hello' }, priority: 5, isActive: true });
    expect((fs.written as { text: unknown }).text).toEqual({ he: 'שלום', en: 'Hello' });
    expect('textLocalized' in (fs.written as object)).toBe(false);
  });
});

describe('outdoorBrands', () => {
  it('name / description are Hebrew strings (brand-name matching keeps working)', async () => {
    fs.list = [{ id: 'b1', data: { name: { he: 'לודוס', en: 'Ludos' }, description: { he: 'יצרן', en: 'Maker' }, logoUrl: '' } }];
    for (const b of [(await getAllOutdoorBrands())[0], (await getOutdoorBrand('b1'))!]) {
      expect(b.name).toBe('לודוס');
      expect(b.nameLocalized?.en).toBe('Ludos');
      expect(b.description).toBe('יצרן');
      expect(b.name.toLowerCase().includes('לוד')).toBe(true);
    }
  });
  it('writes fold only when English exists', async () => {
    await createOutdoorBrand({ name: 'Saly' } as never);
    expect((fs.written as { name: unknown }).name).toBe('Saly');
    await updateOutdoorBrand('b1', { name: 'לודוס', nameLocalized: { he: 'לודוס', en: 'Ludos' } } as never);
    expect((fs.written as { name: unknown }).name).toEqual({ he: 'לודוס', en: 'Ludos' });
  });
});

describe('programLevelSettings targetGoals[].exerciseName', () => {
  const goal = { exerciseId: 'e1', exerciseName: { he: 'שכיבות סמיכה ב-60°', en: 'Incline Push-Up (60°)' }, targetValue: 10, unit: 'reps' };
  it('normalizeLevelGoals: Hebrew string in exerciseName, pair in exerciseNameLocalized; plain docs untouched', () => {
    const out = normalizeLevelGoals({ targetGoals: [goal, { ...goal, exerciseId: 'e2', exerciseName: 'פלאנק' }] }) as { targetGoals: Array<Record<string, unknown>> };
    expect(out.targetGoals[0].exerciseName).toBe('שכיבות סמיכה ב-60°');
    expect((out.targetGoals[0].exerciseNameLocalized as { en: string }).en).toBe('Incline Push-Up (60°)');
    expect(out.targetGoals[1].exerciseName).toBe('פלאנק');
    const plain = { targetGoals: [{ exerciseId: 'x', exerciseName: 'פלאנק' }] };
    expect(normalizeLevelGoals(plain)).toBe(plain);
  });
  it('service read path normalizes the goals', async () => {
    fs.list = [{ id: 'p_level_1', data: { programId: 'p', levelNumber: 1, levelDescription: 'ר', targetGoals: [goal] } }];
    const [s] = await getAllProgramLevelSettings();
    expect(s.targetGoals?.[0].exerciseName).toBe('שכיבות סמיכה ב-60°');
  });
  it('a plain re-save keeps English the doc already has when the Hebrew name is unchanged', async () => {
    fs.list = [{ id: 'p_level_1', data: { programId: 'p', levelNumber: 1, targetGoals: [goal] } }];
    await saveProgramLevelSettings({ programId: 'p', levelNumber: 1, levelDescription: 'ר', targetGoals: [{ exerciseId: 'e1', exerciseName: 'שכיבות סמיכה ב-60°', targetValue: 12, unit: 'reps' }] } as never);
    const saved = (fs.written as { targetGoals: Array<{ exerciseName: unknown; targetValue: number }> }).targetGoals[0];
    expect(saved.exerciseName).toEqual({ he: 'שכיבות סמיכה ב-60°', en: 'Incline Push-Up (60°)' });
    expect(saved.targetValue).toBe(12);
    expect(exerciseNameForWrite({ exerciseId: 'e1', exerciseName: 'שם חדש' }, [goal])).toBe('שם חדש');
    expect(exerciseNameForWrite({ exerciseId: 'e9', exerciseName: 'פלאנק' }, [])).toBe('פלאנק');
  });
});
