import { describe, it, expect } from 'vitest';
import { scoreWaypoint, computeDistanceWindow, computeShortRouteDistanceWindow, selectAngularlyDiverseCandidates, resolveCityNameQueryAliases, scoreAndShuffleStreetSegments, buildTriangleCombinations } from '../route-generator.service';

const USER = { lat: 0, lng: 0 };
// ~0.267km east of user (route-stops' targetKm=1.6 / 6 calibration) and ~1.0km east.
const KM_PER_DEGREE = 111;
const wpAt = (km: number) => ({ lat: 0, lng: km / KM_PER_DEGREE });

// Places a waypoint at `km` distance and `bearingDeg` compass bearing from
// USER (0°=north/+lat, 90°=east/+lng) — flat-earth approximation, fine at
// these small test distances near lat=0.
function wpAtBearing(km: number, bearingDeg: number) {
  const rad = (bearingDeg * Math.PI) / 180;
  return {
    lat: (km * Math.cos(rad)) / KM_PER_DEGREE,
    lng: (km * Math.sin(rad)) / KM_PER_DEGREE,
  };
}

describe('scoreWaypoint — idealWaypointDistanceKm (P6 calibration)', () => {
  it('default (no override): scores exactly as before — ideal ≈ 1.0km, byte-identical for existing callers', () => {
    const near1km = scoreWaypoint(wpAt(1.0), USER, [], { includeStrength: false });
    const far = scoreWaypoint(wpAt(2.5), USER, [], { includeStrength: false });
    expect(near1km.score).toBeGreaterThan(far.score); // ~1km still preferred by default
  });

  it('small-target override (targetKm/6): a waypoint near the SMALL ideal scores higher than one at the old 1.0km default', () => {
    const smallIdeal = 1.6 / 6; // route-stops calibration for a 1.6km target
    const nearSmallIdeal = scoreWaypoint(wpAt(smallIdeal), USER, [], { includeStrength: false, idealWaypointDistanceKm: smallIdeal });
    const nearOldDefault = scoreWaypoint(wpAt(1.0), USER, [], { includeStrength: false, idealWaypointDistanceKm: smallIdeal });
    expect(nearSmallIdeal.score).toBeGreaterThan(nearOldDefault.score);
  });

  it('without the override, a candidate near the SMALL ideal scores WORSE than one near 1.0km (proves the bug this fixes)', () => {
    const smallIdeal = 1.6 / 6;
    const nearSmallIdealNoOverride = scoreWaypoint(wpAt(smallIdeal), USER, [], { includeStrength: false });
    const near1kmNoOverride = scoreWaypoint(wpAt(1.0), USER, [], { includeStrength: false });
    expect(nearSmallIdealNoOverride.score).toBeLessThan(near1kmNoOverride.score);
  });

  it('omitting the field entirely still returns a valid, finite score (no NaN/crash)', () => {
    const r = scoreWaypoint(wpAt(0.3), USER, [], { includeStrength: false });
    expect(Number.isFinite(r.score)).toBe(true);
  });
});

