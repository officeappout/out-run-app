/**
 * Pure rules of the unified player frame (enable_unified_player_v1, canvas "עיצובים סופיים").
 * One frame for every live situation; each player only says which situation it is in, and this
 * file decides the pieces: the drawer pages (blue dots + a caption), the button look, the lap page.
 */

export type UnifiedSituation = 'free_run' | 'free_walk' | 'route' | 'nav' | 'planned';

/** One drawer page. Caption keys live in the `together` namespace. */
export type DrawerPageId = 'general' | 'lap' | 'rep';

export const PAGE_CAPTION_KEY = {
  general: 'chrome.page.general',
  lap: 'chrome.page.lap',
  rep: 'chrome.page.rep',
} as const;

/**
 * Which pages the drawer has, in order:
 *   planned → this rep, then the overview
 *   free run with laps → the overview, then the current lap
 *   everything else (walk, route, navigation) → the overview only (no dots)
 */
export function drawerPagesFor(situation: UnifiedSituation, opts: { lapOn: boolean }): DrawerPageId[] {
  if (situation === 'planned') return ['rep', 'general'];
  if (situation === 'free_run' && opts.lapOn) return ['general', 'lap'];
  return ['general'];
}

/** Keeps a remembered page index valid after the page list changes. */
export function clampPage(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(index)));
}

/**
 * A sideways swipe on the drawer turns the page. Mostly-vertical moves belong to the snap gesture.
 * In RTL the next page is to the left, so a swipe to the right (dx > 0) moves forward.
 */
export function pageAfterSwipe(index: number, count: number, dx: number, dy: number, isRtl: boolean): number {
  if (count < 2 || Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy) * 1.2) return index;
  const forward = isRtl ? dx > 0 : dx < 0;
  return clampPage(index + (forward ? 1 : -1), count);
}

/** Button look of the unified frame: blue pause, orange resume, red hold-to-finish, the app's lap icon. No black. */
export const UNIFIED_BUTTONS = {
  pause: { background: 'linear-gradient(135deg,#00baf7,#0284c7)', shadow: '0 16px 30px -12px rgba(2,132,199,0.8)', icon: '#ffffff' },
  resume: { background: '#f97316', shadow: '0 16px 30px -12px rgba(249,115,22,0.8)', icon: '#ffffff' },
  stop: { background: '#e5484d' },
  lapIcon: '/icons/run/lap.svg',
} as const;

/**
 * Pace colour of the unified frame: green inside the target range, orange on either side
 * (too fast and too slow alike, no red). Recovery legs with a target pace are coloured too
 * (canvas 9א: "rest needs a pace"); without a band → no colour.
 */
export const UNIFIED_PACE_TONE = { in: '#16a34a', out: '#ea580c' } as const;

export function unifiedPaceTone(band: 'in' | 'fast' | 'slow' | null | undefined): string | undefined {
  if (!band) return undefined;
  return band === 'in' ? UNIFIED_PACE_TONE.in : UNIFIED_PACE_TONE.out;
}

/** Which live-card modes compare the pace to a band: work legs always, recovery legs only in the unified frame. */
export function comparesPace(mode: string, unified: boolean): boolean {
  return mode === 'pace' || (unified && mode === 'recovery');
}

// ── GPS (canvas 9ב: one mark in the header, three states, no floating toasts) ──

export type UnifiedGps = 'ok' | 'searching' | 'weak' | 'lost';

/** No sample for this long after a good fix = lost (time runs on, distance waits for the signal). */
export const GPS_LOST_AFTER_MS = 20_000;

export function unifiedGps(input: {
  status: 'searching' | 'poor' | 'good' | 'perfect' | 'simulated';
  hasHadGoodFix: boolean;
  lastFixAt: number | null;
  now: number;
}): UnifiedGps {
  if (input.status === 'simulated') return 'ok';
  if (input.hasHadGoodFix && (input.lastFixAt == null || input.now - input.lastFixAt > GPS_LOST_AFTER_MS)) return 'lost';
  if (!input.hasHadGoodFix && input.status === 'searching') return 'searching';
  if (input.status === 'poor') return 'weak';
  return 'ok';
}

// ── Route end (canvas 9ב: finish, one more loop, or go on free) ──

/**
 * True once the distance covers the route `loops` times (50 m slack, GPS is never exact).
 * `loops` starts at 1; "one more loop" raises it; "go on free" stops asking (caller keeps a flag).
 */
export function routeEndDue(distanceKm: number, routeKm: number | null | undefined, loops: number): boolean {
  if (!routeKm || routeKm <= 0 || loops < 1) return false;
  return distanceKm >= routeKm * loops - 0.05;
}

export interface LapLike {
  lapNumber: number;
  distanceMeters: number;
  durationSeconds: number;
  isActive: boolean;
}

export interface CurrentLapView {
  n: number;
  durationSec: number;
  distanceKm: number;
  /** Seconds per km; 0 until the lap has a usable distance. */
  paceSec: number;
}

/** The running lap (the store keeps the active one live). Null before the first lap exists. */
export function currentLapView(laps: readonly LapLike[]): CurrentLapView | null {
  const lap = laps.find((l) => l.isActive) ?? laps[laps.length - 1];
  if (!lap) return null;
  const distanceKm = Math.max(0, lap.distanceMeters || 0) / 1000;
  const durationSec = Math.max(0, lap.durationSeconds || 0);
  return { n: lap.lapNumber, durationSec, distanceKm, paceSec: distanceKm > 0.05 ? durationSec / distanceKm : 0 };
}
