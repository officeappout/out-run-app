import { describe, it, expect } from 'vitest';
import {
  computeQualityBadges,
  GENUINE_BADGE_STRONG_PCT,
  GENUINE_BADGE_MODERATE_PCT,
} from '../route-quality-badges.service';

// Minimal shape matching Route['qualitySignals'] — the real type import
// isn't needed for a pure-function test, this mirrors exactly what the
// function destructures.
function signals(overrides: {
  composition?: { genuinePct: number; sidewalkPct?: number; ordinaryPct?: number; otherPct?: number };
  lighting?: { status: 'computed' | 'unknown'; litCoveragePct: number | null; isLit: boolean | null };
} = {}) {
  return overrides as any;
}

describe('computeQualityBadges', () => {
  it('qualitySignals absent -> no badges at all (never a false negative on missing data)', () => {
    expect(computeQualityBadges(undefined)).toEqual([]);
  });

  it("lighting status 'unknown' -> no lighting badge (sparse OSM coverage is not evidence of anything)", () => {
    const result = computeQualityBadges(signals({
      composition: { genuinePct: 90 },
      lighting: { status: 'unknown', litCoveragePct: 12, isLit: null },
    }));
    expect(result.find((b) => b.key === 'lighting')).toBeUndefined();
  });

  it('a non-Haifa route (qualitySignals.lighting undefined) -> no lighting badge', () => {
    const result = computeQualityBadges(signals({
      composition: { genuinePct: 90 },
      // lighting deliberately omitted, matching every non-Haifa route today
    }));
    expect(result.find((b) => b.key === 'lighting')).toBeUndefined();
  });

  it('lighting computed + isLit true -> "מואר" badge', () => {
    const result = computeQualityBadges(signals({
      composition: { genuinePct: 30 }, // below any composition threshold, isolates the lighting case
      lighting: { status: 'computed', litCoveragePct: 78, isLit: true },
    }));
    expect(result).toEqual([{ key: 'lighting', label: 'מואר' }]);
  });

  it('lighting computed + isLit false -> no lighting badge (a real negative, still silent -- not a strength)', () => {
    const result = computeQualityBadges(signals({
      composition: { genuinePct: 30 },
      lighting: { status: 'computed', litCoveragePct: 8, isLit: false },
    }));
    expect(result.find((b) => b.key === 'lighting')).toBeUndefined();
  });

  it('genuinePct 85 -> "מסלול טבעי"', () => {
    const result = computeQualityBadges(signals({ composition: { genuinePct: 85 } }));
    expect(result).toEqual([{ key: 'composition', label: 'מסלול טבעי' }]);
  });

  it('genuinePct 65 -> "רוב שביל ייעודי"', () => {
    const result = computeQualityBadges(signals({ composition: { genuinePct: 65 } }));
    expect(result).toEqual([{ key: 'composition', label: 'רוב שביל ייעודי' }]);
  });

  it('genuinePct 40 -> no composition badge (below both thresholds, silent not a warning)', () => {
    const result = computeQualityBadges(signals({ composition: { genuinePct: 40 } }));
    expect(result.find((b) => b.key === 'composition')).toBeUndefined();
  });

  it('threshold boundaries are inclusive at >= (matches decideRouteAccuracy convention)', () => {
    const atStrong = computeQualityBadges(signals({ composition: { genuinePct: GENUINE_BADGE_STRONG_PCT } }));
    expect(atStrong).toEqual([{ key: 'composition', label: 'מסלול טבעי' }]);

    const atModerate = computeQualityBadges(signals({ composition: { genuinePct: GENUINE_BADGE_MODERATE_PCT } }));
    expect(atModerate).toEqual([{ key: 'composition', label: 'רוב שביל ייעודי' }]);

    const justBelowModerate = computeQualityBadges(signals({ composition: { genuinePct: GENUINE_BADGE_MODERATE_PCT - 1 } }));
    expect(justBelowModerate.find((b) => b.key === 'composition')).toBeUndefined();
  });

  it('both a strong composition badge and a lighting badge can appear together (independent signals)', () => {
    const result = computeQualityBadges(signals({
      composition: { genuinePct: 95 },
      lighting: { status: 'computed', litCoveragePct: 90, isLit: true },
    }));
    expect(result).toEqual([
      { key: 'composition', label: 'מסלול טבעי' },
      { key: 'lighting', label: 'מואר' },
    ]);
  });
});