describe('scoreWaypoint — isSafe scaling for free-run\'s now-uncapped distance goal (08.08)', () => {
  it('default (no override): isSafe cutoff is unchanged at exactly 3.0km — byte-identical for existing callers', () => {
    const justUnder = scoreWaypoint(wpAt(2.9), USER, [], { includeStrength: false });
    const justOver = scoreWaypoint(wpAt(3.1), USER, [], { includeStrength: false });
    expect(justUnder.isSafe).toBe(true);
    expect(justOver.isSafe).toBe(false);
  });

  it('large-target override (targetKm/6 for a 40km loop, ≈6.67km): a waypoint at the ideal distance is NOT penalized — proves the fix', () => {
    const largeIdeal = 40 / 6; // free-run large-loop calibration
    const atIdeal = scoreWaypoint(wpAt(largeIdeal), USER, [], { includeStrength: false, idealWaypointDistanceKm: largeIdeal });
    expect(atIdeal.isSafe).toBe(true);
    // same distance WITHOUT the override would have hit the old hardcoded 3.0km wall
    const atIdealNoOverride = scoreWaypoint(wpAt(largeIdeal), USER, [], { includeStrength: false });
    expect(atIdealNoOverride.isSafe).toBe(false);
    expect(atIdeal.score).toBeGreaterThan(atIdealNoOverride.score);
  });

  it('scaled isSafe cutoff is exactly 2× idealWaypointDistanceKm once that exceeds the 3.0km floor', () => {
    const largeIdeal = 100 / 6; // free-run's new 100km slider ceiling
    const justUnderScaled = scoreWaypoint(wpAt(largeIdeal * 2 - 0.1), USER, [], { includeStrength: false, idealWaypointDistanceKm: largeIdeal });
    const justOverScaled = scoreWaypoint(wpAt(largeIdeal * 2 + 0.1), USER, [], { includeStrength: false, idealWaypointDistanceKm: largeIdeal });
    expect(justUnderScaled.isSafe).toBe(true);
    expect(justOverScaled.isSafe).toBe(false);
  });
});

describe('scoreWaypoint — proportionalDistanceTiers (13.08.2026, fixes short-loop candidates 2-3× off ideal scoring a fit bonus)', () => {
  it('default (flag omitted): tiers stay the fixed absolute 0.3/0.6/2.0km — byte-identical for every existing caller', () => {
    const smallIdeal = 0.233; // short-route calibration, 1.4km target / 6
    // A candidate 0.45km off a 0.233km ideal — under the fixed 0.6km "mid"
    // tier, so it still gets the +10 bonus without the flag (proves the bug).
    const farReal = scoreWaypoint(wpAt(smallIdeal + 0.45), USER, [], { includeStrength: false, idealWaypointDistanceKm: smallIdeal });
    const atIdeal = scoreWaypoint(wpAt(smallIdeal), USER, [], { includeStrength: false, idealWaypointDistanceKm: smallIdeal });
    expect(farReal.score).toBe(60); // 50 base + 10 (mid tier, unscaled)
    expect(atIdeal.score).toBe(70); // 50 base + 20 (tight tier)
  });

  it('with the flag: the same far candidate loses its fit bonus once tiers scale to the small ideal', () => {
    const smallIdeal = 0.233;
    const farReal = scoreWaypoint(wpAt(smallIdeal + 0.45), USER, [], {
      includeStrength: false,
      idealWaypointDistanceKm: smallIdeal,
      proportionalDistanceTiers: true,
    });
    // 0.45km diff vs a proportional penalty tier of 0.233*2.0=0.466 — just
    // under the penalty threshold, so it lands in the "no bonus" gap: 50.
    expect(farReal.score).toBe(50);
    expect(farReal.score).toBeLessThan(60); // strictly worse than the unscaled case above
  });

  it('with the flag, at idealDistance=1.0 (the default): scoring is byte-identical to today (0.3/0.6/2.0 proportional to 1.0 = 0.3/0.6/2.0)', () => {
    const withFlag = scoreWaypoint(wpAt(1.5), USER, [], { includeStrength: false, proportionalDistanceTiers: true });
    const withoutFlag = scoreWaypoint(wpAt(1.5), USER, [], { includeStrength: false });
    expect(withFlag.score).toBe(withoutFlag.score);
  });

  it('a candidate genuinely close to a small ideal still scores the top tier with the flag on', () => {
    const smallIdeal = 0.233;
    const close = scoreWaypoint(wpAt(smallIdeal + 0.05), USER, [], {
      includeStrength: false,
      idealWaypointDistanceKm: smallIdeal,
      proportionalDistanceTiers: true,
    });
    expect(close.score).toBe(70); // 0.05 < 0.233*0.3=0.070 → tight tier
  });
});

