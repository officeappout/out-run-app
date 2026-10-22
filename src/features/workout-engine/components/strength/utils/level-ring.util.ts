/**
 * Pure copy/geometry for the v2 level ring on the strength summary. Same data
 * and the same "עוד N% לרמה X" rule as ProgramProgressCard (which it replaces
 * on this screen only). No React — unit-tested in node.
 */

import type { PlayerT } from '@/messages/ns/player';

export interface LevelRingModel {
  /** Clamped 0–100, rounded. */
  percent: number;
  levelLabel: string;
  /** null at the top level (nothing left to reach). */
  nextLabel: string | null;
}

export function levelRingModel(t: PlayerT, currentLevel: number, maxLevel: number, progressPercent: number): LevelRingModel {
  const level = Number.isFinite(currentLevel) ? Math.max(1, Math.round(currentLevel)) : 1;
  const max = Number.isFinite(maxLevel) && maxLevel > 0 ? Math.round(maxLevel) : 25;
  const percent = Number.isFinite(progressPercent) ? Math.min(100, Math.max(0, Math.round(progressPercent))) : 0;
  const nextLevel = level + 1;
  const remaining = Math.max(0, 100 - percent);
  return {
    percent,
    levelLabel: t('strengthSummary.levelRing.level', { level: String(level), max: String(max) }),
    nextLabel: nextLevel <= max ? t('strengthSummary.levelRing.next', { remaining: String(remaining), next: String(nextLevel) }) : null,
  };
}

/** Stroke-dashoffset for a ring of radius r at `percent`. */
export function ringDashOffset(r: number, percent: number): number {
  const c = 2 * Math.PI * r;
  const p = Math.min(100, Math.max(0, percent));
  return c * (1 - p / 100);
}
