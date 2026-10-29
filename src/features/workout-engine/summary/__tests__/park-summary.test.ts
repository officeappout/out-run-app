import { describe, it, expect } from 'vitest';
import { isWalkSession, relabelWalkRing, weekRingView } from '../park-summary';

const seg = (kind: 'aerobic' | 'strength', aerobicType?: 'walking' | 'running') =>
  ({ index: 0, kind, ...(aerobicType ? { aerobicType } : {}) }) as never;

describe('park summary (N1, N2)', () => {
  it('a walk session = every aerobic part walked', () => {
    expect(isWalkSession([seg('aerobic', 'walking'), seg('strength'), seg('aerobic', 'walking')])).toBe(true);
    expect(isWalkSession([seg('aerobic', 'walking'), seg('aerobic', 'running')])).toBe(false);
    expect(isWalkSession([seg('strength')])).toBe(false);
  });

  it('relabels only the distance ring of a walk', () => {
    const rings = [
      { key: 'distance', value: '1.9', label: 'ריצה', pct: 100, color: '#84cc16' },
      { key: 'sets', value: '8', label: 'כוח', pct: 100, color: '#00baf7' },
    ];
    expect(relabelWalkRing(rings, true, 'הליכה').map((r) => r.label)).toEqual(['הליכה', 'כוח']);
    expect(relabelWalkRing(rings, false, 'הליכה')).toBe(rings);
  });

  it('week ring: at least this workout, capped at the goal', () => {
    const v = weekRingView({ cardio: 0, strength: 0 }, { aerobicSec: 22 * 60, strengthSec: 8 * 60 }, 150);
    expect(v).toMatchObject({ aerobicMin: 22, strengthMin: 8, totalMin: 30, goalMin: 150 });
    expect(v.aerobicFrac).toBeCloseTo(22 / 150);
    const full = weekRingView({ cardio: 140, strength: 40 }, { aerobicSec: 0, strengthSec: 0 }, 150);
    expect(full.aerobicFrac + full.strengthFrac).toBeLessThanOrEqual(1);
    expect(weekRingView(null, { aerobicSec: 0, strengthSec: 0 }, 0).goalMin).toBe(150);
  });
});
