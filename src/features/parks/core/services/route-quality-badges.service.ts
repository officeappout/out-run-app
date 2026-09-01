/**
 * route-quality-badges.service.ts — pure, JSX-free positive-only quality-
 * certificate badge logic, shared by RouteQualityBadges.tsx (the render
 * component) and its unit test. Split out because vitest.config.ts is
 * pure-logic-only (no React/JSX plugin) — see that config's own comment;
 * this mirrors the same pure-logic/render split already used throughout
 * this feature (route-comfort-tags.service.ts, decide-accuracy.ts).
 *
 * Core rule, not to be relaxed: a badge exists only when a signal is
 * computed AND a strength. Every other state — absent, 'unknown' (sparse
 * OSM coverage), 'no_coverage' (amenities never extracted for this city),
 * or computed-but-not-a-strength (e.g. confirmed unlit, or a real 0 count)
 * — produces no badge. A user must never see a false negative; every
 * signal here is a strength or it's silent, never a warning (that's a
 * scoring-layer concern, not a card concern). `crossing` is NEVER a
 * candidate here at all — a high crossing count is a negative signal
 * (filter/generator concern only, route-amenity-tagging.service.ts).
 *
 * CARD BADGE CAP (David-approved 01.09.2026): a card must never show a wall
 * of badges. Candidates are evaluated in a fixed priority order and the
 * result is capped at CARD_BADGE_CAP — lower-priority badges that would
 * have fired are simply dropped from the CARD, never padded to fill the
 * cap. The full, uncapped picture (incl. real zeros and "אין מידע") is the
 * admin panel's job (admin/authority/routes/[id]/edit/page.tsx's "תעודת
 * איכות" block reads qualitySignals directly, uncapped, by design).
 *
 * No city-specific branching for lighting/amenities: qualitySignals.lighting
 * is simply absent outside Haifa today, and qualitySignals.amenities is
 * 'no_coverage' outside cities the amenity ingester has run for — so the
 * same rules already produce silence there for free, extending
 * automatically once each signal computes elsewhere.
 *
 * Cut points are provisional (David, 01.09.2026) — tuned against a real
 * genuinePct histogram across all 176 routes (0-9%:44, 90-100%:64, long
 * tail between), not blind guesses. Kept as named exported constants for
 * easy re-tuning.
 */
import type { Route } from '../types/route.types';

export const GENUINE_BADGE_STRONG_PCT = 80;
export const GENUINE_BADGE_MODERATE_PCT = 60;

/** Card cap (David-approved 01.09.2026) — see this file's own header. */
export const CARD_BADGE_CAP = 3;

export type QualityBadgeKey =
  | 'composition'
  | 'lighting'
  | 'drinking_water'
  | 'fitness_station'
  | 'bench'
  | 'court'
  | 'dog_park';

export interface QualityBadgeInfo {
  key: QualityBadgeKey;
  label: string;
}

/**
 * Priority order (David-approved 01.09.2026): lighting > water > composition
 * > fitness > bench > court > dog_park. Evaluated top-to-bottom; the first
 * CARD_BADGE_CAP that actually fire are kept, in this order — a card never
 * shows, say, dog_park ahead of lighting just because dog_park happened to
 * be checked first.
 */
export function computeQualityBadges(qualitySignals: Route['qualitySignals'] | undefined): QualityBadgeInfo[] {
  const candidates: QualityBadgeInfo[] = [];
  const amenities = qualitySignals?.amenities;
  const amenitiesComputed = amenities?.status === 'computed';

  // 1. lighting
  if (qualitySignals?.lighting?.status === 'computed' && qualitySignals.lighting.isLit === true) {
    // Wording matches RouteDetailSheet's existing features.lit chip verbatim.
    candidates.push({ key: 'lighting', label: 'מואר' });
  }

  // 2. drinking_water
  if (amenitiesComputed && amenities!.has.drinking_water) {
    candidates.push({ key: 'drinking_water', label: 'ברזייה בדרך' });
  }

  // 3. composition
  const genuinePct = qualitySignals?.composition?.genuinePct;
  if (genuinePct !== undefined) {
    if (genuinePct >= GENUINE_BADGE_STRONG_PCT) candidates.push({ key: 'composition', label: 'מסלול טבעי' });
    else if (genuinePct >= GENUINE_BADGE_MODERATE_PCT) candidates.push({ key: 'composition', label: 'רוב שביל ייעודי' });
    // below GENUINE_BADGE_MODERATE_PCT: silent — not a defect, just not a highlight.
  }

  // 4. fitness_station
  if (amenitiesComputed && amenities!.has.fitness_station) {
    candidates.push({ key: 'fitness_station', label: 'מתקן כושר' });
  }

  // 5. bench
  if (amenitiesComputed && amenities!.has.bench) {
    candidates.push({ key: 'bench', label: 'ספסלים' });
  }

  // 6. court
  if (amenitiesComputed && amenities!.has.court) {
    candidates.push({ key: 'court', label: 'מגרש ספורט' });
  }

  // 7. dog_park — label matches ROUTE_FEATURE_TAG_LABELS.dog_friendly verbatim
  //    (route.types.ts) for consistency with the existing manual tag's wording.
  if (amenitiesComputed && amenities!.has.dog_park) {
    candidates.push({ key: 'dog_park', label: 'ידידותי לכלבים 🐕' });
  }

  return candidates.slice(0, CARD_BADGE_CAP);
}
