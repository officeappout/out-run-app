import { describe, expect, it } from 'vitest';
import { computeRouteQualityMetrics, evaluateLoopQuality, type LngLat } from '@/lib/route-quality';
import { makeProjector } from '@/lib/route-quality/geo';
import { aggregateVariant } from '../aggregate';
import type { QualityRunRoute } from '../types';

const proj = makeProjector([34.774, 32.0779]);
const m = (pts: Array<[number, number]>): LngLat[] => pts.map(p => proj.toLngLat(p));

function row(variant: QualityRunRoute['variant'], run: number, path: LngLat[]): QualityRunRoute {
  const metrics = computeRouteQualityMetrics(path);
  return { key: `${variant}-${run}`, variant, run, rank: 0, name: '', distanceKm: metrics.lengthM / 1000, path, metrics, verdict: evaluateLoopQuality(metrics), ours: null, ms: 1000 };
}

describe('aggregateVariant — turns and zigzag', () => {
  it('length-weights turns/km and averages the zigzag index over top routes', () => {
    const square = m([[0, 0], [500, 0], [500, 500], [0, 500], [0, 0]]); // 2 km, 3 turns
    const stairs: Array<[number, number]> = [[0, 0]];
    for (let k = 1; k <= 6; k++) stairs.push([k * 80, (k - 1) * 80], [k * 80, k * 80]);
    stairs.push([0, 480], [0, 0]);
    const zig = m(stairs);
    const a = aggregateVariant([row('gh', 0, square), row('gh', 1, zig)], 'gh');
    const turns = row('gh', 0, square).metrics.turns + row('gh', 1, zig).metrics.turns;
    const km = (row('gh', 0, square).metrics.lengthM + row('gh', 1, zig).metrics.lengthM) / 1000;
    expect(a.turnsPerKm).toBeCloseTo(turns / km, 6);
    expect(a.meanZigzag).toBeGreaterThan(1.05);
    expect(aggregateVariant([row('on', 0, square)], 'on').meanZigzag).toBeCloseTo(1, 2);
  });
});
