'use client';

/**
 * RouteQualityBadges — render component for the positive-only quality-
 * certificate badges. All the actual decision logic (thresholds, the
 * honesty rules) lives in route-quality-badges.service.ts, a pure JSX-free
 * sibling — see that file's own header for the full rationale.
 */
import type { Route } from '../types/route.types';
import { computeQualityBadges } from '../services/route-quality-badges.service';

// Neutral gray pill, distinct from RouteCardUnified's cyan "מומלץ" accent
// (that's an algorithmic recommendation; this is a data-derived fact) —
// same idiom as RouteDetailSheet's existing feature chips.
export const QUALITY_BADGE_CLASS = 'text-[10px] font-bold rounded-full bg-gray-100 text-gray-600 px-2 py-0.5';

interface RouteQualityBadgesProps {
  qualitySignals: Route['qualitySignals'] | undefined;
  className?: string;
  /**
   * Curated slim card: render ALL badges (no CARD_BADGE_CAP) in a single horizontally-scrollable row
   * instead of a wrapping, capped one. The card stays one row tall; the user scrolls for the rest.
   */
  scrollable?: boolean;
}

export default function RouteQualityBadges({ qualitySignals, className, scrollable = false }: RouteQualityBadgesProps) {
  const badges = computeQualityBadges(qualitySignals, scrollable ? Infinity : undefined);
  if (badges.length === 0) return null;
  if (scrollable) {
    return (
      <div
        className={`flex items-center gap-1.5 flex-nowrap overflow-x-auto overscroll-x-contain ${className || ''}`}
        style={{ touchAction: 'pan-x', scrollbarWidth: 'none' }}
      >
        {badges.map((b) => (
          <span key={b.key} className={`${QUALITY_BADGE_CLASS} shrink-0 whitespace-nowrap`}>{b.label}</span>
        ))}
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className || ''}`}>
      {badges.map((b) => (
        <span key={b.key} className={QUALITY_BADGE_CLASS}>{b.label}</span>
      ))}
    </div>
  );
}