describe('scoreWaypoint — preferOfficialRoutes (13.08.2026, official/curated-route preference)', () => {
  const officialWp = (km: number) => ({ ...wpAt(km), isOfficial: true });
  const nonOfficialWp = (km: number) => ({ ...wpAt(km), isOfficial: false });

  it('default (flag omitted): isOfficial has zero effect — byte-identical for every existing caller', () => {
    const official = scoreWaypoint(officialWp(1.0), USER, [], { includeStrength: false });
    const nonOfficial = scoreWaypoint(nonOfficialWp(1.0), USER, [], { includeStrength: false });
    expect(official.score).toBe(nonOfficial.score);
  });

  it('with the flag: a well-positioned official candidate scores a modest bonus over an identical non-official one', () => {
    const official = scoreWaypoint(officialWp(1.0), USER, [], { includeStrength: false, preferOfficialRoutes: true });
    const nonOfficial = scoreWaypoint(nonOfficialWp(1.0), USER, [], { includeStrength: false, preferOfficialRoutes: true });
    expect(official.score).toBe(nonOfficial.score + 10);
  });

  it('the bonus magnitude is exactly the documented +10 (tie-breaker scale), not the 5× OFFICIAL_ROUTE_BIAS_MULTIPLIER used elsewhere', () => {
    const official = scoreWaypoint(officialWp(1.0), USER, [], { includeStrength: false, preferOfficialRoutes: true });
    // 50 base + 20 tight-tier (diff=0) + 10 official bonus = 80.
    expect(official.score).toBe(80);
    // A 5× bias on the same base (the OTHER, deviation-recovery mechanism's
    // scale) would land far higher (e.g. 350+) — confirms this bonus is a
    // deliberately different, much smaller order of magnitude.
    expect(official.score).toBeLessThan(150);
  });

  it('CRITICAL — a candidate already in the "no bonus / no penalty" gap gets only the modest official nudge, never enough to look like a well-fitted candidate', () => {
    const smallIdeal = 0.233;
    // 0.45km off a 0.233km ideal — the exact real-diagnostic shape that
    // caused short loops to overshoot before proportionalDistanceTiers.
    // This sits just inside the (proportional) penalty threshold (0.466),
    // so it's neither bonused nor penalized on fit alone — base 50.
    const farOfficial = scoreWaypoint(
      { ...wpAt(smallIdeal + 0.45), isOfficial: true },
      USER, [],
      { includeStrength: false, idealWaypointDistanceKm: smallIdeal, proportionalDistanceTiers: true, preferOfficialRoutes: true },
    );
    const wellFitted = scoreWaypoint(
      { ...wpAt(smallIdeal), isOfficial: false },
      USER, [],
      { includeStrength: false, idealWaypointDistanceKm: smallIdeal, proportionalDistanceTiers: true },
    );
    // The official nudge (50+10=60) must not outscore a genuinely
    // well-fitted real candidate (50+20=70) — fit still wins over "official".
    expect(farOfficial.score).toBe(60);
    expect(farOfficial.score).toBeLessThan(wellFitted.score);
  });

  it('a genuinely far official candidate (past the penalty tier) is still penalized — bonus never overrides the penalty', () => {
    const smallIdeal = 0.233;
    const veryFarOfficial = scoreWaypoint(
      { ...wpAt(smallIdeal + 1.0), isOfficial: true },
      USER, [],
      { includeStrength: false, idealWaypointDistanceKm: smallIdeal, proportionalDistanceTiers: true, preferOfficialRoutes: true },
    );
    expect(veryFarOfficial.score).toBeLessThan(50); // still takes the -15 penalty, no rescue
  });
});

