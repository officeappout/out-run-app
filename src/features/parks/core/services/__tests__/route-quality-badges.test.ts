import { describe, it, expect } from 'vitest';
import {
  computeQualityBadges,
  GENUINE_BADGE_STRONG_PCT,
  GENUINE_BADGE_MODERATE_PCT,
  CARD_BADGE_CAP,
} from '../route-quality-badges.service';

// Minimal shape matching Route['qualitySignals'] — the real type import
// isn't needed for a pure-function test, this mirrors exactly what the
// function destructures.
function signals(overrides: {
  composition?: { genuinePct: number; sidewalkPct?: number; ordinaryPct?: number; otherPct?: number };
  lighting?: { status: 'computed' | 'unknown'; litCoveragePct: number | null; isLit: boolean | null };
  amenities?: {
    status: 'computed' | 'no_coverage';
    has?: Partial<Record<'court' | 'bench' | 'drinking_water' | 'fitness_station' | 'dog_park', boolean>>;
  };
} = {}) {
  if (overrides.amenities?.status === 'computed') {
    const has = { court: false, bench: false, drinking_water: false, fitness_station: false, dog_park: false, ...overrides.amenities.has };
    return { ...overrides, amenities: { ...overrides.amenities, has } } as any;
  }
  return overrides as any;
}

function computedAmenities(has: Partial<Record<'court' | 'bench' | 'drinking_water' | 'fitness_station' | 'dog_park', boolean>>) {
  return { status: 'computed' as const, has };
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

  it('both a strong composition badge and a lighting badge can appear together, lighting FIRST (priority order, David-approved 01.09.2026)', () => {
    const result = computeQualityBadges(signals({
      composition: { genuinePct: 95 },
      lighting: { status: 'computed', litCoveragePct: 90, isLit: true },
    }));
    expect(result).toEqual([
      { key: 'lighting', label: 'מואר' },
      { key: 'composition', label: 'מסלול טבעי' },
    ]);
  });

  it("amenities status 'no_coverage' -> no amenity badges at all (city never extracted, not evidence of absence)", () => {
    const result = computeQualityBadges(signals({
      amenities: { status: 'no_coverage' },
    }));
    expect(result).toEqual([]);
  });

  it('amenities computed with has.drinking_water true -> "ברזייה בדרך"', () => {
    const result = computeQualityBadges(signals({
      amenities: computedAmenities({ drinking_water: true }),
    }));
    expect(result).toEqual([{ key: 'drinking_water', label: 'ברזייה בדרך' }]);
  });

  it('amenities computed with has.bench/court/fitness_station/dog_park true -> matching badges each', () => {
    expect(computeQualityBadges(signals({ amenities: computedAmenities({ bench: true } as any) })))
      .toEqual([{ key: 'bench', label: 'ספסלים' }]);
    expect(computeQualityBadges(signals({ amenities: computedAmenities({ court: true } as any) })))
      .toEqual([{ key: 'court', label: 'מגרש ספורט' }]);
    expect(computeQualityBadges(signals({ amenities: computedAmenities({ fitness_station: true } as any) })))
      .toEqual([{ key: 'fitness_station', label: 'מתקן כושר' }]);
    expect(computeQualityBadges(signals({ amenities: computedAmenities({ dog_park: true } as any) })))
      .toEqual([{ key: 'dog_park', label: 'ידידותי לכלבים 🐕' }]);
  });

  it('amenities computed with has.crossing -- not a real field, crossing can never produce a card badge', () => {
    // has has no `crossing` key at all (type-level exclusion) — this test
    // documents the intent: even a route with thousands of crossings gets
    // zero card signal from it, by construction, not by a runtime check.
    const result = computeQualityBadges(signals({ amenities: computedAmenities({}) }));
    expect(result.find((b) => (b.key as string) === 'crossing')).toBeUndefined();
  });

  it('a very high crossing COUNT never produces a card badge, at any magnitude (a negative signal, filter-only)', () => {
    // Full real-world shape this time (counts alongside has, exactly like
    // buildAmenitiesSignal produces) — proves computeQualityBadges ignores
    // counts.crossing entirely, not just that `has` happens to lack the key.
    const result = computeQualityBadges(signals({
      amenities: {
        status: 'computed',
        counts: { court: 0, bench: 0, drinking_water: 0, fitness_station: 0, crossing: 2206, dog_park: 0 },
        has: { court: false, bench: false, drinking_water: false, fitness_station: false, dog_park: false },
      } as any,
    }));
    expect(result).toEqual([]);
  });

  it('CARD_BADGE_CAP caps the card at the top-priority badges, dropping the rest (never padding)', () => {
    const result = computeQualityBadges(signals({
      lighting: { status: 'computed', litCoveragePct: 90, isLit: true },       // priority 1
      amenities: computedAmenities({ drinking_water: true, fitness_station: true, bench: true, court: true, dog_park: true }), // priorities 2,4,5,6,7
      composition: { genuinePct: 95 },                                          // priority 3
    }));
    expect(result).toHaveLength(CARD_BADGE_CAP);
    expect(result).toEqual([
      { key: 'lighting', label: 'מואר' },
      { key: 'drinking_water', label: 'ברזייה בדרך' },
      { key: 'composition', label: 'מסלול טבעי' },
    ]);
  });
});
