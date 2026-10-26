'use client';

/**
 * TimerCardExtras — pilot S5: a TIMED exercise's card (IsometricTimerCard) had no
 * swap and no exercise details, unlike the reps card. Same two affordances, in
 * the timer sheet: "החלפת תרגיל" (when the player allows a swap now) and
 * "פרטי התרגיל", which raises the sheet with the same ExerciseDetailContent
 * (scrolls inside, so the timer stays in view).
 */

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import ExerciseDetailContent from './ExerciseDetailContent';

export interface TimerCardExtrasProps {
  exerciseName: string;
  onSwap?: () => void;
  primaryMuscle: string | null;
  secondaryMuscles?: string[];
  cues?: string[];
  goal: string | null;
  equipment?: string | string[];
  workoutLocation?: string;
}

export default function TimerCardExtras({
  exerciseName, onSwap, primaryMuscle, secondaryMuscles, cues, goal, equipment, workoutLocation,
}: TimerCardExtrasProps) {
  const t = useT(player);
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3" style={{ fontFamily: 'var(--font-simpler)' }}>
      <div className="flex items-center justify-center gap-2">
        {onSwap && (
          <button
            type="button"
            onClick={onSwap}
            className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-4 active:scale-[0.97] transition-transform"
          >
            <img src="/assets/icons/ui/swap.svg" className="h-4 w-4" alt="" aria-hidden />
            <span className="text-sm font-bold text-slate-600">{t('wide.swap')}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={t('strength.details.toggleAria')}
          className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-600 active:scale-[0.97] transition-transform"
        >
          <span>{t('strength.details.toggle')}</span>
          <ChevronDown size={16} aria-hidden className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="-mx-6 mt-2 max-h-[45dvh] overflow-y-auto overscroll-contain" data-coach="player-how-to">
          <ExerciseDetailContent
            exerciseName={exerciseName}
            videoUrl={null}
            hideHeroVideo
            hideTitle
            primaryMuscle={primaryMuscle}
            secondaryMuscles={secondaryMuscles}
            cues={cues}
            goal={goal}
            equipment={typeof equipment === 'string' ? [equipment] : equipment}
            workoutLocation={workoutLocation}
          />
        </div>
      )}
    </div>
  );
}
