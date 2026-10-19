'use client';

import React from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { AXIS_LABEL, GROUP_CATEGORY_LABEL, type GroupAxis } from '@/app/community/_lib/community-constants';
import { timeWindowLabel } from '@/app/community/_lib/community-logic';
import type { LeaguesVM } from './leagues-vm';

// ── Axis chooser for the Groups tab. Reused by both City (שכונות/קבוצות)
// and Global (ערים/קבוצות) — each passes its own state + option set, since
// the two segments now offer different axes (see the 16.08.2026 IA-fix
// note on GroupAxis in _lib/community-constants.ts).
export function GroupAxisChooser({ vm, axis, setAxis, options }: { vm: LeaguesVM; axis: GroupAxis; setAxis: (a: GroupAxis) => void; options: GroupAxis[] }) {
  const {
    access,
    leaderboardCategory,
    leaderboardTimeWindow,
    leaderboardGender,
    axisMenuOpen,
    setAxisMenuOpen,
    setLeagueFilterSheetOpen,
  } = vm;
  return (
    <div className="flex items-center gap-2 mb-3" dir="rtl">
      <div className="relative flex-1">
        <button
          type="button"
          onClick={() => setAxisMenuOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={axisMenuOpen}
          className="w-full flex items-center justify-between rounded-v2-tile px-4 py-3 active:scale-[0.97] transition-transform ease-v2 border border-v2-hairline-cool"
          style={{ background: 'linear-gradient(135deg, #e8f9fe, #e9fdfb)' }}
        >
          <div className="text-right">
            <span className="text-sm font-black text-gray-900">
              בין {AXIS_LABEL[axis]}
            </span>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {axis === 'neighborhood' && access.cityName ? `ב${access.cityName} · ` : ''}
              לחץ להחלפת ציר
            </p>
          </div>
          <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform text-gray-500 ${axisMenuOpen ? 'rotate-180' : ''}`} />
        </button>

        {axisMenuOpen && (
          <div
            role="listbox"
            className="absolute z-20 top-full mt-1.5 w-full rounded-v2-tile bg-white shadow-v2-float overflow-hidden py-1"
          >
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={axis === opt}
                onClick={() => { setAxis(opt); setAxisMenuOpen(false); }}
                className={`w-full text-right px-4 py-3 text-sm font-bold transition-colors ${
                  axis === opt ? 'text-v2-deep bg-v2-tint' : 'text-v2-ink hover:bg-v2-surface'
                }`}
              >
                {AXIS_LABEL[opt]}
              </button>
            ))}
          </div>
        )}
      </div>

      <span
        className="flex-shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-[12.5px] font-bold text-v2-muted bg-v2-surface ring-1 ring-inset ring-v2-hairline"
      >
        מדד: <b className="text-gray-900">{GROUP_CATEGORY_LABEL[leaderboardCategory]}</b>
      </span>
      <span
        className="flex-shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-[12.5px] font-bold text-v2-ink bg-v2-surface ring-1 ring-inset ring-v2-hairline"
      >
        {timeWindowLabel(leaderboardTimeWindow)}
      </span>

      {/* פילטרים — same LeagueFilterSheet as the Individuals tab, driving
          the same shared leaderboardGender state; layers on top of the
          מדד/טווח already chosen. */}
      <button
        type="button"
        onClick={() => setLeagueFilterSheetOpen(true)}
        aria-label="פילטרים"
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ease-v2 ${
          leaderboardGender !== 'all' ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent' : 'bg-white text-v2-ink-2 ring-1 ring-inset ring-v2-pill-border'
        }`}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
