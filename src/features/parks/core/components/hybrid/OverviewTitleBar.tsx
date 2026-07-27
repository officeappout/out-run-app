'use client';

/**
 * OverviewTitleBar — the thin blue "מבט על אימון" bar that replaces the folded top
 * chrome (AppHeader nav-bar + FloatingSearchBar + MapModeHeader pills) while the
 * hybrid overview drawer (HybridOverviewScreen) is up. Route-preview pattern
 * (Moovit/Waze), gated by MAP_OVERVIEW_CHROME_V1 and rendered ONLY in the overview
 * step by DiscoverLayer.
 *
 * Layout: top of screen, full width, RTL, z-[70] — the SAME tier as the search bar
 * it replaces (the two are mutually exclusive, never both mounted). Height matches
 * the AppHeader overlay band (~52px) + the top safe-area inset. Back button uses
 * ArrowRight (RTL "back" points right — same glyph the overview drawer uses).
 */

import { ArrowRight } from 'lucide-react';

// Same accent as HybridOverviewScreen (ACCENT) / the running out-cyan token — no new hex.
const OVERVIEW_BLUE = '#00ADEF';

interface Props {
  /** Workout name shown next to the eyebrow (the selected slot title, e.g. "ריצה + כוח"). */
  title: string;
  /** Back / close — reuse the SAME handler DiscoverLayer passes to HybridOverviewScreen.onBack. */
  onBack: () => void;
}

export default function OverviewTitleBar({ title, onBack }: Props) {
  return (
    <div
      className="absolute left-0 right-0 z-[70] pointer-events-auto"
      style={{
        top: 0,
        paddingTop: 'env(safe-area-inset-top, 0px)',
        background: OVERVIEW_BLUE,
        boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
      }}
      dir="rtl"
    >
      <div className="h-[52px] px-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="חזרה"
          className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full text-white active:scale-95 transition-transform"
        >
          <ArrowRight size={24} />
        </button>
        <div className="min-w-0 flex flex-col justify-center leading-tight">
          <span className="text-white/85 text-[11px] font-semibold">מבט על אימון</span>
          {title ? (
            <span className="text-white text-[15px] font-extrabold truncate">{title}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
