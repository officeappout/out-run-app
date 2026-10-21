import { describe, expect, it } from 'vitest';
import { bigParksOf, measureParks, netAreaM2, outerPerimeterM } from '../measure-parks';
import { area, square } from './geo-fixtures';

describe('measureParks', () => {
  it('net area subtracts holes; perimeter is the outer ring', () => {
    const g = { type: 'Polygon' as const, coordinates: [square(0, 0, 100), square(25, 25, 50)] };
    expect(netAreaM2(g)).toBeCloseTo(7500, -2);
    expect(outerPerimeterM(g)).toBeCloseTo(400, -1);
  });

  it('big park = named park ≥ 80,000 m² (RC3 Q7), merged by name first', () => {
    const halves = [
      area('way/1', { leisure: 'park', name: 'הירקון' }, square(0, 0, 200)), // 40,000 m²
      area('way/2', { leisure: 'park', name: 'הירקון' }, square(210, 0, 200)), // 10 m away, same name
    ];
    expect(bigParksOf(halves)).toHaveLength(1);
    const t = measureParks(halves);
    expect(t).toMatchObject({ parks: 2, bigParks: 1, lapLoops: 0 });
    expect(t.bigParksAreaM2).toBeCloseTo(80_000, -3);
  });

  it('unnamed large park is a lap loop, not a big park; small ones are neither', () => {
    const t = measureParks([
      area('way/3', { leisure: 'park' }, square(0, 0, 400)), // unnamed
      area('way/4', { leisure: 'garden' }, square(1000, 0, 100)), // perimeter 400 < 500
      area('way/5', { leisure: 'garden', 'garden:type': 'residential' }, square(2000, 0, 300)), // private
    ]);
    expect(t).toMatchObject({ parks: 2, bigParks: 0, lapLoops: 1 });
  });
});
