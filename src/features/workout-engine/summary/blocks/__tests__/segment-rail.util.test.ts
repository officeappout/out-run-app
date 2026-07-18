import { describe, it, expect } from 'vitest';
import {
  SEGMENT_RAIL_COLORS,
  railColor,
  railTypeFromKind,
  segmentLabel,
} from '../segment-rail.util';

describe('segment-rail util', () => {
  it('colours by type (spec v0.9 §2: turquoise aerobic / amber strength / brown stairs)', () => {
    expect(railColor('aerobic')).toBe('#1D9E75');
    expect(railColor('strength')).toBe('#E0A33E');
    expect(railColor('stairs')).toBe('#8B5E3C');
    expect(Object.keys(SEGMENT_RAIL_COLORS).sort()).toEqual(['aerobic', 'stairs', 'strength']);
  });

  it('maps a stored segment kind → rail type', () => {
    expect(railTypeFromKind('aerobic')).toBe('aerobic');
    expect(railTypeFromKind('strength')).toBe('strength');
  });

  it('labels segments in Hebrew; walking stays distinct from running', () => {
    expect(segmentLabel('aerobic')).toBe('ריצה');
    expect(segmentLabel('aerobic', 'running')).toBe('ריצה');
    expect(segmentLabel('aerobic', 'walking')).toBe('הליכה');
    expect(segmentLabel('strength')).toBe('כוח');
    expect(segmentLabel('stairs')).toBe('מדרגות');
  });
});
