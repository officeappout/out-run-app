'use client';

/**
 * ExerciseImageCard — image-forward grid card for the redesigned library.
 *
 * Modeled on GroupCard.tsx's `compact` variant (the app's real "image fills
 * the card, dark bottom scrim carries overlaid text" pattern) — NOT on
 * EquipmentCard's מתקנים tile, whose fade is light and whose text sits below
 * the image rather than on it. 2-column grid, ~168px tall.
 *
 * Static thumbnail only (no autoplay preview video) — the ▶ badge is a tap
 * affordance, matching the facility-card visual model and keeping a 2-col
 * grid of many cards light.
 */

import { Play } from 'lucide-react';
import { Exercise, getLocalizedText } from '../../core/exercise.types';
import { resolveExerciseLevel } from '../hooks/useExerciseLibraryFilters';
import { useExerciseLibraryStore } from '../store/useExerciseLibraryStore';
import {
  pickPrimaryMuscle,
  pickThumbnailUrl,
} from '../utils/card-media.utils';

interface ExerciseImageCardProps {
  exercise: Exercise;
  onClick: () => void;
}

export default function ExerciseImageCard({ exercise, onClick }: ExerciseImageCardProps) {
  const filterLocation = useExerciseLibraryStore((s) => s.filters.location);
  const name = getLocalizedText(exercise.name);
  const muscle = pickPrimaryMuscle(exercise);
  const thumbnailUrl = pickThumbnailUrl(exercise, filterLocation);
  const level = resolveExerciseLevel(exercise);

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative h-[168px] rounded-[18px] overflow-hidden shadow-sm text-start active:scale-[0.98] transition-transform"
      dir="rtl"
    >
      {/* ── Background: thumbnail or branded gradient fallback ── */}
      {thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'linear-gradient(160deg, #2CE0C0, #20C6D6 55%, #2AA3E8)' }}
        >
          {muscle ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/icons/muscles/male/${exercise.primaryMuscle ?? exercise.muscleGroups?.[0]}.svg`}
              alt=""
              className="w-10 h-10 opacity-70 [filter:brightness(0)_invert(1)]"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <Play className="w-9 h-9 text-white/70" fill="currentColor" />
          )}
        </div>
      )}

      {/* ── Dark bottom scrim ── */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(0deg, rgba(10,22,32,.85) 8%, rgba(10,22,32,.05) 48%)',
        }}
      />

      {/* ── Muscle tag (top-start) ── */}
      {muscle && (
        <span className="absolute top-2.5 start-2.5 bg-white/92 text-cyan-700 text-[9px] font-extrabold px-2.5 py-1 rounded-full">
          {muscle.he}
        </span>
      )}

      {/* ── Play affordance (top-end) ── */}
      <span className="absolute top-2.5 end-2.5 w-[26px] h-[26px] rounded-full bg-white/90 flex items-center justify-center">
        <Play className="w-3 h-3 text-cyan-700" fill="currentColor" />
      </span>

      {/* ── Name + level (bottom) ── */}
      <div className="absolute inset-x-0 bottom-0 p-3 text-start">
        <h3
          className="font-extrabold text-[14px] leading-tight text-white line-clamp-2"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,.4)' }}
        >
          {name}
        </h3>
        <p className="text-[10px] text-white/90 mt-0.5">רמה {level}</p>
      </div>
    </button>
  );
}
