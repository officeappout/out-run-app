'use client';

import React from 'react';

/**
 * DifficultyBolts — shared 3-bolt difficulty pill.
 *
 * Single source of truth for the ⚡⚡⚡ visual that previously lived
 * inline (and slightly drifted) in:
 *   - WorkoutPreviewDrawer.tsx → DrawerBoltIcon
 *   - HeroWorkoutCard.tsx       → BoltIcon
 *   - RunBriefingDrawer.tsx     → BoltIcon
 *
 * Difficulty input accepts BOTH numeric (1|2|3 — used by GeneratedWorkout)
 * AND string (`easy`|`medium`|`hard` — used by Route.difficulty), and
 * normalises internally so callers can pass the field as-is.
 */

export type DifficultyValue = 1 | 2 | 3 | 'easy' | 'medium' | 'hard';
export type DifficultyBoltsSize = 'sm' | 'md';

const STRING_TO_NUMERIC: Record<'easy' | 'medium' | 'hard', 1 | 2 | 3> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

const LABELS: Record<1 | 2 | 3, string> = {
  1: 'קל',
  2: 'בינוני',
  3: 'קשה',
};

const SIZE_PX: Record<DifficultyBoltsSize, number> = {
  sm: 12,
  md: 14,
};

const LABEL_CLASS: Record<DifficultyBoltsSize, string> = {
  sm: 'text-[11px]',
  md: 'text-[13px]',
};

// Re-color a black SVG to the project's cyan / dark-grey via filter chains.
// Keeping the exact filters used by the existing inline copies preserves
// identical visual output across all consumers.
const FILTER_FILLED =
  'brightness(0) saturate(100%) invert(68%) sepia(65%) saturate(2000%) hue-rotate(160deg) brightness(102%) contrast(101%)';
const FILTER_EMPTY =
  'brightness(0) saturate(100%) invert(22%) sepia(10%) saturate(750%) hue-rotate(176deg) brightness(95%) contrast(90%)';

function normalize(diff: DifficultyValue): 1 | 2 | 3 {
  if (typeof diff === 'number') {
    return Math.min(3, Math.max(1, Math.round(diff))) as 1 | 2 | 3;
  }
  return STRING_TO_NUMERIC[diff] ?? 1;
}

interface DifficultyBoltsProps {
  difficulty: DifficultyValue;
  size?: DifficultyBoltsSize;
  /** Show the Hebrew label next to the bolts. Defaults to true. */
  showLabel?: boolean;
  /** Optional className for the outer wrapper. */
  className?: string;
}

export default function DifficultyBolts({
  difficulty,
  size = 'md',
  showLabel = true,
  className = '',
}: DifficultyBoltsProps) {
  const level = normalize(difficulty);
  const px = SIZE_PX[size];

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`} dir="rtl">
      <div className="flex items-center gap-0.5">
        {[1, 2, 3].map((n) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={n}
            src="/icons/ui/Bolt.svg"
            alt=""
            width={px}
            height={px}
            style={{ filter: n <= level ? FILTER_FILLED : FILTER_EMPTY }}
          />
        ))}
      </div>
      {showLabel && (
        <span className={`${LABEL_CLASS[size]} font-normal text-gray-800 dark:text-gray-100`}>
          {LABELS[level]}
        </span>
      )}
    </div>
  );
}