describe('computeDistanceWindow — proportional acceptance band (08.08, fixes live 22km "no route found")', () => {
  it('small targets: byte-identical to the original fixed [target-0.5, target+2.5] window', () => {
    expect(computeDistanceWindow(3)).toEqual({ minKm: 2.5, maxKm: 5.5 });
    expect(computeDistanceWindow(5)).toEqual({ minKm: 4.5, maxKm: 7.5 });
  });

  it('very small targets: still floored at 0.5km minimum, matching prior behaviour', () => {
    expect(computeDistanceWindow(0.5)).toEqual({ minKm: 0.5, maxKm: 3.0 });
  });

  it('22km — the exact live-reported failure: window is proportionally wider than the old fixed 3km band', () => {
    const { minKm, maxKm } = computeDistanceWindow(22);
    const oldMinKm = 22 - 0.5; // 21.5 — the previous fixed window
    const oldMaxKm = 22 + 2.5; // 24.5
    expect(minKm).toBeLessThan(oldMinKm);
    expect(maxKm).toBeGreaterThan(oldMaxKm);
    expect(maxKm - minKm).toBeGreaterThan(oldMaxKm - oldMinKm);
    // window width should scale roughly with target, not stay pinned at 3km
    expect((maxKm - minKm) / 22).toBeGreaterThan(0.2); // >20% relative width, vs 13.6% before
  });

  it('window width grows with target instead of staying fixed at 3km', () => {
    const w3 = computeDistanceWindow(3);
    const w22 = computeDistanceWindow(22);
    const w50 = computeDistanceWindow(50);
    expect(w22.maxKm - w22.minKm).toBeGreaterThan(w3.maxKm - w3.minKm);
    expect(w50.maxKm - w50.minKm).toBeGreaterThan(w22.maxKm - w22.minKm);
  });

  it('minKm never goes below the 0.5km floor even for a very large target with a large percentage cut', () => {
    const { minKm } = computeDistanceWindow(100);
    expect(minKm).toBeGreaterThanOrEqual(0.5);
  });
});

describe('computeShortRouteDistanceWindow — short-route acceptance band (David\'s "12min push → 32min/2.7km route" regression)', () => {
  it('a 0.6km target does NOT validate a ~3km result — the exact regression this function exists to prevent', () => {
    const { maxKm } = computeShortRouteDistanceWindow(0.6);
    expect(maxKm).toBeLessThan(3.0);
  });

  it('is proportionally tighter than computeDistanceWindow at the same small target', () => {
    const loose = computeDistanceWindow(0.6);
    const tight = computeShortRouteDistanceWindow(0.6);
    expect(tight.maxKm).toBeLessThan(loose.maxKm);
    expect(tight.maxKm - tight.minKm).toBeLessThan(loose.maxKm - loose.minKm);
  });

  it('minKm never goes below the small numeric-safety floor even for a tiny target', () => {
    const { minKm } = computeShortRouteDistanceWindow(0.2);
    expect(minKm).toBeGreaterThanOrEqual(0.1);
  });

  it('window still contains the exact target distance (no off-by-construction gap)', () => {
    for (const target of [0.2, 0.6, 1.0, 1.4]) {
      const { minKm, maxKm } = computeShortRouteDistanceWindow(target);
      expect(minKm).toBeLessThanOrEqual(target);
      expect(maxKm).toBeGreaterThanOrEqual(target);
    }
  });

  it('window width grows with target, same proportional-scaling principle as computeDistanceWindow', () => {
    const w02 = computeShortRouteDistanceWindow(0.2);
    const w14 = computeShortRouteDistanceWindow(1.4);
    expect(w14.maxKm - w14.minKm).toBeGreaterThan(w02.maxKm - w02.minKm);
  });
});

