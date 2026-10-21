/**
 * The six routeScore components (NATIONWIDE-PLAN.md §3.3). Each is pure and
 * returns points (0..max) plus how much of it was really measured. A part
 * that was not measured is filled at HALF its max — "partial score with low
 * confidence, not zero" (§3.3) — and its coverage drops accordingly.
 */
import { LOOP_QUALITY_THRESHOLDS } from '../route-quality/acceptance';
import type { ComponentScore, RouteScoreInput } from './types';
import { SCORE_WEIGHTS, SHADE_CANOPY_MIN_SHARE, SOURCE_TIER_POINTS } from './weights';

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const round1 = (n: number) => Math.round(n * 10) / 10;

function missing(max: number, note: string): ComponentScore {
  return { points: max / 2, max, coverage: 0, notes: [note] };
}

/** Surface / composition (25): genuine path + ½ quiet street + ¼ sidewalk, minus ½ unclassified. */
export function scoreSurface(i: RouteScoreInput): ComponentScore {
  const max = SCORE_WEIGHTS.surface;
  const c = i.composition;
  if (!c) return missing(max, 'no composition');
  const raw = c.genuinePct + 0.5 * c.ordinaryPct + 0.25 * c.sidewalkPct - 0.5 * c.otherPct;
  return { points: round1(max * clamp01(raw / 100)), max, coverage: 1, notes: [] };
}

/**
 * Geometry (20). Loops are judged on the route-quality v1 bars (retrace,
 * U-turns/spurs, compactness). Linear corridors and point-to-point trails are
 * legitimate and never penalised on compactness; an out-and-back keeps its one
 * turnaround.
 */
export function scoreGeometry(i: RouteScoreInput): ComponentScore {
  const max = SCORE_WEIGHTS.geometry;
  const g = i.geometry;
  if (!g || !i.shape) return missing(max, 'no geometry');
  const t = LOOP_QUALITY_THRESHOLDS;
  const notes: string[] = [];
  const base: Record<NonNullable<RouteScoreInput['shape']>, number> = {
    loop: 20,
    linear_corridor: 18,
    point_to_point: 18,
    out_and_back: 14,
    unclassified: 10,
  };
  let pts = base[i.shape];
  const turns = i.shape === 'out_and_back' ? Math.max(0, g.uTurnCount + g.spurCount - 1) : g.uTurnCount + g.spurCount;
  if (turns > t.maxUTurns) { pts -= Math.min(6, 3 * turns); notes.push(`${turns} U-turn/spur`); }
  if (i.shape !== 'out_and_back' && g.retracedPct > t.maxRetracedPct) {
    pts -= Math.min(8, (g.retracedPct - t.maxRetracedPct) * 50);
    notes.push(`retrace ${Math.round(g.retracedPct * 100)}%`);
  }
  if (i.shape === 'loop' && g.compactness < t.minCompactness) {
    pts -= Math.min(6, ((t.minCompactness - g.compactness) / t.minCompactness) * 6);
    notes.push(`compactness ${g.compactness.toFixed(2)}`);
  }
  return { points: round1(Math.max(0, pts)), max, coverage: 1, notes };
}

/**
 * Safety (15). Measured: major-road share + unmarked crossings (route-quality
 * v1 with an OSM road layer). Proxy when only composition exists: sidewalk
 * share (sidewalks run beside roads) — counted as half-measured.
 */
export function scoreSafety(i: RouteScoreInput): ComponentScore {
  const max = SCORE_WEIGHTS.safety;
  const s = i.osmSafety;
  if (s) {
    let pts = max * (1 - clamp01(s.majorRoadPct / 0.3));
    pts -= Math.min(6, s.unmarkedPerKm * 6);
    return { points: round1(Math.max(0, pts)), max, coverage: 1, notes: [] };
  }
  if (i.composition) {
    const pts = max * (1 - clamp01(i.composition.sidewalkPct / 60));
    return { points: round1(pts), max, coverage: 0.5, notes: ['proxy: sidewalk share'] };
  }
  return missing(max, 'no safety signal');
}

/** Source / officialness (15) — fixed points per tier. `unknown` is half-measured. */
export function scoreSource(i: RouteScoreInput): ComponentScore {
  const max = SCORE_WEIGHTS.source;
  return {
    points: SOURCE_TIER_POINTS[i.sourceTier],
    max,
    coverage: i.sourceTier === 'unknown' ? 0.5 : 1,
    notes: [i.sourceTier],
  };
}

/**
 * Comfort (15): lighting (8) + amenities (7: water 3, bench 3, other 1).
 * Once shade exists (RC2, `shadeShare`), the split becomes lighting 6 +
 * amenities 5 + shade 4, with full shade points at the owner-approved 40%
 * canopy bar. Until then shade is simply absent — it does not lower coverage.
 */
export function scoreComfort(i: RouteScoreInput): ComponentScore {
  const max = SCORE_WEIGHTS.comfort;
  const hasShade = i.shadeShare != null;
  const LIGHT = hasShade ? 6 : 8;
  const AMEN = hasShade ? 5 : 7;
  const SHADE = hasShade ? 4 : 0;
  let pts = 0;
  let measured = 0;
  const notes: string[] = [];
  if (i.litCoveragePct != null) {
    pts += LIGHT * clamp01(i.litCoveragePct / 80);
    measured += LIGHT;
  } else {
    pts += LIGHT / 2;
    notes.push('lighting not computed');
  }
  const a = i.amenitiesHas;
  if (a) {
    const raw = (a.drinking_water ? 3 : 0) + (a.bench ? 3 : 0) + (a.court || a.dog_park ? 1 : 0);
    pts += (raw / 7) * AMEN;
    measured += AMEN;
  } else {
    pts += AMEN / 2;
    notes.push('amenities not computed');
  }
  if (hasShade) {
    pts += SHADE * clamp01((i.shadeShare as number) / SHADE_CANOPY_MIN_SHARE);
    measured += SHADE;
  }
  return { points: round1(pts), max, coverage: measured / max, notes };
}

/**
 * Experience (10): green/park share (5; name-based proxy when unmeasured),
 * pleasant length 2-15 km (3), and a small fitness-stop bonus (≤2) —
 * a fitness station is an extra, never the goal (§2.5).
 */
export function scoreExperience(i: RouteScoreInput): ComponentScore {
  const max = SCORE_WEIGHTS.experience;
  const GREEN = 5;
  const LEN = 3;
  let pts = 0;
  let measured = 0;
  const notes: string[] = [];
  if (i.greenShare != null) {
    pts += GREEN * clamp01(i.greenShare / 0.6);
    measured += GREEN;
  } else if (i.parkRef || i.sourceTier === 'named_place') {
    pts += GREEN * 0.7;
    measured += GREEN / 2;
    notes.push('proxy: named park/promenade');
  } else {
    pts += GREEN / 2;
    notes.push('green share not computed');
  }
  const km = i.distanceKm;
  if (km != null && km > 0) {
    pts += km >= 2 && km <= 15 ? LEN : (km >= 1 && km < 2) || (km > 15 && km <= 25) ? LEN / 2 : 0;
    measured += LEN;
  } else {
    pts += LEN / 2;
  }
  if (i.hasFitnessStop) pts += 2;
  measured += 2; // the bonus is always decidable (known yes/no)
  return { points: round1(Math.min(max, pts)), max, coverage: measured / max, notes };
}
