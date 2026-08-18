'use client';

import React from 'react';
import { DIFFICULTY_DISPLAY } from '@/lib/difficulty-display';

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
 *
 * `colorScheme` (Stage 5 quick win, route-enrichment-pipeline plan,
 * 17.08.2026): defaults to 'cyan' — the ORIGINAL binary cyan/dark-grey fill,
 * byte-identical output for every pre-existing (workout) call site, nothing
 * changes unless a caller opts in. 'severity' is new, opt-in, green/amber/red
 * keyed to DIFFICULTY_DISPLAY — used ONLY at the 2 route call sites
 * (RouteCardUnified, RouteDetailSheet), not the 11 workout ones.
 */

export type DifficultyValue = 1 | 2 | 3 | 'easy' | 'medium' | 'hard';
export type DifficultyBoltsSize = 'sm' | 'md';
export type DifficultyBoltsColorScheme = 'cyan' | 'severity';

const STRING_TO_NUMERIC: Record<'easy' | 'medium' | 'hard', 1 | 2 | 3> = {
  easy: 1,
  medium: 2,
  hard: 3,
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
  /** 'cyan' (default) — unchanged existing look. 'severity' — opt-in
   *  green/amber/red, route call sites only. See file header comment. */
  colorScheme?: DifficultyBoltsColorScheme;
}

// Neutral "empty" fill for the severity scheme — matches gray-300, the same
// role FILTER_EMPTY plays for the cyan scheme (an unfilled bolt, not a color).
const SEVERITY_EMPTY_COLOR = '#D1D5DB';

export default function DifficultyBolts({
  difficulty,
  size = 'md',
  showLabel = true,
  className = '',
  colorScheme = 'cyan',
}: DifficultyBoltsProps) {
  const level = normalize(difficulty);
  const px = SIZE_PX[size];
  const severityColor = DIFFICULTY_DISPLAY[level].color;

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`} dir="rtl">
      <div className="flex items-center gap-0.5">
        {[1, 2, 3].map((n) =>
          colorScheme === 'severity' ? (
            // Mask (not filter) — a filter chain only reproduces ONE fixed
            // hue; masking the SVG shape with an arbitrary background-color
            // is the simplest way to support 3 different severity colors
            // without hand-deriving a filter-chain per color.
            <div
              key={n}
              style={{
                width: px,
                height: px,
                backgroundColor: n <= level ? severityColor : SEVERITY_EMPTY_COLOR,
                WebkitMaskImage: 'url(/icons/ui/Bolt.svg)',
                maskImage: 'url(/icons/ui/Bolt.svg)',
                WebkitMaskSize: 'contain',
                maskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                maskRepeat: 'no-repeat',
              }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={n}
              src="/icons/ui/Bolt.svg"
              alt=""
              width={px}
              height={px}
              style={{ filter: n <= level ? FILTER_FILLED : FILTER_EMPTY }}
            />
          ),
        )}
      </div>
      {showLabel && (
        <span className={`${LABEL_CLASS[size]} font-normal text-gray-800 dark:text-gray-100`}>
          {DIFFICULTY_DISPLAY[level].label}
        </span>
      )}
    </div>
  );
}
