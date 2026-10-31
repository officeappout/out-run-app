"use client";

import { useUiDir } from '@/lib/i18n/useUiDir';
import React from 'react';
import { Map, Zap, Users } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import { usePilotAhV1 } from '@/hooks/usePilotAhV1';

/**
 * Map UI top-level modes.
 *
 *   'idle'      — base map, no overlay drawer
 *   'discover'  — official-routes carousel + journey container
 *   'freeRun'   — three-step generated free-run flow
 *   'partners'  — partner finder (radar → overlay)
 *   'commute'   — A-to-B commute carousel (driven by RouteCarousel in
 *                 commute mode). Triggered by picking a generic Mapbox
 *                 address from search OR a Home/Work shortcut. The
 *                 header doesn't render a pill for this mode — entry is
 *                 always implicit (search/quick-action), exit is the
 *                 carousel's back chip.
 */
export type MapMode = 'idle' | 'discover' | 'freeRun' | 'partners' | 'commute';

interface MapModeHeaderProps {
  activeMode: MapMode;
  onModeChange: (mode: MapMode) => void;
  hasNearbyRoutes: boolean;
  /** Live partner count — appended to the "שותפים לאימון" pill when > 0 */
  partnerCount?: number;
}

const MODES = [
  { id: 'discover', labelKey: 'modes.discover', icon: Map, alwaysShow: false },
  { id: 'freeRun', labelKey: 'modes.freeRun', icon: Zap, alwaysShow: true },
  { id: 'partners', labelKey: 'modes.partners', icon: Users, alwaysShow: true },
] as const satisfies ReadonlyArray<{ id: MapMode; labelKey: string; icon: React.ElementType; alwaysShow: boolean }>;

const BRAND_CYAN = '#00E5FF';
/** AH28: fewer live partners nearby than this → no partners chip. */
export const MIN_PARTNERS_FOR_CHIP = 2;

export default function MapModeHeader({ activeMode, onModeChange, hasNearbyRoutes, partnerCount }: MapModeHeaderProps) {
  const t = useT(map);
  const { isRtl } = useUiDir();
  // enable_pilot_ah_v1 (AH28): the partners chip only with enough partners nearby (or while it is the active mode).
  const pilotAh = usePilotAhV1();
  const visibleModes = MODES.filter((m) => {
    if (m.id === 'partners' && pilotAh) return (partnerCount ?? 0) >= MIN_PARTNERS_FOR_CHIP || activeMode === 'partners';
    return m.alwaysShow || (m.id === 'discover' && hasNearbyRoutes);
  });

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide">
      {visibleModes.map(({ id, labelKey, icon: Icon }) => {
        const label = t(labelKey);
        const isActive = activeMode === id;
        const displayLabel =
          id === 'partners' && partnerCount != null && partnerCount > 0
            ? t('modes.withCount', { label, count: String(partnerCount) })
            : label;
        return (
          <button
            key={id}
            onClick={() => onModeChange(isActive ? 'idle' : id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all active:scale-95 shrink-0${isRtl ? '' : ' !px-3'} ${
              isActive
                ? 'text-white'
                : 'bg-white backdrop-blur-md text-gray-700 border border-gray-100 hover:bg-white'
            }`}
            style={
              isActive
                ? {
                    backgroundColor: BRAND_CYAN,
                    boxShadow: '0 10px 15px -3px rgba(0, 229, 255, 0.22), 0 4px 6px -2px rgba(0, 229, 255, 0.12)',
                  }
                : {
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                  }
            }
          >
            <Icon size={14} />
            {displayLabel}
          </button>
        );
      })}
    </div>
  );
}
