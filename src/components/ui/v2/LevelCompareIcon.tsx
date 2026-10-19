'use client';

/**
 * LevelCompareIcon — the strength "החלפת תרגיל" swap's level marks (level
 * below / same / above: /assets/icons/ui/level_{down,same,up}.svg in
 * orange / brand blue / emerald), shared so every swap sheet speaks the
 * same language (owner, 19.10.2026). Used by ExerciseReplacementModal and
 * the run overview's "החלף מקטע" drawer.
 *
 *   <LevelCompareIcon level="lower" />  ·  LEVEL_COMPARE_ICONS.same.color
 */

export type LevelComparison = 'lower' | 'same' | 'higher';

export const LEVEL_COMPARE_ICONS: Record<LevelComparison, { src: string; color: string }> = {
  lower: { src: '/assets/icons/ui/level_down.svg', color: 'text-orange-500' },
  same: { src: '/assets/icons/ui/level_same.svg', color: 'text-[#00BAF7]' },
  higher: { src: '/assets/icons/ui/level_up.svg', color: 'text-emerald-500' },
};

export interface LevelCompareIconProps {
  level: LevelComparison;
  size?: number;
  className?: string;
}

export default function LevelCompareIcon({ level, size = 16, className = '' }: LevelCompareIconProps) {
  const cfg = LEVEL_COMPARE_ICONS[level] ?? LEVEL_COMPARE_ICONS.same;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={cfg.src} alt="" aria-hidden width={size} height={size} className={`shrink-0 object-contain ${className}`} />
  );
}
