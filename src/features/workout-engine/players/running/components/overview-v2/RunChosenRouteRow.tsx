'use client';

/**
 * "המסלול שבחרת" — the first row of the run overview's axis once a route is
 * chosen (boards M-6f / 6g / 6i): an accent node + a card with the route's
 * name, length · laps · lit, how far it is, "הצג במפה" and "בלי מסלול".
 * The card opens to the route's details (board M-5b content: lighting,
 * dedicated path, ascent, calories for this workout, points along the route).
 * The workout legs below stay workout-only.
 */

import { useState } from 'react';
import { ChevronDown, Map as MapIcon, MapPin, Route as RouteIcon } from 'lucide-react';
import type { Route } from '@/features/parks/core/types/route.types';
import { ACCENT, Rail } from '@/features/parks/core/components/overview/axis/AxisParts';
import RouteLegDetail from '@/features/parks/core/components/overview/route/RouteLegDetail';
import type { RouteChoiceView } from '../../utils/run-overview/run-route-choice';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';

export interface RunChosenRouteRowProps {
  route: Route;
  view: RouteChoiceView;
  calories: number;
  /** Colour the spine blends into below the node. */
  nextColor: string;
  onShowOnMap?: () => void;
  onClear?: () => void;
}

export default function RunChosenRouteRow({ route, view, calories, nextColor, onShowOnMap, onClear }: RunChosenRouteRowProps) {
  const t = useT(player);
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-stretch gap-3">
      <div className="relative flex w-11 shrink-0 flex-col items-center">
        <Rail from={ACCENT} to={nextColor} top={22} bottom={-20} />
        <div className="relative z-[1] grid h-11 w-11 place-items-center rounded-full text-white"
          style={{ background: ACCENT, border: '3px solid #fff', boxShadow: `0 4px 12px ${ACCENT}66` }}>
          <RouteIcon size={22} strokeWidth={2.4} aria-hidden />
        </div>
      </div>
      <div className="relative mb-3 min-w-0 flex-1 overflow-hidden rounded-[20px] bg-white px-3 pb-3 pt-2.5 shadow-v2-card">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="flex w-full items-center gap-2.5 text-start transition-transform duration-150 ease-v2 active:scale-[0.98]">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1.5">
              <span className="whitespace-nowrap text-[12px] font-extrabold text-v2-deep">{t('run.overview.chosen.title')}</span>
              {view.accessText && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-extrabold text-v2-muted">
                  {view.accessText}<MapPin size={12} aria-hidden />
                </span>
              )}
            </div>
            <div className="truncate whitespace-nowrap text-[15px] font-black text-v2-ink">{view.name}</div>
            <div className="flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-bold text-v2-muted">
              {view.meta.map((m, i) => (
                <span key={m} className="inline-flex items-center gap-1.5">
                  {i > 0 && <span className="text-v2-pill-border">·</span>}{m}
                </span>
              ))}
            </div>
          </div>
          <ChevronDown size={16} className="shrink-0 text-v2-muted" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
        </button>
        <div className="mt-2.5 flex gap-2">
          {onShowOnMap && (
            <button type="button" onClick={onShowOnMap}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-white text-[13px] font-extrabold text-v2-deep shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]">
              <MapIcon size={15} aria-hidden />{t('run.overview.chosen.showOnMap')}
            </button>
          )}
          {onClear && (
            <button type="button" onClick={onClear}
              className="h-9 whitespace-nowrap rounded-full px-3.5 text-[13px] font-extrabold text-v2-muted transition-transform duration-150 ease-v2 active:scale-[0.97]">
              {t('run.overview.chosen.clear')}
            </button>
          )}
        </div>
        {open && (
          <div className="mt-2.5 border-t border-[#e6edf2] pt-2.5">
            <RouteLegDetail route={route} calories={calories} />
          </div>
        )}
      </div>
    </div>
  );
}
