'use client';

/**
 * "הצע לי מסלול" carousel over the map (board M-6i): a back button + "3
 * לולאות מכאן ל-6 × 400" pill, then up to 3 route cards (name + bolts ·
 * time · km · laps · the workout's strip). The chosen card is ringed and
 * says "נבחר"; the others "בחר". No gradient here — the drawer's CTA is the
 * screen's one.
 */

import { ArrowRight, Check, Route as RouteIcon } from 'lucide-react';
import { IconButton, JourneyStrip, type JourneyStripItem } from '@/components/ui/v2';
import DifficultyBolts from '@/features/workout-engine/components/DifficultyBolts';
import type { RouteSuggestion } from '../../lib/route-fit';
import { lapsLabel, routeKm, routeRunShape } from '../../lib/route-fit/distance-fit';
import { useT, type ReactTFunction } from '@/hooks/useT';
import { player, type PlayerKey } from '@/messages/ns/player';

export interface RunRouteSuggestCarouselProps {
  suggestions: readonly RouteSuggestion[];
  selectedId: string | null;
  onSelect: (s: RouteSuggestion) => void;
  onBack: () => void;
  /** "6 × 400" — the pill's workout name. */
  workoutLabel: string;
  minutes: number | null;
  journey: readonly JourneyStripItem[];
}

function pillText(n: number, label: string, allLoops: boolean, t: ReactTFunction<PlayerKey>): string {
  return allLoops ? t('run.overview.suggest.pillLoops', { n, label }) : t('run.overview.suggest.pillRoutes', { n, label });
}

export default function RunRouteSuggestCarousel({ suggestions, selectedId, onSelect, onBack, workoutLabel, minutes, journey }: RunRouteSuggestCarouselProps) {
  const t = useT(player);
  const allLoops = suggestions.every((s) => routeRunShape(s.route) === 'loop');
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[70]" dir="rtl" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
      <div className="pointer-events-auto flex items-center justify-between px-4">
        <IconButton aria-label={t('run.overview.suggest.back')} size={40} onClick={onBack}>
          <ArrowRight className="h-[18px] w-[18px] text-v2-ink" />
        </IconButton>
        {suggestions.length > 0 && (
          <span className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/95 px-3.5 text-[13px] font-extrabold text-v2-ink shadow-v2-ring">
            <RouteIcon size={15} className="text-v2-deep" aria-hidden />{pillText(suggestions.length, workoutLabel, allLoops, t)}
          </span>
        )}
        <span className="w-10" />
      </div>
      {suggestions.length > 0 && (
        <div className="pointer-events-auto mt-3 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-2.5 pt-1.5"
          style={{ scrollbarWidth: 'none', touchAction: 'pan-x' }}>
          {suggestions.map((s) => {
            const active = s.route.id === selectedId;
            const laps = s.score.fit.laps;
            return (
              <div key={s.route.id} role="button" tabIndex={0} onClick={() => onSelect(s)}
                onKeyDown={(e) => { if (e.key === 'Enter') onSelect(s); }}
                className={`w-[300px] shrink-0 snap-center cursor-pointer rounded-[22px] bg-white transition-all duration-200 ease-v2 ${active ? 'shadow-v2-float ring-2 ring-v2-accent' : 'shadow-v2-card'}`}
                style={{ padding: '12px 14px 14px' }}>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[17px] font-black !tracking-[-0.02em] text-v2-ink">{s.route.name?.trim() || t('run.overview.suggest.nameFallback')}</span>
                  <span className="inline-flex shrink-0 items-center rounded-full bg-v2-surface ring-1 ring-inset ring-v2-hairline" style={{ padding: '3px 9px' }}>
                    <DifficultyBolts difficulty={s.route.difficulty} size="sm" />
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-[13px]">
                  {minutes != null && <><span className="font-extrabold text-v2-ink-2">{t('run.overview.suggest.minutes', { min: String(minutes) })}</span><span className="text-v2-pill-border">·</span></>}
                  <span className="font-bold text-v2-muted">{t('run.overview.suggest.km', { km: routeKm(s.route).toFixed(1) })}</span>
                  {laps != null && <><span className="text-v2-pill-border">·</span><span className="font-bold text-v2-muted">{lapsLabel(laps)}</span></>}
                </div>
                <div className="mt-2.5"><JourneyStrip v2 variant="inset" items={journey} /></div>
                <div className="mt-3">
                  {active ? (
                    <div className="flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-v2-tint text-[13.5px] font-extrabold text-v2-deep ring-1 ring-inset ring-v2-accent/40">
                      <Check size={15} aria-hidden />{s.isGenerated ? t('run.overview.suggest.selected') : t('run.overview.suggest.selectedOfficial')}
                    </div>
                  ) : (
                    <button type="button" onClick={(e) => { e.stopPropagation(); onSelect(s); }}
                      className="h-[42px] w-full whitespace-nowrap rounded-full bg-white text-[14px] font-extrabold text-v2-deep shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]">
                      {t('run.overview.suggest.select')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
