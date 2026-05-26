'use client';

import { useState } from 'react';
import { getMuscleGroupLabel } from '@/features/workout-engine/shared/utils/gear-mapping.utils';

/**
 * Canonical muscle key → SVG filename map.
 * Several keys collapse to a shared icon (e.g. `lats` → `back`) because
 * we don't ship a dedicated SVG for every lower-level synonym.
 */
const MUSCLE_FILE: Record<string, string> = {
  chest: 'chest', back: 'back', shoulders: 'shoulders',
  biceps: 'biceps', triceps: 'triceps', forearms: 'forearms',
  traps: 'traps', lats: 'back', upper_back: 'back',
  lower_back: 'back', quads: 'quads', hamstrings: 'hamstrings',
  glutes: 'glutes', calves: 'calves', legs: 'quads',
  hip_flexors: 'hip_flexors', adductors: 'adductors',
  abductors: 'adductors', core: 'abs', abs: 'abs',
  obliques: 'obliques', full_body: 'chest', cardio: 'calves',
  neck: 'traps', serratus: 'chest',
};

interface DrawerMuscleBadgeProps {
  muscle: string;
}

/**
 * Borderless muscle pill that resolves its icon through a 3-tier fallback:
 *   1. `/icons/muscles/{file}.svg`
 *   2. `/icons/muscles/male/{file}.svg`
 *   3. First letter of the Hebrew label, rendered as a coloured glyph.
 */
export default function DrawerMuscleBadge({ muscle }: DrawerMuscleBadgeProps) {
  const label = getMuscleGroupLabel(muscle);
  const file = MUSCLE_FILE[muscle] ?? muscle;
  const [tier, setTier] = useState(0);

  const src = tier === 0 ? `/icons/muscles/${file}.svg` : `/icons/muscles/male/${file}.svg`;

  return (
    <div className="flex-shrink-0 flex items-center gap-1.5" dir="rtl">
      {tier < 2 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} width={28} height={28} onError={() => setTier((p) => p + 1)} />
      ) : (
        <span className="text-cyan-500 text-sm font-bold w-7 h-7 flex items-center justify-center">{label.charAt(0)}</span>
      )}
      <span className="text-[13px] font-normal text-gray-800 dark:text-gray-200">{label}</span>
    </div>
  );
}
