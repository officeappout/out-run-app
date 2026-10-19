'use client';

import { Play, Pencil, Navigation } from 'lucide-react';
import { actionIconButtonClass } from './section-styles';

interface ParkActionBarProps {
  v2: boolean;
  ctaLabel: string;
  onStartWorkout: () => void;
  onSuggestEdit: () => void;
  onNavigate: () => void;
}

/** Fixed bottom action bar: start workout (primary) + suggest-edit + navigate. */
export default function ParkActionBar({ v2, ctaLabel, onStartWorkout, onSuggestEdit, onNavigate }: ParkActionBarProps) {
  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-gray-200/50 dark:border-gray-800/50 px-4 pt-3"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 12px))' }}
    >
      <div className="flex items-center gap-2" dir="rtl">
        {/* Start Workout — primary CTA. Extra me-2 (on top of the row's
            gap-2) separates it from the secondary icon buttons. */}
        <button
          onClick={onStartWorkout}
          className={
            v2
              ? 'me-2 flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-v2-cta text-[15.5px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.98]'
              : 'flex-1 me-2 text-white font-extrabold rounded-full active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-[15px]'
          }
          style={v2 ? undefined : { background: 'linear-gradient(to left, #0CF2E3, #00BAF7)', height: 44 }}
        >
          <Play size={18} fill="currentColor" />
          <span>{ctaLabel}</span>
        </button>

        {/* Suggest Edit */}
        <button
          onClick={onSuggestEdit}
          className={actionIconButtonClass(v2)}
          style={v2 ? undefined : { border: '0.5px solid #E0E9FF' }}
          title="עדכן פרטים"
        >
          <Pencil size={18} className={v2 ? 'text-v2-ink' : 'text-cyan-500'} />
        </button>

        {/* Navigate */}
        <button
          onClick={onNavigate}
          className={actionIconButtonClass(v2)}
          style={v2 ? undefined : { border: '0.5px solid #E0E9FF' }}
          title="ניווט"
        >
          <Navigation size={18} className={v2 ? 'text-v2-deep' : 'text-emerald-500'} />
        </button>
      </div>
    </div>
  );
}
