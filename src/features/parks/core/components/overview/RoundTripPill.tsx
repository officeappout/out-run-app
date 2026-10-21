'use client';

/**
 * RoundTripPill — the "הלוך וחזור" toggle under the overview header: the walk
 * to the route and back, added on top of the workout minutes (display only).
 * Moved from HybridOverviewScreen; output there is unchanged. The durable
 * preference (ROUTE_STOPS_ROUND_TRIP_KEY) is owned by the caller.
 */

import { ActivityGlyph } from '../hybrid/activity-icons';
import { HYBRID_WALK as WALK_LEG_COLOR } from '../hybrid/hybrid-colors';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';

const ACCENT = '#00ADEF';

export interface RoundTripPillProps {
  v2: boolean;
  on: boolean;
  /** Walk there + walk back, minutes. */
  walkMin: number;
  onToggle: () => void;
}

export default function RoundTripPill({ v2, on, walkMin, onToggle }: RoundTripPillProps) {
  const t = useT(map);
  const label = on
    ? t('overview.roundTrip.on', { min: String(walkMin) })
    : t('overview.roundTrip.off');
  return (
    <button
      type="button"
      dir="rtl"
      onClick={onToggle}
      aria-pressed={on}
      className={v2
        ? `mt-2 inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-extrabold transition-transform duration-150 ease-v2 active:scale-[0.97] ${
            on ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40' : 'bg-white text-v2-ink-2 shadow-v2-ring'
          }`
        : 'mt-1.5 inline-flex items-center gap-1.5 rounded-full text-[11.5px] font-bold active:scale-[0.97] transition-transform'}
      style={v2 ? undefined : {
        padding: '4px 10px',
        background: on ? `${ACCENT}14` : '#F3F4F6',
        border: `1px solid ${on ? ACCENT : 'transparent'}`,
        color: on ? '#0E7490' : '#6B7280',
      }}
    >
      {v2
        ? <span aria-hidden className="inline-flex shrink-0" style={{ color: WALK_LEG_COLOR }}><ActivityGlyph kind="aerobic" subtype="walking" className="w-[15px] h-[15px]" /></span>
        : <span aria-hidden>🚶</span>}
      {/* v2: the pill is whitespace-nowrap + max-w-full and the "on" label is wider
          than the header column on a phone — truncate inside the pill. */}
      {v2 ? <span className="min-w-0 truncate">{label}</span> : label}
    </button>
  );
}
