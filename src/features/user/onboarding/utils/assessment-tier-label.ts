/**
 * Coverflow slider redesign — the old dot-track's static "מתחיל / בינוני / מתקדם"
 * labels (3 fixed positions under the dots) are replaced by a single pill in the
 * description card showing the CURRENTLY SELECTED level's tier. This pure resolver
 * covers both the coverflow strip (discrete step index / total steps) and the
 * degraded continuous-slider fallback (level's proportion between min/max) via
 * one shared 0-1 proportion input, matching the old labels' 3-way split.
 */

/** Clamps to [0, 1] then buckets into the same thirds the old 3 static labels covered. */
export function resolveTierLabel(proportion: number, isFemale: boolean): string {
  const p = Number.isFinite(proportion) ? Math.max(0, Math.min(1, proportion)) : 0;
  if (p < 1 / 3) return isFemale ? 'מתחילה' : 'מתחיל';
  if (p < 2 / 3) return 'בינוני';
  return isFemale ? 'מתקדמת' : 'מתקדם';
}

/** Proportion for the coverflow strip — position of the selected step within the step list. */
export function stepProportion(stepIndex: number, totalSteps: number): number {
  if (totalSteps <= 1) return 0;
  return stepIndex / (totalSteps - 1);
}

/** Proportion for the degraded continuous slider — position of the real level within [min, max]. */
export function levelProportion(level: number, minLevel: number, maxLevel: number): number {
  if (maxLevel <= minLevel) return 0;
  return (level - minLevel) / (maxLevel - minLevel);
}
