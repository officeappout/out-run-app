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
import { hasPersona } from '@/features/workout-engine/services/user-profile.utils';
import { useHomeV2 } from '@/features/home/context/HomeV2Context';
import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';

export interface AnchorLocationChipProps {
  value: LocationId;
  onSelect: (id: LocationId) => void;
}

export default function AnchorLocationChip({ value, onSelect }: AnchorLocationChipProps) {
  const [open, setOpen] = useState(false);
  // Persona gate: the 'service' (military) location is offered only to the military persona.
  const profile = useUserStore((s) => s.profile);
  const isMilitary = profile ? hasPersona(profile, 'military') : false;
  const options = LOCATION_OPTIONS.filter((o) => o.id !== 'service' || isMilitary);
  const current = options.find((o) => o.id === value) ?? options[0];
  const CurrentIcon = current.Icon;
  const v2 = useHomeV2();
  const t = useT(home);

  return (
    <div className="relative flex-shrink-0" dir="rtl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('builder.location.chipAria', { label: t(current.labelKey) })}
        className={`flex items-center gap-1.5 whitespace-nowrap bg-white dark:bg-slate-800 active:scale-[0.97] transition-transform ${v2 ? 'h-9 ps-3 pe-2.5' : 'px-2.5 py-1.5'}`}
        style={v2 ? { borderRadius: 999, boxShadow: '0 0 0 1px rgba(14,27,42,0.08)' } : { borderRadius: 10, border: '1px solid #E0E9FF' }}
      >
        <CurrentIcon size={15} className={v2 ? 'text-[#0284c7]' : 'text-[#00C9F2]'} />
        <span className={`text-[13px] ${v2 ? 'font-extrabold text-[#0e1419]' : 'font-bold text-gray-700'} dark:text-gray-200`}>{t(current.labelKey)}</span>
        <ChevronDown size={13} className="text-gray-400" />
      </button>

      {open && (
        <>
          {/* click-away */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div
            className={`absolute z-30 mt-1 left-0 min-w-[160px] overflow-hidden bg-white dark:bg-slate-800 ${v2 ? 'p-1.5' : 'shadow-lg'}`}
            style={
              v2
                ? { borderRadius: 18, boxShadow: '0 28px 56px -24px rgba(9,30,50,0.45), 0 0 0 1px rgba(14,27,42,0.06)' }
                : { borderRadius: 12, border: '1px solid #E0E9FF' }
            }
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
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-right transition-colors ${v2 ? 'rounded-[14px]' : ''} ${
                    isActive ? (v2 ? 'bg-[#eef8fc] dark:bg-slate-700' : 'bg-[#F0FBFF] dark:bg-slate-700') : ''
                  }`}
                >
                  <Icon size={16} className={isActive ? 'text-[#00C9F2]' : 'text-gray-400'} />
                  <span className="flex flex-col leading-tight">
                    <span className="text-[13px] font-bold text-gray-800 dark:text-gray-100">{t(o.labelKey)}</span>
                    <span className="text-[11px] text-gray-400">{t(o.subKey)}</span>
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
