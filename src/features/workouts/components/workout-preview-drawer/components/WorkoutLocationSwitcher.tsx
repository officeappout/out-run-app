'use client';

/**
 * WorkoutLocationSwitcher — workout-level "swap all → <location>" control.
 *
 * The bulk sibling of the per-exercise MasterExerciseView location switcher: same
 * home/park/street choices, applied to the WHOLE workout in one tap via swapAll. Only
 * mounted behind SWAP_ALL_ENABLED. Shows a lightweight skeleton/pulse while the
 * cascade recomputes.
 */

import { Home, Trees, MapPin } from 'lucide-react';
import type { ExecutionLocation } from '@/features/content/exercises';

const OPTIONS: { value: ExecutionLocation; label: string; Icon: typeof Home }[] = [
  { value: 'home', label: 'בית', Icon: Home },
  { value: 'park', label: 'פארק', Icon: Trees },
  { value: 'street', label: 'רחוב', Icon: MapPin },
];

interface WorkoutLocationSwitcherProps {
  currentLocation: ExecutionLocation;
  isSwapping: boolean;
  onSwap: (value: ExecutionLocation) => void;
}

export default function WorkoutLocationSwitcher({
  currentLocation,
  isSwapping,
  onSwap,
}: WorkoutLocationSwitcherProps) {
  return (
    <div dir="rtl" className="mb-4">
      <div className="text-xs font-semibold text-slate-500 mb-1.5">איפה מתאמנים?</div>
      <div className="flex gap-2">
        {OPTIONS.map(({ value, label, Icon }) => {
          const active = value === currentLocation;
          return (
            <button
              key={value}
              type="button"
              disabled={isSwapping || active}
              onClick={() => onSwap(value)}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${
                active
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300 disabled:opacity-50'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          );
        })}
      </div>
      {isSwapping && (
        <div className="mt-2 text-xs text-cyan-600 animate-pulse">מחליף את כל התרגילים למיקום החדש…</div>
      )}
    </div>
  );
}