describe('selectAngularlyDiverseCandidates — angular spread for large loops (08.08, fixes live 21.5-22km "short route" failures)', () => {
  const idealKm = 3.6;
  const scoreAt = (km: number, bearing: number) =>
    scoreWaypoint(wpAtBearing(km, bearing), USER, [], { includeStrength: false, idealWaypointDistanceKm: idealKm });

  it('prefers angular spread over re-picking the same high-score cluster (proves the bug this fixes)', () => {
    // 10 near-identical, tightly-clustered, top-scored candidates (all at the
    // ideal radius, all within a 20° arc — the exact "61 max-score segments
    // in a 5.5km cluster" shape found live) + 2 lower-scored but well-spread
    // candidates in other directions.
    const cluster = Array.from({ length: 10 }, (_, i) => scoreAt(idealKm, 10 + i * 2)); // bearings 10-28°
    const spreadOut = [scoreAt(idealKm + 0.5, 140), scoreAt(idealKm + 0.5, 260)]; // slightly worse fit, different directions
    const pool = [...cluster, ...spreadOut];

    const selected = selectAngularlyDiverseCandidates(pool, USER, 4, idealKm);

    // A pure top-4-by-score selection would return only cluster members
    // (all scored higher than the spread-out pair) — the OLD, broken
    // behaviour. The fix must include at least one of the spread-out points.
    const selectedBearings = selected.map((wp) =>
      ((Math.atan2(wp.lng, wp.lat) * 180) / Math.PI + 360) % 360,
    );
    const includesSpreadOut = selectedBearings.some((b) => Math.abs(b - 140) < 5 || Math.abs(b - 260) < 5);
    expect(includesSpreadOut).toBe(true);
  });

  it('never returns more than maxCount candidates', () => {
    const pool = Array.from({ length: 50 }, (_, i) => scoreAt(idealKm, (i * 137) % 360)); // spread around the circle
    const selected = selectAngularlyDiverseCandidates(pool, USER, 12, idealKm);
    expect(selected.length).toBeLessThanOrEqual(12);
  });

  it('backfills from remaining candidates when fewer than maxCount sectors are populated (no data starvation)', () => {
    // Every candidate crammed into one 20° arc, like a real coastal city
    // where the rest of the compass is sea — zero data in other sectors.
    const pool = Array.from({ length: 20 }, (_, i) => scoreAt(idealKm, 100 + i));
    const selected = selectAngularlyDiverseCandidates(pool, USER, 12, idealKm);
    // Only 1 sector is populated, but the pool has 20 candidates — backfill
    // should still return up to maxCount, not just the 1 sector's winner.
    expect(selected.length).toBe(12);
  });

  it('result is sorted by bearing (so index-adjacency in the caller matches angular adjacency)', () => {
    const pool = [scoreAt(idealKm, 300), scoreAt(idealKm, 10), scoreAt(idealKm, 180), scoreAt(idealKm, 90)];
    const selected = selectAngularlyDiverseCandidates(pool, USER, 4, idealKm);
    const bearings = selected.map((wp) => ((Math.atan2(wp.lng, wp.lat) * 180) / Math.PI + 360) % 360);
    const sorted = [...bearings].sort((a, b) => a - b);
    expect(bearings).toEqual(sorted);
  });

  it('round-robin backfill does NOT let one dense sector swallow the whole pool (proves David\'s real-address bug fix)', () => {
    // Reproduces the exact live shape: one massive sector (66+ candidates,
    // all near-ideal and high-scoring) plus several thin sectors (1-2
    // candidates each, badly positioned) plus 2 fully empty sectors. A
    // global-score backfill would pull most of the 12 slots from the dense
    // sector alone — round-robin must not.
    const denseSector = Array.from({ length: 66 }, (_, i) => scoreAt(idealKm, 350 + (i % 8) * 0.5)); // ~351°, tight cluster
    const thinSectors = [
      scoreAt(idealKm - 2, 25),  // sparse, off-ideal
      scoreAt(idealKm - 2, 67),
      scoreAt(idealKm - 3, 90),
    ];
    const pool = [...denseSector, ...thinSectors];
    const selected = selectAngularlyDiverseCandidates(pool, USER, 12, idealKm);

    const bearingOf = (wp: { lat: number; lng: number }) => ((Math.atan2(wp.lng, wp.lat) * 180) / Math.PI + 360) % 360;
    const fromDenseSector = selected.filter((wp) => Math.abs(bearingOf(wp) - 351) < 10 || bearingOf(wp) < 5).length;
    // The dense sector may still contribute the most (correct — real density
    // matters), but must not swallow the entire 12-slot pool.
    expect(fromDenseSector).toBeLessThan(12);
    expect(fromDenseSector).toBeGreaterThan(0);
  });

  it('synthesizes a candidate for a fully empty sector, at the sector center bearing and idealDistanceKm radius', () => {
    // Only sector 0 (bearing 0-45°) has real data — all other 7 sectors
    // should get a synthetic fill candidate.
    const pool = [scoreAt(idealKm, 20)];
    const selected = selectAngularlyDiverseCandidates(pool, USER, 12, idealKm);
    expect(selected.length).toBe(8); // 1 real + 7 synthetic (one per empty sector)
    for (const wp of selected) {
      // Every synthesized (and the one real) candidate should sit near idealKm.
      const distKm = Math.sqrt(wp.lat ** 2 + wp.lng ** 2) * KM_PER_DEGREE;
      expect(distKm).toBeGreaterThan(idealKm - 0.5);
      expect(distKm).toBeLessThan(idealKm + 0.5);
    }
  });

  it('does NOT synthesize when a sector already has a well-positioned real candidate', () => {
    // All 8 sectors well-covered near ideal — no synthesis should be needed,
    // so the result should be exactly the 8 real candidates, not more.
    const pool = [0, 45, 90, 135, 180, 225, 270, 315].map((b) => scoreAt(idealKm, b + 5));
    const selected = selectAngularlyDiverseCandidates(pool, USER, 12, idealKm);
    expect(selected.length).toBe(8);
  });
});

