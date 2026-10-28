import { describe, it, expect, vi, beforeEach } from 'vitest';

const addDocMock = vi.fn();
const getDocMock = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ name })),
  doc: vi.fn((_db: unknown, name: string, id: string) => ({ name, id })),
  getDoc: (...a: unknown[]) => getDocMock(...a),
  getDocs: vi.fn(),
  addDoc: (...a: unknown[]) => addDocMock(...a),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  serverTimestamp: () => 'TS',
  writeBatch: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  Timestamp: class {},
}));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/features/admin/services/audit.service', () => ({ logAction: vi.fn() }));
vi.mock('../exercise-collection.reads', () => ({
  readAllExercisesOrdered: vi.fn(),
  readAllExercisesUnordered: vi.fn(),
}));
vi.mock('@/features/workout-engine/shared/utils/gear-mapping.utils', () => ({ registerGearAlias: vi.fn() }));

import { duplicateExercise } from '../exercise.service';
import { duplicateGearDefinition } from '../../../equipment/gear/core/gear-definition.service';

function snap(id: string, data: Record<string, unknown>) {
  return { exists: () => true, id, data: () => data };
}

beforeEach(() => {
  addDocMock.mockReset().mockResolvedValue({ id: 'new' });
  getDocMock.mockReset();
});

describe('duplicate keeps English empty (no Hebrew or "Copy of" pollution)', () => {
  it('exercise: he keeps the (עותק) suffix, en is empty', async () => {
    getDocMock.mockResolvedValue(snap('e1', { name: { he: 'משיכות', en: 'Pull-ups' }, type: 'reps', equipment: [], programIds: [] }));
    await duplicateExercise('e1');
    const saved = addDocMock.mock.calls[0][1];
    expect(saved.name.he).toBe('משיכות (עותק)');
    expect(saved.name.en).toBe('');
  });

  it('exercise: a Hebrew-only original also yields empty en', async () => {
    getDocMock.mockResolvedValue(snap('e2', { name: { he: 'שכיבות סמיכה' }, type: 'reps', equipment: [], programIds: [] }));
    await duplicateExercise('e2');
    expect(addDocMock.mock.calls[0][1].name.en).toBe('');
  });

  it('gear: he keeps "עותק של", en is empty even when the original has en', async () => {
    getDocMock.mockResolvedValue(snap('g1', { name: { he: 'גומיית התנגדות', en: 'Resistance band' }, category: 'x', icon: 'i' }));
    await duplicateGearDefinition('g1');
    const saved = addDocMock.mock.calls[0][1];
    expect(saved.name.he).toBe('עותק של גומיית התנגדות');
    expect(saved.name.en).toBe('');
  });
});
