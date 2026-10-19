/**
 * Pure logic behind the v2 primitives — no React, no DOM. Kept in a plain .ts
 * module so vitest (node env) can unit-test it directly.
 */

// ── DeltaBadge ────────────────────────────────────────────────────────────

export type DeltaDirection = 'up' | 'down' | 'flat';

export interface Delta {
  direction: DeltaDirection;
  /** Absolute percent change, rounded to an integer. */
  pct: number;
}

/**
 * Percent change of `current` against `previous`. Returns null when there is
 * no meaningful baseline (missing, zero, negative or non-finite), so callers
 * hide the badge instead of showing a fake "+∞%".
 */
export function computeDelta(current: number, previous: number | null | undefined): Delta | null {
  if (previous == null || !Number.isFinite(previous) || !Number.isFinite(current) || previous <= 0) {
    return null;
  }
  const raw = ((current - previous) / previous) * 100;
  const pct = Math.round(Math.abs(raw));
  if (pct === 0) return { direction: 'flat', pct: 0 };
  return { direction: raw > 0 ? 'up' : 'down', pct };
}

// ── StatNumber count-up ───────────────────────────────────────────────────

/** Same shape as the v2 curve — a fast start that settles softly (easeOutQuint-like). */
export function easeOutV2(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 4);
}

/** Value to display at `elapsedMs` of a count-up from `from` to `to`. */
export function countUpValue(from: number, to: number, elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0 || elapsedMs >= durationMs) return to;
  return from + (to - from) * easeOutV2(elapsedMs / durationMs);
}

/** Locale number formatting with tabular-friendly grouping (he-IL uses "," thousands). */
export function formatStat(value: number, decimals = 0, locale = 'he-IL'): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ── BarChart ──────────────────────────────────────────────────────────────

export interface BarDatum {
  key: string;
  label: string;
  value: number;
}

export interface BarLayout {
  key: string;
  /** Bar height as a fraction 0..1 of the plot height. */
  ratio: number;
  /** Stagger delay in seconds for this bar's grow/shrink. */
  delay: number;
  reachedGoal: boolean;
}

/**
 * Y-axis ceiling: the larger of the max value and the goal, padded 10% so the
 * goal line never sits on the top edge. Always > 0 so ratios stay finite.
 */
export function chartCeiling(values: number[], goal?: number | null): number {
  const max = Math.max(0, ...values.filter(Number.isFinite), goal && goal > 0 ? goal : 0);
  return max > 0 ? max * 1.1 : 1;
}

/**
 * Layout for each bar. Delays stagger in reading order — for RTL the first
 * datum is drawn on the right, so the stagger still starts where the eye does.
 */
export function layoutBars(
  data: BarDatum[],
  goal?: number | null,
  staggerSec = 0.035,
): { bars: BarLayout[]; goalRatio: number | null; ceiling: number } {
  const ceiling = chartCeiling(data.map((d) => d.value), goal);
  const bars = data.map((d, i) => {
    const v = Number.isFinite(d.value) && d.value > 0 ? d.value : 0;
    return {
      key: d.key,
      ratio: v / ceiling,
      delay: i * staggerSec,
      reachedGoal: goal != null && goal > 0 && v >= goal,
    };
  });
  const goalRatio = goal != null && goal > 0 ? goal / ceiling : null;
  return { bars, goalRatio, ceiling };
}

// ── DraggableSheet ────────────────────────────────────────────────────────

/**
 * Snap points are expressed as the sheet's visible height in px. Given the
 * height the user released at and the release velocity (px/s, positive =
 * dragging DOWN = shrinking), pick the snap to settle on. A fast flick moves
 * one snap in the flick direction; otherwise the nearest snap wins.
 */
export function resolveSnap(
  snapPoints: number[],
  releasedHeight: number,
  velocityY: number,
  flickThreshold = 500,
): number {
  if (snapPoints.length === 0) return releasedHeight;
  const sorted = [...snapPoints].sort((a, b) => a - b);
  if (Math.abs(velocityY) >= flickThreshold) {
    if (velocityY > 0) {
      // flick down → next smaller snap below the release point
      const below = sorted.filter((s) => s < releasedHeight);
      return below.length ? below[below.length - 1] : sorted[0];
    }
    const above = sorted.filter((s) => s > releasedHeight);
    return above.length ? above[0] : sorted[sorted.length - 1];
  }
  return sorted.reduce((best, s) =>
    Math.abs(s - releasedHeight) < Math.abs(best - releasedHeight) ? s : best,
  );
}

/** Rubber-band resistance past the min/max snap, iOS-style. */
export function rubberBand(overshoot: number, dimension: number, constant = 0.55): number {
  if (overshoot === 0 || dimension <= 0) return 0;
  const sign = Math.sign(overshoot);
  const x = Math.abs(overshoot);
  return sign * (1 - 1 / ((x * constant) / dimension + 1)) * dimension;
}

// ── Sheet (drag-to-dismiss) ──────────────────────────────────────────────

export interface SheetDismissRule {
  /** Downward drag distance (px) past which a release closes the sheet. */
  distance: number;
  /** Downward release velocity (px/s) that closes it regardless of distance. 0/negative = off. */
  velocity: number;
}

/** Default rule for `<Sheet dragToDismiss>`: 120 px or a 500 px/s flick. */
export const DEFAULT_SHEET_DISMISS: SheetDismissRule = { distance: 120, velocity: 500 };

/**
 * Should a released drag close the sheet? Only downward movement counts —
 * an upward flick never dismisses. Non-finite inputs are treated as 0.
 */
export function shouldDismissSheet(
  offsetY: number,
  velocityY: number,
  rule: SheetDismissRule = DEFAULT_SHEET_DISMISS,
): boolean {
  const off = Number.isFinite(offsetY) ? offsetY : 0;
  const vel = Number.isFinite(velocityY) ? velocityY : 0;
  if (off > rule.distance) return true;
  return rule.velocity > 0 && vel > rule.velocity;
}

/**
 * Bottom padding for a sheet surface: the safe-area expression, or 0.
 * (The keyboard is handled by the kb-fit / kb-sheet / kb-cap classes of the
 * shared keyboard-inset layer, which MOVE the sheet — padding by --kb-inset
 * as well would count the keyboard twice.)
 */
export function sheetBottomPadding(safeArea: string | false): string | undefined {
  return safeArea || undefined;
}

// ── StoryBars ────────────────────────────────────────────────────────────

export type StoryBarState = 'done' | 'current' | 'upcoming';

/** Bar `index` relative to the current one (≥ length = everything done). */
export function storyBarState(index: number, currentIndex: number): StoryBarState {
  if (index < currentIndex) return 'done';
  return index === currentIndex ? 'current' : 'upcoming';
}

/** 0–1 progress, clamped; NaN/∞ → 0. */
export function clampProgress(progress: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
}
