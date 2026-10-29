/**
 * Human titles and size labels for a planned run (pure).
 *   "6 × 400 מ׳" · "5 × 3 דק׳" · "טמפו 20 דק׳" · "ריצה קלה 35 דק׳" · "ריצה ארוכה 12 ק״מ"
 * Returns null when the blocks don't make a clean title — the caller keeps
 * the template name then.
 */

import { withUnit, type CommonT, type UnitId } from '@/lib/i18n/units';
import type { AppLanguage } from '@/features/content/shared/localized-text.types';
import { rt, ut } from '../run-utils-t';
import type { RunBlock } from '../../types/run-block.type';
import type { RunKind } from './run-kind';
import { coreWorkBlocks, findMainRep } from './run-estimates';
import { cleanRunBlockLabel } from './run-block-label';

/** The number part of a distance: 400 → ['m', '400'], 1500 → ['km', '1.5']. */
function metersParts(m: number): [UnitId, string] {
  if (m >= 1000) {
    const km = m / 1000;
    return ['km', String(Number.isInteger(km) ? km : km.toFixed(1).replace(/\.0$/, ''))];
  }
  return ['m', String(Math.round(m))];
}

/** The number part of a duration: 45 → ['sec', '45'], 180 → ['min', '3'], 150 → ['min', '2:30']. */
function secondsParts(s: number): [UnitId, string] {
  const t = Math.max(0, Math.round(s));
  if (t < 60) return ['sec', String(t)];
  const m = Math.floor(t / 60);
  const sec = t % 60;
  return ['min', sec > 0 ? `${m}:${String(sec).padStart(2, '0')}` : String(m)];
}

/**
 * 400 → "400 מ׳", 1000 → "1 ק״מ", 1500 → "1.5 ק״מ". `t` is the unit translator: the current language by default,
 * pass `defaultCommonT()` (Hebrew) for text that is stored and later matched.
 */
export function fmtMeters(m: number, t: CommonT = ut): string {
  const [u, n] = metersParts(m);
  return withUnit(u, n, t);
}

/** 45 → "45 שנ׳", 180 → "3 דק׳", 150 → "2:30 דק׳" (`t` as in fmtMeters). */
export function fmtSeconds(s: number, t: CommonT = ut): string {
  const [u, n] = secondsParts(s);
  return withUnit(u, n, t);
}

/** A block's planned size without its unit: "400", "1.5", "3", "2:30" (metres under 1 km, else km; seconds under a minute, else minutes). */
export function bareBlockSize(b: RunBlock): string {
  if (b.durationSeconds && b.durationSeconds > 0) return secondsParts(b.durationSeconds)[1];
  if (b.distanceMeters && b.distanceMeters > 0) return metersParts(b.distanceMeters)[1];
  return '';
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

const GENERIC_LABELS = new Set(['חימום', 'שחרור', 'ריצה', 'אינטרוול', 'אינטרוולים', 'warmup', 'cooldown', 'run', 'interval']); // i18n-allow-hebrew: matches stored labels

/** Labels that say nothing beyond the block type. */
export function isGenericLabel(label: string): boolean {
  return GENERIC_LABELS.has(label.trim().toLowerCase());
}

export function buildRunDisplayTitle(
  blocks: readonly RunBlock[],
  kind: RunKind,
  totals: { seconds: number | null; meters: number | null },
  lang: AppLanguage = 'he',
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

  if (kind === 'tempo' && coreSeconds > 0) return rt('runUtils.title.tempo', { size: withUnit('min', roundMinutes(coreSeconds), ut) });

  if (kind === 'long') {
    const plannedMeters = core.every((b) => !b.durationSeconds && (b.distanceMeters ?? 0) > 0)
      ? core.reduce((s, b) => s + (b.distanceMeters ?? 0), 0)
      : 0;
    if (plannedMeters > 0) return rt('runUtils.title.long', { size: fmtMeters(plannedMeters) });
    if (totals.seconds) return rt('runUtils.title.long', { size: withUnit('min', roundMinutes(totals.seconds), ut) });
    return null;
  }

  if (kind === 'easy' && totals.seconds) return rt('runUtils.title.easy', { size: withUnit('min', roundMinutes(totals.seconds), ut) });

  // A single continuous block of another kind: "<size> <label>".
  if (rep && rep.count === 1 && core.length === 1) {
    const size = blockSizeLabel(rep.block);
    const label = cleanBlockLabel(rep.block.label);
    return size && label && !isGenericLabel(label) && !/^\d/.test(label) ? `${cleanRunBlockLabel(rep.block, lang)} ${size}` : null;
  }
  return null;
}
