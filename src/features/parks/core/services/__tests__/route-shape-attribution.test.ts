import { describe, it, expect } from 'vitest';
import { isLoopRoute, pointToPointLabel } from '../route-shape';
import { routeDataCredits } from '../route-attribution';
import { RouteShapeSchema } from '@/lib/route-collections/schemas';

const closed: [number, number][] = [[34.5, 31.5], [34.51, 31.5], [34.51, 31.51], [34.5, 31.5]];

describe('point_to_point route shape', () => {
  it('schema accepts point_to_point and keeps the existing values', () => {
    for (const v of ['loop', 'out_and_back', 'point_to_point']) expect(RouteShapeSchema.safeParse(v).success).toBe(true);
    expect(RouteShapeSchema.safeParse('linear').success).toBe(false);
  });
  it('a stored one-way shape is never a loop, even when the geometry closes', () => {
    expect(isLoopRoute({ path: closed })).toBe(true);
    expect(isLoopRoute({ path: closed, routeShape: 'point_to_point' })).toBe(false);
    expect(isLoopRoute({ path: closed, routeShape: 'loop' })).toBe(true);
    expect(isLoopRoute(null)).toBe(false);
  });
  it('label: "מסלול חד-כיווני · A → B", plain when an end is unnamed, null for other shapes', () => {
    expect(pointToPointLabel({ path: [], routeShape: 'point_to_point', trail: { endpoints: { from: 'דורות', to: 'רוחמה' } } })).toBe('מסלול חד-כיווני · דורות → רוחמה');
    expect(pointToPointLabel({ path: [], routeShape: 'point_to_point', trail: { endpoints: { from: 'דורות', to: null } } })).toBe('מסלול חד-כיווני');
    expect(pointToPointLabel({ path: [], routeShape: 'point_to_point', trail: { endpoints: { from: 'X', to: 'X' } } })).toBe('מסלול חד-כיווני');
    expect(pointToPointLabel({ path: [], routeShape: 'loop' })).toBeNull();
  });
});

describe('route data credits', () => {
  it('only for routes whose provenance says so', () => {
    expect(routeDataCredits({})).toEqual([]);
    const c = routeDataCredits({ provenance: { osm: { license: 'ODbL-1.0' }, elevation: { provider: 'copernicus-glo30' } } });
    expect(c.map((x) => x.text)).toEqual(['© OpenStreetMap contributors', 'Elevation: Copernicus WorldDEM-30 © DLR/Airbus']);
    expect(c[0].href).toBe('https://www.openstreetmap.org/copyright');
    expect(routeDataCredits({ provenance: { osm: { license: 'ODbL-1.0' } } }).map((x) => x.key)).toEqual(['osm']);
  });
});
