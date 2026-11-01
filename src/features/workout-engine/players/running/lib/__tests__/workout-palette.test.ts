import { describe, expect, it } from 'vitest';
import { V2_BLOCK_COLORS, WORKOUT_ZONE_TRAIL_COLORS, zoneBlockColor } from '../workout-palette';
import { V2_BLOCK_COLORS as BAR_COLORS, v2BlockColor } from '../planned-rep-results';
import { ZONE_TRAIL_COLORS } from '@/features/parks/core/components/mapLayersConfig';
import { ALL_RUN_ZONES } from '../../../../core/types/running.types';
import type { RunBlock } from '../../types/run-block.type';

const barHexes = new Set<string>(Object.values(V2_BLOCK_COLORS));

describe('workout palette (one palette for bars and map trail)', () => {
  it('the bars read the same object', () => {
    expect(BAR_COLORS).toBe(V2_BLOCK_COLORS);
  });

  it('every ZONE_TRAIL_COLORS key maps to a bar colour', () => {
    const trail = new Map(WORKOUT_ZONE_TRAIL_COLORS);
    for (const [zone] of ZONE_TRAIL_COLORS) {
      expect(barHexes.has(trail.get(zone) ?? '')).toBe(true);
    }
  });

  it('covers every run zone, no invented hexes', () => {
    expect(WORKOUT_ZONE_TRAIL_COLORS.map(([z]) => z)).toEqual(ALL_RUN_ZONES);
    for (const [, hex] of WORKOUT_ZONE_TRAIL_COLORS) expect(barHexes.has(hex)).toBe(true);
  });

  it('a zone block paints the same on the bar and on the trail', () => {
    for (const zoneType of ALL_RUN_ZONES) {
      const block = { id: 'b', type: 'run', zoneType } as unknown as RunBlock;
      expect(v2BlockColor(block)).toBe(new Map(WORKOUT_ZONE_TRAIL_COLORS).get(zoneType));
    }
  });

  it('no zone → null (the block type decides)', () => {
    expect(zoneBlockColor(undefined)).toBeNull();
    expect(zoneBlockColor(null)).toBeNull();
  });
});
