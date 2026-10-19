'use client';

/**
 * The run overview's sticky CTA row (boards M-6a / 6c / 6i):
 *   free      — "התחל אימון" (from here, free GPS) + "הצע לי מסלול"
 *   searching — a short "מחפש מסלולים…" line above the same row
 *   none      — "לא מצאנו מסלול מתאים קרוב — אפשר לרוץ מכאן" + "התחל אימון" / "בחר במפה"
 *   route     — "התחל אימון במסלול" + "בלי מסלול"
 * One gradient (the start); the other button is a white pill.
 */

import { Loader2, Map as MapIcon, Route as RouteIcon } from 'lucide-react';
import OverviewStartButton from '@/features/parks/core/components/overview/OverviewStartButton';
import OverviewSecondaryButton from '@/features/parks/core/components/overview/OverviewSecondaryButton';

export type RunCtaMode = 'free' | 'searching' | 'none' | 'route';

export interface RunOverviewCtaProps {
  mode: RunCtaMode;
  onStart: () => void;
  onStartOnRoute?: () => void;
  onSuggest?: () => void;
  onClearRoute?: () => void;
  onPickOnMap?: () => void;
}

function Notice({ children, spin = false }: { children: string; spin?: boolean }) {
  const Icon = spin ? Loader2 : RouteIcon;
  return (
    <div className="mb-2.5 flex items-center gap-2 rounded-2xl bg-white px-3 py-2.5 shadow-v2-ring">
      <Icon size={16} className={`shrink-0 text-v2-muted ${spin ? 'animate-spin' : ''}`} aria-hidden />
      <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[12.5px] font-bold text-v2-ink-2">{children}</span>
    </div>
  );
}

export default function RunOverviewCta({ mode, onStart, onStartOnRoute, onSuggest, onClearRoute, onPickOnMap }: RunOverviewCtaProps) {
  const routeMode = mode === 'route' && !!onStartOnRoute;
  const primary = routeMode
    ? <OverviewStartButton v2 label="התחל אימון במסלול" ariaLabel="התחל אימון במסלול" onClick={onStartOnRoute!} />
    : <OverviewStartButton v2 label="התחל אימון" ariaLabel="התחל אימון" onClick={onStart} />;

  let secondary: JSX.Element | null = null;
  if (routeMode && onClearRoute) secondary = <OverviewSecondaryButton label="בלי מסלול" onClick={onClearRoute} />;
  else if (mode === 'none' && onPickOnMap) secondary = <OverviewSecondaryButton label="בחר במפה" icon={<MapIcon size={16} aria-hidden />} onClick={onPickOnMap} />;
  else if ((mode === 'free' || mode === 'searching') && onSuggest) {
    secondary = <OverviewSecondaryButton label="הצע לי מסלול" icon={<RouteIcon size={16} aria-hidden />} onClick={onSuggest} />;
  }

  return (
    <div>
      {mode === 'searching' && <Notice spin>מחפש מסלולים מכאן…</Notice>}
      {mode === 'none' && <Notice>לא מצאנו מסלול מתאים קרוב — אפשר לרוץ מכאן</Notice>}
      <div className="flex gap-2">
        <div className="min-w-0" style={{ flex: 1.5 }}>{primary}</div>
        {secondary && <div className="min-w-0" style={{ flex: 1 }}>{secondary}</div>}
      </div>
    </div>
  );
}