describe('selectAngularlyDiverseCandidates — proportionalGap (13.08.2026, fixes short-loop candidates 2-3× off ideal blocking synthesis)', () => {
  // Small ideal — short-route scale, where the fixed 1.0km SECTOR_POSITION_GAP_KM
  // is nowhere near proportionally tight (real diagnostic case: 1.4km target / 6).
  const smallIdeal = 0.233;
  // One real candidate per sector, all ~0.45km off smallIdeal — under the fixed
  // 1.0km gap (so synthesis is skipped today) but 2× the ideal itself.
  const farRealPool = Array.from({ length: 8 }, (_, i) =>
    scoreWaypoint(wpAtBearing(smallIdeal + 0.45, i * 45 + 5), USER, [], { includeStrength: false, idealWaypointDistanceKm: smallIdeal }),
  );

  it('default (flag omitted): the far-but-"within 1.0km" real candidate wins its sector — byte-identical for every existing caller', () => {
    const selected = selectAngularlyDiverseCandidates(farRealPool, USER, 8, smallIdeal);
    // No synthetic (score=70) candidates — every slot is a real, far, unscaled-tier candidate.
    expect(selected.every((c) => c.distanceFromUser > smallIdeal + 0.4)).toBe(true);
  });

  it('with the flag: the far real candidate no longer "covers" its sector, so a synthetic-at-ideal candidate is preferred', () => {
    const selected = selectAngularlyDiverseCandidates(farRealPool, USER, 8, smallIdeal, { proportionalGap: true });
    // Synthetic candidates sit exactly at idealDistanceKm and outscore the
    // now-unscaled-tier-penalized real ones (70 vs the real candidates'
    // lower score under proportionalDistanceTiers-style scoring here —
    // scoreWaypoint was already called with the small ideal above, so the
    // far candidates score via the DEFAULT absolute tiers in this pool;
    // the key assertion is purely about which one WINS the sector).
    expect(selected.every((c) => Math.abs(c.distanceFromUser - smallIdeal) < 0.01)).toBe(true);
  });

  it('with the flag, at a large ideal (existing large-loop scale): behaves like the fixed-gap default when real candidates sit exactly at ideal', () => {
    // Well-covered sectors, real candidates exactly at idealKm (gap=0) — both
    // flag states must agree: no synthesis, regardless of gap-threshold value.
    const idealKm = 3.6;
    const pool = [0, 45, 90, 135, 180, 225, 270, 315].map((b) =>
      scoreWaypoint(wpAtBearing(idealKm, b + 5), USER, [], { includeStrength: false, idealWaypointDistanceKm: idealKm }),
    );
    const withFlag = selectAngularlyDiverseCandidates(pool, USER, 12, idealKm, { proportionalGap: true });
    const withoutFlag = selectAngularlyDiverseCandidates(pool, USER, 12, idealKm);
    expect(withFlag.length).toBe(withoutFlag.length);
    expect(withFlag.length).toBe(8);
  });
});

