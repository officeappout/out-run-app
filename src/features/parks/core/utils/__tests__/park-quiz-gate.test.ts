import { describe, expect, it } from 'vitest';
import { distinctEquipmentTypes, parkNeedsQuizFirst } from '../park-quiz-gate';

const park = (ids: Array<string | null>) => ({ gymEquipment: ids.map((equipmentId) => ({ equipmentId })) });

describe('park quiz gate (M12)', () => {
  it('counts distinct non-empty equipment ids; no list = unknown', () => {
    expect(distinctEquipmentTypes(park(['a', 'a', 'b', null, '']))).toBe(2);
    expect(distinctEquipmentTypes({})).toBeNull();
  });
  it('quiz first only below 3 types, unassessed, not asked yet', () => {
    expect(parkNeedsQuizFirst(park(['a', 'b']), false, false)).toBe(true);
    expect(parkNeedsQuizFirst(park([]), false, false)).toBe(true);
    expect(parkNeedsQuizFirst(park(['a', 'b', 'c']), false, false)).toBe(false);
    expect(parkNeedsQuizFirst(park(['a']), true, false)).toBe(false);
    expect(parkNeedsQuizFirst(park(['a']), false, true)).toBe(false);
    expect(parkNeedsQuizFirst({}, false, false)).toBe(false);
  });
});
