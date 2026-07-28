'use client';

/**
 * AnchorLocationChip (R Track 1) — compact location control next to the anchor title.
 *
 * Values are REUSED from the workout builder's picker (`LOCATION_OPTIONS` /
 * `LocationId` in `WorkoutBuilderSheet`) so park/gym/home stay a single source of
 * truth. Only the compact square+popover *form* is new — the existing pickers are
 * full-width sheet grids, none of which fit beside a title.
 *
 * Pure presentational: it reports the chosen location upward; StatsOverview owns
 * persisting it (sessionStorage `currentWorkoutLocation`) and bumping the
 * regeneration signal.
 */

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { LOCATION_OPTIONS, type LocationId } from './WorkoutBuilderSheet';
import { useUserStore } from '@/features/user';
import { mapPersonaIdToLifestylePersona } from '@/features/workout-engine/services/user-profile.utils';

export interface AnchorLocationChipProps {
  value: LocationId;
  onSelect: (id: LocationId) => void;
}

export default function AnchorLocationChip({ value, onSelect }: AnchorLocationChipProps) {
  const [open, setOpen] = useState(false);
  // Persona gate: the 'service' (military) location is offered only to reservist / soldier.
  const profile = useUserStore((s) => s.profile);
  const persona = profile ? mapPersonaIdToLifestylePersona(profile) : null;
  const isMilitary = persona === 'reservist' || persona === 'active_soldier';
  const options = LOCATION_OPTIONS.filter((o) => o.id !== 'service' || isMilitary);
  const current = options.find((o) => o.id === value) ?? options[0];
  const CurrentIcon = current.Icon;

  return (
    <div className="relative flex-shrink-0" dir="rtl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`מיקום האימון: ${current.label}`}
        className="flex items-center gap-1.5 bg-white dark:bg-slate-800 px-2.5 py-1.5 active:scale-[0.98] transition-transform"
        style={{ borderRadius: 10, border: '1px solid #E0E9FF' }}
      >
        <CurrentIcon size={15} className="text-[#00C9F2]" />
        <span className="text-[13px] font-bold text-gray-700 dark:text-gray-200">{current.label}</span>
        <ChevronDown size={13} className="text-gray-400" />
      </button>

      {open && (
        <>
          {/* click-away */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div
            className="absolute z-30 mt-1 left-0 min-w-[160px] overflow-hidden bg-white dark:bg-slate-800 shadow-lg"
            style={{ borderRadius: 12, border: '1px solid #E0E9FF' }}
          >
            {options.map((o) => {
              const Icon = o.Icon;
              const isActive = o.id === value;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (o.id !== value) onSelect(o.id);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-right transition-colors ${
                    isActive ? 'bg-[#F0FBFF] dark:bg-slate-700' : ''
                  }`}
                >
                  <Icon size={16} className={isActive ? 'text-[#00C9F2]' : 'text-gray-400'} />
                  <span className="flex flex-col leading-tight">
                    <span className="text-[13px] font-bold text-gray-800 dark:text-gray-100">{o.label}</span>
                    <span className="text-[11px] text-gray-400">{o.sub}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