describe('resolveCityNameQueryAliases — Tel Aviv-Yafo naming variant (08.08, fixes 80% of top-scored candidates being invisible)', () => {
  it('תל אביב resolves to both the canonical and the official "-יפו" variant', () => {
    expect(resolveCityNameQueryAliases('תל אביב')).toEqual(['תל אביב', 'תל אביב-יפו']);
  });

  it('any other city resolves to itself only — no unintended expansion', () => {
    expect(resolveCityNameQueryAliases('חיפה')).toEqual(['חיפה']);
    expect(resolveCityNameQueryAliases('ירושלים')).toEqual(['ירושלים']);
  });

  it('the alias variant is never confused with the canonical form as a lookup key', () => {
    // Looking up the ALREADY-hyphenated form should not double-expand or loop
    expect(resolveCityNameQueryAliases('תל אביב-יפו')).toEqual(['תל אביב-יפו']);
  });

  it('result never exceeds Firestore\'s 10-value "in" operator limit', () => {
    for (const city of ['תל אביב', 'חיפה', 'ירושלים', 'תל אביב-יפו']) {
      expect(resolveCityNameQueryAliases(city).length).toBeLessThanOrEqual(10);
    }
  });
});

describe('scoreAndShuffleStreetSegments — shared scoring tail (13.08.2026, extracted for the proximity-query rewrite)', () => {
  // A minimal, valid segment shape — score is the only field
  // scoreAndShuffleStreetSegments truly requires from StreetSegment.
  const seg = (over: Record<string, unknown> = {}) => ({ score: 5, ...over });
  const at = (lat: number, lng: number) => ({ lat, lng });

  it('official segments (isOfficial or officialRouteId set) get the score=10 floor even with a low raw score', () => {
    const { candidates } = scoreAndShuffleStreetSegments(
      [{ point: at(0, 0), seg: seg({ score: 2, isOfficial: true }) }],
      undefined,
    );
    expect(candidates[0].score).toBe(10);
  });

  it('a non-official low-raw-score segment keeps its raw score, no floor applied', () => {
    const { candidates } = scoreAndShuffleStreetSegments(
      [{ point: at(0, 0), seg: seg({ score: 2 }) }],
      undefined,
    );
    expect(candidates[0].score).toBe(2);
  });

  it('officialRouteId alone (isOfficial unset) is also treated as official — matches fetchScoredWaypoints\' documented detection rule', () => {
    const { candidates } = scoreAndShuffleStreetSegments(
      [{ point: at(0, 0), seg: seg({ score: 3, officialRouteId: 'route-1' }) }],
      undefined,
    );
    expect(candidates[0].score).toBe(10);
  });

  it('deviation-recovery: a segment matching activeOfficialRouteId gets the 5× multiplier on top of the official floor', () => {
    const { candidates, officialBiasApplied } = scoreAndShuffleStreetSegments(
      [{ point: at(0, 0), seg: seg({ score: 2, officialRouteId: 'route-1' }) }],
      'route-1',
    );
    expect(candidates[0].score).toBe(50); // official floor (10) × 5
    expect(officialBiasApplied).toBe(1);
  });

  it('deviation-recovery bias does NOT apply to a segment with a different officialRouteId', () => {
    const { candidates, officialBiasApplied } = scoreAndShuffleStreetSegments(
      [{ point: at(0, 0), seg: seg({ score: 2, officialRouteId: 'route-1' }) }],
      'route-2',
    );
    expect(candidates[0].score).toBe(10); // official floor only, no 5× bonus
    expect(officialBiasApplied).toBe(0);
  });

  it('officialBackboneCount counts every candidate that landed at score>=10', () => {
    const { officialBackboneCount } = scoreAndShuffleStreetSegments(
      [
        { point: at(0, 0), seg: seg({ score: 10 }) },
        { point: at(0, 0.01), seg: seg({ score: 2, isOfficial: true }) },
        { point: at(0, 0.02), seg: seg({ score: 4 }) },
      ],
      undefined,
    );
    expect(officialBackboneCount).toBe(2);
  });

  it('is sorted by score descending', () => {
    const { candidates } = scoreAndShuffleStreetSegments(
      [
        { point: at(0, 0), seg: seg({ score: 3 }) },
        { point: at(0, 0.01), seg: seg({ score: 9 }) },
        { point: at(0, 0.02), seg: seg({ score: 6 }) },
      ],
      undefined,
    );
    expect(candidates.map((c) => c.score)).toEqual([9, 6, 3]);
  });

  it('returns lat/lng unchanged from the input point', () => {
    const { candidates } = scoreAndShuffleStreetSegments(
      [{ point: at(32.05, 34.78), seg: seg() }],
      undefined,
    );
    expect(candidates[0]).toMatchObject({ lat: 32.05, lng: 34.78 });
  });

  it('empty input returns an empty result, not a crash', () => {
    const result = scoreAndShuffleStreetSegments([], undefined);
    expect(result.candidates).toEqual([]);
    expect(result.officialBiasApplied).toBe(0);
    expect(result.officialBackboneCount).toBe(0);
  });
});

