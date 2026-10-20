'use client';

/**
 * RouteOverviewCompactCard — the route generator's carousel card as the
 * COMPACT HEADER of the overview drawer (board M-5e; enable_home_v2 only):
 * name + DifficultyBolts · time · distance · finish · the journey strip ·
 * one button. Tapping the card opens the same drawer (RouteOverviewDrawer).
 * One gradient per screen: only the focused card's button is filled
 * ("התחל …"); the others are white "בחר את המסלול הזה" pills that open it.
 */

import { Play, ChevronLeft } from 'lucide-react';
import type { Route } from '@/features/parks/core/types/route.types';
import DifficultyBolts from '@/features/workout-engine/components/DifficultyBolts';
import { JourneyStrip, WorkoutOverviewHeader } from '@/components/ui/v2';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { ROUTE_CARD_WIDTH } from '../../../constants/routeCardSize';
import { journeyItemsFromLegs } from '../overview-legs';
import { ACTIVITY_LABEL, activityMinutes, buildRouteLegs, finishClock, initialRouteActivity } from './route-overview';

export interface RouteOverviewCompactCardProps {
  route: Route;
  /** The carousel's activity (falls back to the route's own). */
  activity?: string | null;
  isActive: boolean;
  /** Tap on the card (or the inactive card's button) → the drawer. */
  onOpen: () => void;
  /** The focused card's CTA → start (today's onSelect). */
  onStart: () => void;
  /** Start-experience "too far": the CTA shows `blockedLabel` and calls onBlocked instead. */
  blockedReason?: string | null;
  blockedLabel?: string;
  onBlocked?: (reason: string) => void;
  className?: string;
  /** enable_entry_whatnow_v1: inert `data-coach` targets (card / CTA) + the first-workout line. */
  coachId?: string;
  ctaCoachId?: string;
  footnote?: string | null;
}

export default function RouteOverviewCompactCard({
  route, activity, isActive, onOpen, onStart, blockedReason = null, blockedLabel, onBlocked, className = '', coachId, ctaCoachId, footnote,
}: RouteOverviewCompactCardProps) {
  const act = initialRouteActivity(route, activity);
  const min = activityMinutes(route.distance, act);
  const items = journeyItemsFromLegs(buildRouteLegs(route, act, null));
  const open = () => { hapticLight(); onOpen(); };
  const cta = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isActive) { open(); return; }
    if (blockedReason) { hapticLight(); onBlocked?.(blockedReason); return; }
    hapticMedium();
    onStart();
  };
  return (
    <div dir="rtl" data-coach={coachId} onClick={open} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
      className={`${ROUTE_CARD_WIDTH} shrink-0 cursor-pointer rounded-[22px] bg-white transition-all duration-300 ease-v2 ${
        isActive ? 'shadow-v2-float ring-2 ring-v2-accent scale-[1.02]' : 'shadow-v2-card opacity-90 scale-[0.97]'
      } ${className}`}
      style={{ padding: '12px 14px 14px' }}>
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate whitespace-nowrap text-[17px] font-black leading-tight !tracking-[-0.02em] text-v2-ink">
          {route.name?.trim() || 'סיבוב מעגלי'}
        </h3>
        <span className="inline-flex shrink-0 items-center rounded-full bg-v2-surface ring-1 ring-inset ring-v2-hairline" style={{ padding: '3px 9px' }}>
          <DifficultyBolts difficulty={route.difficulty} size="sm" />
        </span>
      </div>
      <div className="mt-0.5">
        <WorkoutOverviewHeader v2 title={null} meta={[
          { key: 'time', text: `${min} דק׳`, tone: 'primary' },
          { key: 'km', text: `${(route.distance ?? 0).toFixed(1)} ק״מ`, tone: 'secondary' },
          { key: 'finish', text: `מסיים ~${finishClock(Date.now(), min)}`, tone: 'secondary' },
        ]} />
      </div>
      <div className="mt-2.5">
        <JourneyStrip v2 variant="inset" items={items} />
      </div>
      <div className="mt-3">
        {isActive ? (
          <button type="button" data-coach={ctaCoachId} onClick={cta} aria-disabled={!!blockedReason}
            className={`flex h-[42px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-full text-[15px] font-extrabold transition-transform duration-150 ease-v2 active:scale-[0.97] ${
              blockedReason ? 'bg-v2-surface text-v2-muted ring-1 ring-inset ring-v2-hairline' : 'bg-v2-cta text-v2-on-cta shadow-v2-cta'
            }`}>
            <Play size={16} className={blockedReason ? undefined : 'fill-current'} />
            {blockedReason && blockedLabel ? blockedLabel : `התחל ${ACTIVITY_LABEL[act]}`}
          </button>
        ) : (
          <button type="button" onClick={cta}
            className="flex h-[42px] w-full items-center justify-center gap-1 whitespace-nowrap rounded-full bg-white text-[14px] font-extrabold text-v2-deep shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]">
            בחר את המסלול הזה <ChevronLeft size={15} />
          </button>
        )}
        {footnote && (
          <p className="mt-1.5 text-center text-[11.5px] leading-snug text-[#94a3b8]">{footnote}</p>
        )}
      </div>
    </div>
  );
}
