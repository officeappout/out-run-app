import { describe, expect, it } from 'vitest';
import { ringArcs } from '../segmented-ring';

describe('ringArcs', () => {
  it('splits the circle by value with a gap between segments', () => {
    const arcs = ringArcs(
      [
        { key: 'a', value: 75, color: '#000' },
        { key: 'b', value: 25, color: '#111' },
        { key: 'c', value: 0, color: '#222' },
      ],
      100,
      4,
    );
    expect(arcs).toEqual([
      { key: 'a', color: '#000', length: 71, offset: 2 },
      { key: 'b', color: '#111', length: 21, offset: 77 },
    ]);
  });

  it('one segment = a full ring without a gap; nothing → no arcs', () => {
    expect(ringArcs([{ key: 'a', value: 5, color: '#000' }], 100, 4)).toEqual([{ key: 'a', color: '#000', length: 100, offset: 0 }]);
    expect(ringArcs([], 100, 4)).toEqual([]);
  });
});
