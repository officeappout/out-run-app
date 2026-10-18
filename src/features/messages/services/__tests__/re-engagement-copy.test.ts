import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_MESSAGES, messageMatchesGender } from '../MessageService';

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  doc: () => ({}),
  getDocs: async () => ({ docs: [] }),
  getDoc: async () => ({ exists: () => false }),
  addDoc: async () => ({ id: 'x' }),
  updateDoc: async () => undefined,
  deleteDoc: async () => undefined,
  query: () => ({}),
  where: () => ({}),
  orderBy: () => ({}),
  onSnapshot: () => () => undefined,
  serverTimestamp: () => null,
  Timestamp: { now: () => null },
}));


describe('re-engagement / missed-workout copy (calm return)', () => {
  const rows = [...DEFAULT_MESSAGES.re_engagement, ...DEFAULT_MESSAGES.missed_workout];

  it('no guilt, no counts, no slashes', () => {
    for (const r of rows) {
      const line = `${r.text} ${r.subText ?? ''}`;
      expect(line).not.toMatch(/איפה היית|איפה נעלמת|פספס|\d|\//);
    }
  });

  it('male and female variants instead of "מוכן/ה"', () => {
    const female = rows.filter((r) => r.targetGender === 'female');
    const male = rows.filter((r) => r.targetGender === 'male');
    expect(female.length).toBeGreaterThan(0);
    expect(female.length).toBe(male.length);
  });

  it('gender matching: neutral for all, unknown gender reads the male form', () => {
    expect(messageMatchesGender({}, 'female')).toBe(true);
    expect(messageMatchesGender({ targetGender: 'female' }, 'female')).toBe(true);
    expect(messageMatchesGender({ targetGender: 'female' }, 'male')).toBe(false);
    expect(messageMatchesGender({ targetGender: 'male' }, undefined)).toBe(true);
    expect(messageMatchesGender({ targetGender: 'female' }, 'other')).toBe(false);
  });
});
