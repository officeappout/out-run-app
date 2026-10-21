/**
 * RC7: the hour-aware shade summary rides on the comfort component as an
 * optional, informational field — present only when measured, never moving
 * points, and the route_scores doc carries the key only when present
 * (axioms §24: absent ≠ present-with-undefined).
 */
import { describe, expect, it } from 'vitest';
import { buildRouteScoreDoc, routeScoreDocFromStored } from '../route-scores-doc';
import { routeScoreInputFromDoc } from '../from-route-doc';
import { routeScore } from '../score';
import { parkHaMesilaDoc } from './fixtures';
import type { HourlyProfileSummary } from '../../shade-hourly/route-hourly';

const summary: HourlyProfileSummary = {
  source: 'shade_hourly_v1',
  coverage: 0.9,
  summerMean: 0.41,
  julyByHour: [0.8, 0.6, 0.5, 0.4, 0.3, 0.3, 0.3, 0.3, 0.35, 0.4, 0.5, 0.6, 0.75, 0.95],
};

describe('comfort.hourlyShade', () => {
  const without = routeScore(routeScoreInputFromDoc('r1', parkHaMesilaDoc()));
  const withH = routeScore(routeScoreInputFromDoc('r1', parkHaMesilaDoc(), { hourlyShade: summary }));

  it('is attached to comfort when measured and changes no points / score / band', () => {
    expect(withH.components.comfort.hourlyShade).toEqual(summary);
    expect(withH.components.comfort.points).toBe(without.components.comfort.points);
    expect(withH.score).toBe(without.score);
    expect(withH.band).toBe(without.band);
  });
  it('is absent (not undefined-valued) when not measured', () => {
    expect(Object.prototype.hasOwnProperty.call(without.components.comfort, 'hourlyShade')).toBe(false);
    const doc = buildRouteScoreDoc(routeScoreInputFromDoc('r1', parkHaMesilaDoc()), without, null);
    expect(Object.prototype.hasOwnProperty.call(doc.components.comfort, 'hourlyShade')).toBe(false);
  });
  it('reaches the route_scores doc and reads back', () => {
    const doc = buildRouteScoreDoc(routeScoreInputFromDoc('r1', parkHaMesilaDoc(), { hourlyShade: summary }), withH, null);
    expect(doc.components.comfort.hourlyShade).toEqual(summary);
    const back = routeScoreDocFromStored(JSON.parse(JSON.stringify(doc)));
    expect(back.components.comfort.hourlyShade).toEqual(summary);
  });
});
