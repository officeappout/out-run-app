import { describe, expect, it } from 'vitest';
import { applyOverrides, moderationKind, overrideFor, pendingIds } from '../hub-moderation.logic';
import { bulkTargets } from '../HubBulkBar';

const f = (id: string, status: string) => ({ type: 'Feature' as const, properties: { id, status }, geometry: { type: 'Point' as const, coordinates: [0, 0] } });
const payload = (features: ReturnType<typeof f>[], truncated = false) => ({ featureCollection: { type: 'FeatureCollection' as const, features }, truncated, total: truncated ? 9000 : features.length });

describe('hub-moderation.logic', () => {
  it('approve keeps routes / parks / amenities (now approved); a contribution leaves the pending-only layer; reject removes', () => {
    expect(overrideFor('route', 'approve')).toBe('approved');
    expect(overrideFor('contribution', 'approve')).toBe('removed');
    expect(overrideFor('park', 'reject')).toBe('removed');
    expect(moderationKind('climb')).toBeNull();
  });
  it('applyOverrides flips / removes and keeps totals honest', () => {
    const data = { routes: payload([f('a', 'pending'), f('b', 'pending')]) };
    const out = applyOverrides(data, { a: 'approved', b: 'removed' });
    expect(out.routes!.featureCollection.features.map((x) => [x.properties.id, x.properties.status])).toEqual([['a', 'approved']]);
    expect(out.routes!.total).toBe(1);
    expect(applyOverrides(data, {})).toBe(data);
  });
  it('bulk targets: only enabled chips, only pending ids, cap reported', () => {
    const data = { routes: payload([f('r1', 'pending'), f('r2', 'approved')]), benches: payload([f('b1', 'pending')], true), water: payload([f('w1', 'pending')]) };
    expect(pendingIds(data, 'routes')).toEqual(['r1']);
    const t = bulkTargets(data, ['routes_pending', 'benches']);
    expect(t.map((x) => [x.layer, x.ids, x.truncatedTotal])).toEqual([['routes', ['r1'], null], ['benches', ['b1'], 9000]]);
    expect(bulkTargets(data, ['routes_approved'])).toEqual([]);
  });
});
