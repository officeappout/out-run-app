/**
 * Pure helpers for the attached run chrome (enable_run_player_drawer_v1,
 * boards H-1…H-9): gauge geometry, the top layers' pager, the me-vs-them rows.
 */

// ── gauge ───────────────────────────────────────────────────────────────────

export interface GaugeLayout {
  /** Target band, % from the FAST (left) end; null for a free run (no band). */
  band: { leftPct: number; widthPct: number } | null;
  /** Pointer, % from the fast end. */
  pointerPct: number;
  /** Optional second marker (average), % from the fast end. */
  avgPct: number | null;
  inBand: boolean;
}

const clampPct = (n: number) => Math.min(100, Math.max(0, n));

/**
 * Pace gauge. Fast on the left, slow on the right (the board's "מהיר … איטי"
 * reads right-to-left). With a target range the band sits in the middle 24 %
 * (board H-2); without one the window is the average ± 60 s/km.
 * Paces in seconds per km; unknown pace -> pointer in the middle.
 */
export function gaugeLayout(input: { nowSec: number; loSec?: number; hiSec?: number; avgSec?: number }): GaugeLayout {
  const now = input.nowSec > 0 ? input.nowSec : 0;
  const hasBand = input.loSec != null && input.hiSec != null && input.hiSec > input.loSec;
  if (hasBand) {
    const lo = input.loSec as number;
    const hi = input.hiSec as number;
    const margin = (hi - lo) * 1.58;
    const fast = lo - margin;
    const slow = hi + margin;
    const pct = (p: number) => clampPct(((p - fast) / (slow - fast)) * 100);
    return {
      band: { leftPct: pct(lo), widthPct: pct(hi) - pct(lo) },
      pointerPct: now > 0 ? pct(now) : 50,
      avgPct: input.avgSec ? pct(input.avgSec) : null,
      inBand: now >= lo && now <= hi,
    };
  }
  const centre = input.avgSec && input.avgSec > 0 ? input.avgSec : now || 360;
  const fast = centre - 60;
  const slow = centre + 60;
  const pct = (p: number) => clampPct(((p - fast) / (slow - fast)) * 100);
  return { band: null, pointerPct: now > 0 ? pct(now) : 50, avgPct: input.avgSec ? pct(input.avgSec) : null, inBand: false };
}

// ── top layers ──────────────────────────────────────────────────────────────

export type RunLayerId = 'blocks' | 'together' | 'race';

/** Which layers exist: the blocks layer always; together + race only with the layer on. */
export function availableLayers(togetherOn: boolean, hasRival: boolean): RunLayerId[] {
  if (!togetherOn) return ['blocks'];
  return hasRival ? ['blocks', 'together', 'race'] : ['blocks', 'together'];
}

/**
 * Where the pager should be when the rail selection changes: picking a face
 * jumps to the race layer; clearing it leaves the race layer (back to the
 * together layer); otherwise the user's own swipe stands.
 */
export function layerAfterSelection(layers: RunLayerId[], current: RunLayerId, selected: string | null, prevSelected: string | null): RunLayerId {
  if (selected && !prevSelected && layers.includes('race')) return 'race';
  if (!selected && prevSelected && current === 'race') return layers.includes('together') ? 'together' : 'blocks';
  return layers.includes(current) ? current : layers[0];
}

/** Scroll-snap position -> layer index (nearest). */
export function indexFromScroll(scrollLeft: number, width: number, count: number): number {
  if (width <= 0 || count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(Math.abs(scrollLeft) / width)));
}

// ── me vs them ──────────────────────────────────────────────────────────────

export interface VsSide {
  distanceKm: number;
  paceSecPerKm: number;
  avgPaceSecPerKm: number;
  elapsedSec: number;
  elevGainM: number;
}

export interface VsGap {
  /** Metres between us; positive = I'm ahead. */
  meters: number;
  leader: 'me' | 'them' | 'even';
  /** Gap vs the previous sample: shrinking / growing / unknown. */
  trend: 'closing' | 'growing' | 'steady';
}

export function vsGap(me: VsSide, them: VsSide, prevMeters?: number | null): VsGap {
  const meters = Math.round((me.distanceKm - them.distanceKm) * 1000);
  const leader = Math.abs(meters) < 10 ? 'even' : meters > 0 ? 'me' : 'them';
  let trend: VsGap['trend'] = 'steady';
  if (prevMeters != null && Math.abs(meters) !== Math.abs(prevMeters)) {
    trend = Math.abs(meters) < Math.abs(prevMeters) ? 'closing' : 'growing';
  }
  return { meters, leader, trend };
}

/** Which side of a row is "better" (for a subtle highlight); null when equal / unknown. */
export function betterSide(row: 'distance' | 'pace' | 'avgPace' | 'time' | 'elev', me: VsSide, them: VsSide): 'me' | 'them' | null {
  const cmp = (a: number, b: number, lowerIsBetter: boolean): 'me' | 'them' | null => {
    if (!(a > 0) || !(b > 0) || a === b) return null;
    return (a < b) === lowerIsBetter ? 'me' : 'them';
  };
  switch (row) {
    case 'distance': return cmp(me.distanceKm, them.distanceKm, false);
    case 'pace': return cmp(me.paceSecPerKm, them.paceSecPerKm, true);
    case 'avgPace': return cmp(me.avgPaceSecPerKm, them.avgPaceSecPerKm, true);
    case 'elev': return cmp(me.elevGainM, them.elevGainM, false);
    case 'time': return null;
  }
}

/** "24:10" / "1:02:03" from seconds. */
export function clockText(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
