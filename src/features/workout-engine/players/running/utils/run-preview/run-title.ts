/**
 * Human titles and size labels for a planned run (pure).
 *   "6 × 400 מ׳" · "5 × 3 דק׳" · "טמפו 20 דק׳" · "ריצה קלה 35 דק׳" · "ריצה ארוכה 12 ק״מ"
 * Returns null when the blocks don't make a clean title — the caller keeps
 * the template name then.
 */

import type { RunBlock } from '../../types/run-block.type';
import type { RunKind } from './run-kind';
import { coreWorkBlocks, findMainRep } from './run-estimates';

/** 400 → "400 מ׳", 1000 → "1 ק״מ", 1500 → "1.5 ק״מ". */
export function fmtMeters(m: number): string {
  if (m >= 1000) {
    const km = m / 1000;
    return `${Number.isInteger(km) ? km : km.toFixed(1).replace(/\.0$/, '')} ק״מ`;
  }
  return `${Math.round(m)} מ׳`;
}

/** 45 → "45 שנ׳", 180 → "3 דק׳", 150 → "2:30 דק׳". */
export function fmtSeconds(s: number): string {
  const t = Math.max(0, Math.round(s));
  if (t < 60) return `${t} שנ׳`;
  const m = Math.floor(t / 60);
  const sec = t % 60;
  return sec > 0 ? `${m}:${String(sec).padStart(2, '0')} דק׳` : `${m} דק׳`;
}

/** Whole minutes for headline numbers ("41"), never 0 for a non-empty run. */
export function roundMinutes(seconds: number): number {
  return seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : 0;
}

/** The planned size of one block — time when it has one (time reps also carry an estimated distance), else distance. */
export function blockSizeLabel(b: RunBlock): string {
  if (b.durationSeconds && b.durationSeconds > 0) return fmtSeconds(b.durationSeconds);
  if (b.distanceMeters && b.distanceMeters > 0) return fmtMeters(b.distanceMeters);
  return '';
}

/** The template label without the "(2/6)" rep suffix materializeWorkout adds. */
export function cleanBlockLabel(label: string | undefined): string {
  return (label ?? '').replace(/\s*\(\d+\/\d+\)\s*$/, '').trim();
}

const GENERIC_LABELS = new Set(['חימום', 'שחרור', 'ריצה', 'אינטרוול', 'אינטרוולים', 'warmup', 'cooldown', 'run', 'interval']);

/** Labels that say nothing beyond the block type. */
export function isGenericLabel(label: string): boolean {
  return GENERIC_LABELS.has(label.trim().toLowerCase());
}

export function buildRunDisplayTitle(
  blocks: readonly RunBlock[],
  kind: RunKind,
  totals: { seconds: number | null; meters: number | null },
): string | null {
  if (!blocks.length) return null;
  const rep = findMainRep(blocks);

  // Repeats: "6 × 400 מ׳".
  if (rep && rep.count >= 2) {
    const size = blockSizeLabel(rep.block);
    return size ? `${rep.count} × ${size}` : null;
  }

  const core = coreWorkBlocks(blocks);
  const coreSeconds = core.reduce((s, b) => s + (b.durationSeconds ?? 0), 0);

  if (kind === 'tempo' && coreSeconds > 0) return `טמפו ${roundMinutes(coreSeconds)} דק׳`;

  if (kind === 'long') {
    const plannedMeters = core.every((b) => !b.durationSeconds && (b.distanceMeters ?? 0) > 0)
      ? core.reduce((s, b) => s + (b.distanceMeters ?? 0), 0)
      : 0;
    if (plannedMeters > 0) return `ריצה ארוכה ${fmtMeters(plannedMeters)}`;
    if (totals.seconds) return `ריצה ארוכה ${roundMinutes(totals.seconds)} דק׳`;
    return null;
  }

  if (kind === 'easy' && totals.seconds) return `ריצה קלה ${roundMinutes(totals.seconds)} דק׳`;

  // A single continuous block of another kind: "<size> <label>".
  if (rep && rep.count === 1 && core.length === 1) {
    const size = blockSizeLabel(rep.block);
    const label = cleanBlockLabel(rep.block.label);
    return size && label && !isGenericLabel(label) && !/^\d/.test(label) ? `${label} ${size}` : null;
  }
  return null;
}
