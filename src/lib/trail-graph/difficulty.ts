/**
 * trail-graph/difficulty.ts — route difficulty + star prior. Pure.
 *
 * Difficulty = NPS / Shenandoah rating  R = sqrt(2 × gain_ft × dist_mi)
 *   R < 50 easy · 50–100 medium · > 100 hard
 * then ONE technical bump (easy→medium, medium→hard) if any of:
 *   maxGrade50m > 15 % (open-country segments only — GLO-30 is a DSM, so
 *   grades inside built-up areas are often roofs) · sac_scale ≥ demanding_mountain_hiking ·
 *   mtb:scale ≥ 2 · tracktype grade4/5 · surface rock/scree
 * (each counted only when it covers ≥ TECH_MIN_M or ≥ TECH_MIN_SHARE of the route)
 * then the URBAN CAP: a route ≥ 80 % inside built-up areas is never 'hard'.
 *
 * Output uses the app's Route.difficulty enum 'easy'|'medium'|'hard' —
 * never 'moderate' (the historical bug; see route-collections/schemas.ts).
 */
import { SAC_RANK, mtbScaleNumber } from './tags';
import type { Difficulty, DifficultyBreakdown, StarBreakdown, TrailSegment } from './types';

export const NPS_EASY_MAX = 50;
export const NPS_MEDIUM_MAX = 100;
export const TECH_GRADE_PCT = 15;
export const TECH_MIN_M = 100;
export const TECH_MIN_SHARE = 0.05;
export const URBAN_CAP_SHARE = 0.8;

export function npsScore(gainM: number, distM: number): number {
  const gainFt = Math.max(0, gainM) * 3.28084;
  const distMi = Math.max(0, distM) / 1609.344;
  return Math.sqrt(2 * gainFt * distMi);
}

export function npsBucket(r: number): Difficulty {
  if (r < NPS_EASY_MAX) return 'easy';
  if (r <= NPS_MEDIUM_MAX) return 'medium';
  return 'hard';
}

const ORDER: Difficulty[] = ['easy', 'medium', 'hard'];
const bump = (d: Difficulty): Difficulty => ORDER[Math.min(2, ORDER.indexOf(d) + 1)];

export interface TechnicalInput {
  /** Route-level max sustained grade, %, or null when unknown. */
  maxGrade50mPct: number | null;
  segments: Array<Pick<TrailSegment, 'lengthM' | 'sacScale' | 'mtbScale' | 'tracktype' | 'surfaceRaw'>>;
}

export function technicalReasons(input: TechnicalInput): string[] {
  const total = input.segments.reduce((a, s) => a + s.lengthM, 0) || 1;
  const covers = (pred: (s: TechnicalInput['segments'][number]) => boolean) => {
    const L = input.segments.filter(pred).reduce((a, s) => a + s.lengthM, 0);
    return L >= TECH_MIN_M || L / total >= TECH_MIN_SHARE;
  };
  const reasons: string[] = [];
  if (input.maxGrade50mPct != null && input.maxGrade50mPct > TECH_GRADE_PCT) reasons.push(`maxGrade50m>${TECH_GRADE_PCT}%`);
  if (covers((s) => (SAC_RANK[s.sacScale ?? ''] ?? 0) >= 3)) reasons.push('sac_scale>=demanding');
  if (covers((s) => (mtbScaleNumber(s.mtbScale) ?? 0) >= 2)) reasons.push('mtb:scale>=2');
  if (covers((s) => s.tracktype === 'grade4' || s.tracktype === 'grade5')) reasons.push('tracktype grade4/5');
  if (covers((s) => s.surfaceRaw === 'rock' || s.surfaceRaw === 'scree' || s.surfaceRaw === 'bare_rock')) reasons.push('rock/scree');
  return reasons;
}

export function rateDifficulty(args: { gainM: number | null; distM: number; builtUpShare: number } & TechnicalInput): DifficultyBreakdown {
  const r = args.gainM == null ? null : npsScore(args.gainM, args.distM);
  // No DEM → rate on distance alone with zero gain (honest floor, flagged by npsScore=null).
  const base = npsBucket(r ?? 0);
  const technical = technicalReasons(args);
  let final = technical.length ? bump(base) : base;
  const urbanCapped = args.builtUpShare >= URBAN_CAP_SHARE && final === 'hard';
  if (urbanCapped) final = 'medium';
  return { npsScore: r == null ? null : Math.round(r * 10) / 10, base, technicalReasons: technical, urbanCapped, final };
}

/**
 * Star prior 0–5 (a starting point before real user ratings exist).
 * Weights (documented in docs/trails-pilot/TRAILS-PILOT-SHAAR-HANEGEV.md):
 *   provenance  0–2   official operator (ITC/KKL/RTG) + official name 2.0 ·
 *                     official operator, no name 1.5 · other OSM relation 1.0 ·
 *                     graph-generated 0.5
 *   scenery     0–1.5 0.5 × off-built-up share + 0.5 if a named natural
 *                     feature (spring/peak/valley/stream) within 300 m +
 *                     0.5 × green share (park/forest/wood/orchard)
 *   amenities   0–1   0.25 per distinct type within 100 m (drinking water,
 *                     bench/picnic, shelter, toilets, viewpoint), max 1
 *   composition 0–0.5 0.5 × off-road share (path/track/bridleway); −0.25 if
 *                     > 50 % residential streets
 * total rounded to 0.5, clamped to [0, 5].
 */
export interface StarInput {
  provenance: 'official_named' | 'official_unnamed' | 'osm_relation' | 'generated';
  offBuiltUpShare: number;
  nearNamedNature: boolean;
  greenShare: number;
  amenityTypes: number;
  offroadShare: number;
  residentialShare: number;
}

export function starPrior(i: StarInput): StarBreakdown {
  const provenance = { official_named: 2, official_unnamed: 1.5, osm_relation: 1, generated: 0.5 }[i.provenance];
  const scenery = 0.5 * clamp01(i.offBuiltUpShare) + (i.nearNamedNature ? 0.5 : 0) + 0.5 * clamp01(i.greenShare);
  const amenities = Math.min(1, 0.25 * Math.max(0, i.amenityTypes));
  const composition = Math.max(0, 0.5 * clamp01(i.offroadShare) - (i.residentialShare > 0.5 ? 0.25 : 0));
  const raw = provenance + scenery + amenities + composition;
  const total = Math.max(0, Math.min(5, Math.round(raw * 2) / 2));
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { provenance: r2(provenance), scenery: r2(scenery), amenities: r2(amenities), composition: r2(composition), total };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

export const OFFICIAL_OPERATORS = /(^|[;\s,])(itc|kkl|rtg|inpa)([;\s,]|$)|הוועדה לשבילי ישראל|קק"ל|קרן קיימת|רשות הטבע/i;

export function isOfficialOperator(operator: string | undefined | null): boolean {
  return OFFICIAL_OPERATORS.test(operator ?? '');
}
