'use client';

/**
 * ExerciseImageCard — image-forward grid card for the redesigned library.
 *
 * Modeled on GroupCard.tsx's `compact` variant (the app's real "image fills
 * the card, dark bottom scrim carries overlaid text" pattern) — NOT on
 * EquipmentCard's מתקנים tile, whose fade is light and whose text sits below
 * the image rather than on it. 2-column grid, ~168px tall.
 *
 * Static thumbnail only (no autoplay preview video) — the whole card is the
 * tap target, so no separate play badge is needed.
 *
 * Muscle + level chips are white pills (border color #E0E9FF matches the
 * app's standard subtle-card-border token, same one FacilityCard's mobile
 * variant uses) rather than plain overlaid text — round 2 polish, per
 * David's reference to the facility-card amenity chips. The dark scrim is
 * now localized to just behind the name, not the whole lower half of the
 * card, since the chips carry their own contrast via their white background.
 */

import { Gauge, Play } from 'lucide-react';
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

function Pill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 bg-white/95 text-gray-700 text-[9px] font-bold px-2 py-1 rounded-full"
      style={{ border: '0.5px solid #E0E9FF' }}
    >
      {icon}
      {label}
    </span>
  );
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

      {/* ── Subtle scrim, localized behind the name only ── */}
      <div
        className="absolute inset-x-0 bottom-0 h-16"
        style={{
          background: 'linear-gradient(0deg, rgba(10,22,32,.55) 0%, rgba(10,22,32,0) 100%)',
        }}
      />

      {/* ── Muscle + level chips (top) ── */}
      <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between gap-1.5">
        {muscle ? (
          <Pill
            icon={
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/icons/muscles/male/${exercise.primaryMuscle ?? exercise.muscleGroups?.[0]}.svg`}
                alt=""
                className="w-2.5 h-2.5 object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            }
            label={muscle.he}
          />
        ) : <span />}
        <Pill icon={<Gauge size={10} />} label={`רמה ${level}`} />
      </div>

      {/* ── Name (bottom) ── */}
      <div className="absolute inset-x-0 bottom-0 p-3 text-start">
        <h3
          className="font-extrabold text-[14px] leading-tight text-white line-clamp-2"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,.4)' }}
        >
          {name}
        </h3>
      </div>
    </button>
  );
}
