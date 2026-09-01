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
 * OSM coverage), or computed-but-not-a-strength (e.g. confirmed unlit) —
 * produces no badge. A user must never see a false negative; composition
 * is a strength or it's silent, never a warning about high sidewalk share
 * (that's a scoring-layer concern, not a card concern).
 *
 * No city-specific branching for lighting: qualitySignals.lighting is
 * simply absent outside Haifa today, so the single "computed && isLit"
 * rule already produces silence there for free — the same rule extends
 * automatically once lighting computes elsewhere.
 *
 * Cut points are provisional (David, 01.09.2026) — tuned against a real
 * genuinePct histogram across all 176 routes (0-9%:44, 90-100%:64, long
 * tail between), not blind guesses. Kept as named exported constants for
 * easy re-tuning.
 */
import type { Route } from '../types/route.types';

export const GENUINE_BADGE_STRONG_PCT = 80;
export const GENUINE_BADGE_MODERATE_PCT = 60;

export interface QualityBadgeInfo {
  key: 'composition' | 'lighting';
  label: string;
}

export function computeQualityBadges(qualitySignals: Route['qualitySignals'] | undefined): QualityBadgeInfo[] {
  const badges: QualityBadgeInfo[] = [];

  const genuinePct = qualitySignals?.composition?.genuinePct;
  if (genuinePct !== undefined) {
    if (genuinePct >= GENUINE_BADGE_STRONG_PCT) badges.push({ key: 'composition', label: 'מסלול טבעי' });
    else if (genuinePct >= GENUINE_BADGE_MODERATE_PCT) badges.push({ key: 'composition', label: 'רוב שביל ייעודי' });
    // below GENUINE_BADGE_MODERATE_PCT: silent — not a defect, just not a highlight.
  }

  if (qualitySignals?.lighting?.status === 'computed' && qualitySignals.lighting.isLit === true) {
    // Wording matches RouteDetailSheet's existing features.lit chip verbatim.
    badges.push({ key: 'lighting', label: 'מואר' });
  }

  return badges;
}
