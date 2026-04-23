'use client';

/**
 * MuscleGroupChips — horizontal scroll of muscle filters.
 *
 * Each chip toggles a muscle in the library store. SVGs are sourced from
 * `/public/icons/muscles/male/` (already used elsewhere in the app).
 */

import { useMemo } from 'react';
import { useExerciseLibraryStore } from '../store/useExerciseLibraryStore';
import { MUSCLE_GROUP_LABELS, type MuscleGroup } from '../../core/exercise.types';

const PRIMARY_MUSCLES: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'core',
  'abs',
  'glutes',
  'quads',
  'hamstrings',
  'calves',
  'full_body',
  'cardio',
];

function muscleIconPath(m: MuscleGroup): string {
  return `/icons/muscles/male/${m}.svg`;
}

export default function MuscleGroupChips() {
  const selected = useExerciseLibraryStore((s) => s.filters.muscles);
  const toggle = useExerciseLibraryStore((s) => s.toggleMuscle);

  const items = useMemo(
    () => PRIMARY_MUSCLES.map((m) => ({ id: m, label: MUSCLE_GROUP_LABELS[m]?.he ?? m, icon: muscleIconPath(m) })),
    [],
  );

  return (
    <div className="overflow-x-auto scrollbar-hide -mx-4 px-4" dir="rtl">
      <div className="flex gap-2 pb-1">
        {items.map((m) => {
          const isActive = selected.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => toggle(m.id)}
              className={`flex flex-col items-center gap-1 flex-shrink-0 px-3 py-2 rounded-2xl border transition-all min-w-[64px] ${
                isActive
                  ? 'bg-primary/10 border-primary text-primary'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.icon}
                alt=""
                className="w-7 h-7 object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                }}
              />
              <span className="text-[10px] font-semibold whitespace-nowrap">
                {m.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
