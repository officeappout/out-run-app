/**
 * Route option tags (מתקן כושר / מואר / ברזייה / שביל ייעודי % / מוצל %).
 * Pure. Positive-only and data-only, like route-quality-badges: a tag shows
 * when its signal was measured AND is a strength — never a guess, never a
 * "0%". Generated A→B routes usually carry none of these signals today, so
 * most cards show fewer tags (or none) until the data exists for them.
 */
import type { Route } from '../types/route.types';
import { isRouteLitVerified, GENUINE_BADGE_MODERATE_PCT } from '../services/route-quality-badges.service';
import { findAmenityMatchesForRoute } from '../services/route-amenity-tagging.service';
import { shadeTagPct } from '@/lib/route-shade-view';
import type { LatLng } from './types';

export type PlannerTagKey = 'fitness' | 'lit' | 'water' | 'composition' | 'shade';

export interface PlannerTag {
  key: PlannerTagKey;
  /** % for composition / shade. */
  pct?: number;
}

export const PLANNER_TAG_CAP = 3;

export interface TagContext {
  /** The option stops at a fitness park (true by construction for via-park options). */
  viaFitnessPark?: boolean;
  /** Known drinking-water points (e.g. from facilities). Empty / absent = no fountain tag from here. */
  fountains?: LatLng[];
}

/**
 * Drinking-water points from facilities: parks whose record says they have
 * water (amenities.hasWater). Records without the field add nothing.
 */
export function fountainPoints(
  parks: Array<{ location?: { lat?: number | null; lng?: number | null } | null; amenities?: { hasWater?: boolean } | null }>,
): LatLng[] {
  const out: LatLng[] = [];
  for (const p of parks) {
    const lat = p.location?.lat, lng = p.location?.lng;
    if (p.amenities?.hasWater === true && typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
      out.push({ lat, lng });
    }
  }
  return out;
}

function hasFountainOnPath(route: Pick<Route, 'path'>, fountains: LatLng[] | undefined): boolean {
  if (!fountains?.length || !route.path?.length) return false;
  const amenities = fountains.map((f, i) => ({ id: `f${i}`, category: 'drinking_water' as const, location: f }));
  return findAmenityMatchesForRoute(route.path, amenities).length > 0;
}

export function deriveRouteTags(
  route: Pick<Route, 'path' | 'qualitySignals' | 'shadeInfo'>,
  ctx: TagContext = {},
  cap: number = PLANNER_TAG_CAP,
): PlannerTag[] {
  const tags: PlannerTag[] = [];
  const amenities = route.qualitySignals?.amenities;
  const computed = amenities?.status === 'computed';

  if (ctx.viaFitnessPark || (computed && amenities!.has.fitness_station)) tags.push({ key: 'fitness' });
  if (isRouteLitVerified(route)) tags.push({ key: 'lit' });
  if ((computed && amenities!.has.drinking_water) || hasFountainOnPath(route, ctx.fountains)) tags.push({ key: 'water' });

  const genuine = route.qualitySignals?.composition?.genuinePct;
  if (typeof genuine === 'number' && Number.isFinite(genuine) && genuine >= GENUINE_BADGE_MODERATE_PCT) {
    tags.push({ key: 'composition', pct: Math.round(genuine) });
  }

  const shade = shadeTagPct(route.shadeInfo);
  if (shade != null) tags.push({ key: 'shade', pct: shade });

  return tags.slice(0, cap);
}
