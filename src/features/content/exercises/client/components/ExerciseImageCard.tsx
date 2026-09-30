'use client';

/**
 * ExerciseImageCard — image-forward grid card for the redesigned library.
 *
 * Modeled on GroupCard.tsx's `compact` variant (the app's real "image fills
 * the card, bottom fade carries overlaid text" pattern) — NOT on
 * EquipmentCard's מתקנים tile, whose text sits below the image rather than
 * on it. 2-column grid, ~168px tall.
 *
 * Static thumbnail only (no autoplay preview video) — the whole card is the
 * tap target, so no separate play badge is needed.
 *
 * Bottom fade is WHITE with BLACK text (round 4, #1 — corrects rounds 2-3's
 * dark scrim + white text), matching the app's light theme. Muscle + level
 * chips are white pills (border color #E0E9FF matches the app's standard
 * subtle-card-border token, same one FacilityCard's mobile variant uses).
 *
 * Image resolves against the active location filter, defaulting to 'park'
 * when none is set (round 3, #1), with a multi-tier fallback across every
 * execution method before giving up to the gradient (round 4, #9) — see
 * card-media.utils.ts's pickThumbnailUrl for the full chain.
 *
 * Level pill only renders when resolveCardLevel finds a single unambiguous
 * level — domain-level by default, or the selected skill's level when a
 * skill program is part of the active track filter (round 4, #10). No fake
 * numbers.
 */

import { useMemo, useState } from 'react';
import { Gauge, Play } from 'lucide-react';
import { Exercise, getLocalizedText } from '../../core/exercise.types';
import { resolveCardLevel } from '../hooks/useExerciseLibraryFilters';
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
  const levelsByProgram = useExerciseLibraryStore((s) => s.filters.levelsByProgram);
  const allPrograms = useExerciseLibraryStore((s) => s.allPrograms);
  // Object.keys() would create a new array every render if computed inline
  // in the selector above — memoized so it only changes when the filter
  // object itself actually changes (levelsByProgram is replaced wholesale
  // by setLevelsByProgram, never mutated in place).
  const activeProgramIds = useMemo(() => Object.keys(levelsByProgram), [levelsByProgram]);
  const name = getLocalizedText(exercise.name);
  const muscle = pickPrimaryMuscle(exercise);
  const thumbnailUrl = pickThumbnailUrl(exercise, filterLocation);
  const level = resolveCardLevel(exercise, activeProgramIds, allPrograms);
  // A resolved URL can still 404 (e.g. Bunny hasn't finished encoding a
  // thumbnail yet) — fall back to the branded gradient instead of a
  // broken-image icon.
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = thumbnailUrl && !imgFailed;

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative h-[168px] rounded-[18px] overflow-hidden shadow-sm text-start active:scale-[0.98] transition-transform"
      dir="rtl"
    >
      {/* ── Background: thumbnail or branded gradient fallback ── */}
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          onError={() => setImgFailed(true)}
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

      {/* ── White bottom fade, behind the name — raised taller (round 7, #2)
           so the black text sits on more solid white ── */}
      <div
        className="absolute inset-x-0 bottom-0 h-24"
        style={{
          background: 'linear-gradient(0deg, rgba(255,255,255,.92) 0%, rgba(255,255,255,0) 100%)',
        }}
      />

      {/* ── Muscle + level chips (top) — either may be absent ── */}
      {(muscle || level != null) && (
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
          {level != null && <Pill icon={<Gauge size={10} />} label={`רמה ${level}`} />}
        </div>
      )}

      {/* ── Name (bottom) — black text over the white fade ── */}
      <div className="absolute inset-x-0 bottom-0 p-3 text-start">
        <h3 className="font-extrabold text-[14px] leading-tight text-gray-900 line-clamp-2">
          {name}
        </h3>
      </div>
    </button>
  );
}
