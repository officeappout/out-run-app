"use client";

import React from 'react';
import { Map, Zap, Users } from 'lucide-react';

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

const MODES: Array<{ id: MapMode; label: string; icon: React.ElementType; alwaysShow: boolean }> = [
  { id: 'discover', label: 'גלה מסלולים', icon: Map, alwaysShow: false },
  { id: 'freeRun', label: 'אירובי חופשי', icon: Zap, alwaysShow: true },
  { id: 'partners', label: 'שותפים לאימון', icon: Users, alwaysShow: true },
];

const BRAND_CYAN = '#00E5FF';

export default function MapModeHeader({ activeMode, onModeChange, hasNearbyRoutes, partnerCount }: MapModeHeaderProps) {
  const visibleModes = MODES.filter(m => m.alwaysShow || (m.id === 'discover' && hasNearbyRoutes));

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide" dir="rtl">
      {visibleModes.map(({ id, label, icon: Icon }) => {
        const isActive = activeMode === id;
        const displayLabel =
          id === 'partners' && partnerCount != null && partnerCount > 0
            ? `${label} · ${partnerCount}`
            : label;
        return (
          <button
            key={id}
            onClick={() => onModeChange(isActive ? 'idle' : id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all active:scale-95 shrink-0 ${
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
