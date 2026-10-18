'use client';

import React from 'react';
import { Dumbbell, ChevronLeft } from 'lucide-react';
import { workoutCardLabel, type WorkoutCard } from '@/lib/ai/coach/protocol';

/** The workout card inside a Kelly bubble. Tapping opens the regular workout preview. */
export default function AiCoachWorkoutCard({ card, onOpen }: { card: WorkoutCard; onOpen: (card: WorkoutCard) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(card)}
      className="mt-2 w-full flex items-center gap-3 rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-3 text-right text-gray-900 transition-transform active:scale-[0.98]"
      aria-label={`פתח אימון: ${workoutCardLabel(card)}`}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-cyan-600 shadow-sm">
        <Dumbbell className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-black text-gray-900">{card.title}</span>
        <span className="block text-[12px] font-semibold text-gray-500">
          {card.minutes} דק׳ · {card.exerciseCount === 1 ? 'תרגיל אחד' : `${card.exerciseCount} תרגילים`}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-cyan-500 px-3 py-1.5 text-[12px] font-black text-white">
        פתח אימון
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
      </span>
    </button>
  );
}
