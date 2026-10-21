/**
 * Post-workout praise (owner decisions 6 + 9, 21.10.2026): personal praise stays gendered
 * ("אלוף!" / "אלופה!"), no "חיה" / "מפלצת", and a user of unknown gender sees neutral rows only.
 */
import { describe, it, expect, vi } from 'vitest';

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

import { DEFAULT_MESSAGES, messageMatchesGender } from '../MessageService';

const line = (r: { text: string; subText?: string }) => `${r.text} ${r.subText ?? ''}`.trim();
const seen = (gender: 'male' | 'female' | 'other') =>
  DEFAULT_MESSAGES.post_workout.filter((r) => messageMatchesGender(r, gender)).map(line);

describe('post-workout praise', () => {
  it('no "חיה" / "מפלצת" anywhere in the default copy', () => {
    for (const rows of Object.values(DEFAULT_MESSAGES)) {
      for (const r of rows) expect(line(r)).not.toMatch(/חיה|מפלצת/);
    }
  });

  it('what each gender sees', () => {
    expect(seen('male')).toEqual([
      'כל הכבוד! סיימת את האימון בהצלחה',
      'מדהים! עוד אימון בכיס',
      'איזה אימון! המשך כך',
      'סיימת! הגוף שלך מודה לך',
      'אלוף! עוד צעד קדימה',
    ]);
    expect(seen('female')).toEqual([
      'כל הכבוד! סיימת את האימון בהצלחה',
      'מדהים! עוד אימון בכיס',
      'איזה אימון! המשיכי כך',
      'סיימת! הגוף שלך מודה לך',
      'אלופה! עוד צעד קדימה',
    ]);
    expect(seen('other')).toEqual([
      'כל הכבוד! סיימת את האימון בהצלחה',
      'מדהים! עוד אימון בכיס',
      'סיימת! הגוף שלך מודה לך',
    ]);
  });

  it('every gendered row has its partner', () => {
    const rows = DEFAULT_MESSAGES.post_workout;
    expect(rows.filter((r) => r.targetGender === 'male').length).toBe(rows.filter((r) => r.targetGender === 'female').length);
  });
});