describe('buildTriangleCombinations — periodicity fix (14.08.2026, fixes live Tel Aviv duplicate-route-card bug)', () => {
  // Build N distinct WaypointCandidate-shaped fixtures via the real scoreWaypoint,
  // matching this file's established fixture style — the specific score values
  // don't matter here, only that each index is a distinct, identifiable object.
  const buildCandidates = (n: number) =>
    Array.from({ length: n }, (_, i) => scoreWaypoint(wpAtBearing(1.0, (360 / n) * i), USER, [], { includeStrength: false }));

  const vertexSetsOf = (combos: ReturnType<typeof buildTriangleCombinations>, candidates: ReturnType<typeof buildCandidates>) =>
    combos.map((c) => c.waypoints.map((wp) => candidates.indexOf(wp)).sort((a, b) => a - b).join(','));

  it('CRITICAL — N=12 (the requested max, the common real-world case) yields 5 genuinely distinct triangles, not 2', () => {
    const candidates = buildCandidates(12);
    const combos = buildTriangleCombinations(candidates, 0);
    const sets = vertexSetsOf(combos, candidates);
    expect(combos.length).toBe(5);
    expect(new Set(sets).size).toBe(5); // proves the old 2-distinct-shapes bug is fixed
  });

  it('N=12 reaches 5 distinct triangles for every possible baseOffset, not just 0', () => {
    const candidates = buildCandidates(12);
    for (let base = 0; base < 12; base++) {
      const combos = buildTriangleCombinations(candidates, base);
      const sets = vertexSetsOf(combos, candidates);
      expect(new Set(sets).size).toBe(combos.length); // no duplicates, whatever the count
      expect(combos.length).toBe(5);
    }
  });

  it('no two returned combinations ever share the same vertex set, across a spread of N', () => {
    for (const n of [3, 4, 6, 8, 9, 10, 12, 15, 20]) {
      const candidates = buildCandidates(n);
      const combos = buildTriangleCombinations(candidates, 0);
      const sets = vertexSetsOf(combos, candidates);
      expect(new Set(sets).size).toBe(sets.length);
    }
  });

  it('very small N is genuinely combinatorially capped, not a bug — N=3 has exactly one possible triangle', () => {
    const candidates = buildCandidates(3);
    const combos = buildTriangleCombinations(candidates, 0);
    expect(combos.length).toBe(1);
  });

  it('each combination carries the mean of its 3 waypoints\' scores, unchanged from before', () => {
    const candidates = buildCandidates(12);
    const combos = buildTriangleCombinations(candidates, 0);
    for (const combo of combos) {
      const expected = combo.waypoints.reduce((sum, wp) => sum + wp.score, 0) / 3;
      expect(combo.score).toBeCloseTo(expected, 10);
    }
  });

  it('empty candidates return no combinations, not a crash', () => {
    expect(buildTriangleCombinations([], 0)).toEqual([]);
  });
});
