import { describe, it, expect } from 'vitest';
import type { RunBlock } from '../../../types/run-block.type';
import type { ComputedPaceZone, RunZoneType } from '../../../../../core/types/running.types';
import { ALL_RUN_ZONES } from '../../../../../core/types/running.types';
import type { RunPaceContext } from '../../run-preview/run-estimates';
import type { AerobicLeg, GroupLeg } from '@/features/parks/core/components/overview/overview-legs';
import { buildRunOverviewLegs, drillsAt } from '../run-overview-legs';

let n = 0;
const blk = (over: Partial<RunBlock>): RunBlock => ({ id: `b${++n}`, type: 'run', label: 'ריצה', colorHex: '#000', ...over });
const zones = Object.fromEntries(
  ALL_RUN_ZONES.map((z) => [z, { minPace: 320, maxPace: 330, label: '' } as ComputedPaceZone]),
) as Record<RunZoneType, ComputedPaceZone>;
const ctx: RunPaceContext = { basePace: 330, zones };
const drill = (exerciseId: string) => ({ exerciseId, videoUrl: `https://v/${exerciseId}.mp4` });

/** Warm-up with a mobility drill + 4 strides (one exercise), 6 × 400 with a drill on the rep, cool-down stretch. */
function withDrills(): RunBlock[] {
  const out: RunBlock[] = [
    blk({ type: 'warmup', label: 'חימום', durationSeconds: 600, zoneType: 'easy', _isDynamicWrapper: true }),
    blk({ type: 'warmup', label: 'סקיפים', durationSeconds: 60, _isDynamicWrapper: true, drillRef: drill('skips') }),
  ];
  for (let i = 0; i < 4; i++) {
    out.push(blk({ type: 'run', label: 'סטריידס', durationSeconds: 20, blockMode: 'effort', _isDynamicWrapper: true, drillRef: drill('strides') }));
  }
  for (let i = 0; i < 6; i++) {
    out.push(blk({ type: 'interval', label: `400 מ׳ (${i + 1}/6)`, distanceMeters: 400, zoneType: 'interval_short', drillRef: drill('fast') }));
    if (i < 5) out.push(blk({ type: 'recovery', label: 'ריצת התאוששות', durationSeconds: 90, _isSynthesizedRest: true }));
  }
  out.push(blk({ type: 'cooldown', label: 'שחרור', durationSeconds: 480, zoneType: 'easy', _isDynamicWrapper: true }));
  out.push(blk({ type: 'cooldown', label: 'מתיחות (1/2)', durationSeconds: 120, _isDynamicWrapper: true, drillRef: drill('stretch') }));
  return out;
}

describe('run overview legs — drills / exercises (tap → video)', () => {
  it('one chip per exercise, keyed by block index, label without the (i/n) suffix', () => {
    const blocks = withDrills();
    expect(drillsAt(blocks, blocks.map((_, i) => i)).map((d) => [d.key, d.label])).toEqual([
      ['1', 'סקיפים'], ['2', 'סטריידס'], ['6', '400 מ׳'], [String(blocks.length - 1), 'מתיחות'],
    ]);
  });

  it('warm-up / cool-down legs carry their drills; the main group rows carry a drillKey', () => {
    const blocks = withDrills();
    const legs = buildRunOverviewLegs(blocks, ctx, { kind: 'interval' });
    const warm = legs.find((l) => l.key === 'warmup') as AerobicLeg;
    const cool = legs.find((l) => l.key === 'cooldown') as AerobicLeg;
    expect(warm.drills?.map((d) => d.label)).toEqual(['סקיפים', 'סטריידס']);
    expect(cool.drills?.map((d) => d.label)).toEqual(['מתיחות']);
    const main = legs.find((l) => l.kind === 'group') as GroupLeg;
    const workRow = main.rows.find((r) => r.tone === 'work')!;
    const restRow = main.rows.find((r) => r.tone === 'recovery')!;
    expect(blocks[Number(workRow.drillKey)].drillRef?.exerciseId).toBe('fast');
    expect(restRow.drillKey).toBeUndefined();
  });

  it('no drillRef → no drills, no drillKey (the axis renders exactly as before)', () => {
    const blocks = withDrills().map(({ drillRef: _d, ...b }) => b as RunBlock);
    const legs = buildRunOverviewLegs(blocks, ctx, { kind: 'interval' });
    for (const l of legs) {
      if (l.kind === 'aerobic') expect(l.drills).toBeUndefined();
      if (l.kind === 'group') expect(l.rows.every((r) => r.drillKey === undefined)).toBe(true);
    }
  });

  it('an easy run lists the drills of the whole run', () => {
    const blocks = [
      blk({ type: 'run', label: 'ריצה קלה', durationSeconds: 30 * 60, zoneType: 'easy' }),
      blk({ type: 'run', label: 'סטריידס', durationSeconds: 20, blockMode: 'effort', _isDynamicWrapper: true, drillRef: drill('strides') }),
    ];
    const legs = buildRunOverviewLegs(blocks, ctx, { kind: 'easy' });
    expect((legs[0] as AerobicLeg).drills).toEqual([{ key: '1', label: 'סטריידס' }]);
  });
});
