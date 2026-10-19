/**
 * "גובה לאורך האימון" — page 2 of the run overview's graph pager (boards
 * M-6f / M-6i, enable_home_v2). Pure SVG geometry.
 *
 * The chosen route's stored elevation profile, laid along the WHOLE
 * workout's distance (a loop repeats lap after lap; an out-and-back /
 * one-way route turns round at its end), with the workout's segments as
 * coloured bands under it (warm-up / reps / recoveries / cool-down) and a
 * dashed marker where each new lap starts. RTL: the start is on the RIGHT.
 */

import type { RunBlock } from '../../types/run-block.type';
import { isRestBlock } from '../../lib/planned-rep-results';
import { elevationAt, kmTicks, profileLengthM, type ElevationSamples, type KmTick } from '../../lib/route-elevation-ahead';
import { estimateBlockMeters, findMainRep, type RunPaceContext } from '../run-preview/run-estimates';
import { blockPhase, stripColor, STRIP_REST_COLOR } from '../run-preview/run-strip';
import { bareSize } from './run-variants';

/** Warm-up / cool-down band colour on the boards. */
export const EASY_BAND_COLOR = '#bfe48a';

export const ELEV_W = 326;
const TOP = 18; // room for the peak label
const BASE = 70; // chart baseline
const SAMPLES = 96;

export interface ElevationBand { key: string; x: number; width: number; color: string }
export interface LapMarker { x: number; label: string }
export interface LegendItem { key: string; color: string; label: string }

export interface WorkoutElevationGeometry {
  line: string;
  area: string;
  peak: { x: number; y: number; label: string };
  bands: ElevationBand[];
  laps: LapMarker[];
  ticks: KmTick[];
  legend: LegendItem[];
  /** "שיא 40 מ׳ · עלייה 18 מ׳ לסיבוב". */
  caption: string;
}

function bandColor(b: RunBlock): string {
  if (isRestBlock(b)) return STRIP_REST_COLOR;
  const phase = blockPhase(b);
  return phase === 'main' ? stripColor(b) : EASY_BAND_COLOR;
}

/** Elevation `alongM` metres into the run: loops wrap, other shapes turn round (ping-pong). */
export function elevationAlongRun(s: ElevationSamples, alongM: number, loop: boolean): number {
  const L = profileLengthM(s);
  if (L <= 0) return s.elevationsM[0] ?? 0;
  if (loop) return elevationAt(s, ((alongM % L) + L) % L);
  const p = ((alongM % (2 * L)) + 2 * L) % (2 * L);
  return elevationAt(s, p <= L ? p : 2 * L - p);
}

function gainOf(e: readonly number[]): number {
  let g = 0;
  for (let i = 1; i < e.length; i++) if (e[i] > e[i - 1]) g += e[i] - e[i - 1];
  return Math.round(g);
}

export function buildWorkoutElevation(
  blocks: readonly RunBlock[],
  ctx: RunPaceContext,
  samples: ElevationSamples,
  opts: { loop: boolean },
): WorkoutElevationGeometry | null {
  const lens = blocks.map((b) => estimateBlockMeters(b, ctx) ?? 0);
  const totalM = lens.reduce((s, m) => s + m, 0);
  const L = profileLengthM(samples);
  if (!(totalM > 0) || !(L > 0)) return null;

  const x = (m: number) => +(ELEV_W * (1 - m / totalM)).toFixed(1);
  const pts = Array.from({ length: SAMPLES + 1 }, (_, i) => {
    const m = (i / SAMPLES) * totalM;
    return { m, e: elevationAlongRun(samples, m, opts.loop) };
  });
  const min = Math.min(...pts.map((p) => p.e));
  const max = Math.max(...pts.map((p) => p.e));
  const span = Math.max(1, max - min);
  const y = (e: number) => +(TOP + (1 - (e - min) / span) * (BASE - TOP - 4)).toFixed(1);
  const line = `M${pts.map((p) => `${x(p.m)} ${y(p.e)}`).join(' L')}`;
  const area = `${line} L0 ${BASE} L${ELEV_W} ${BASE} Z`;
  const top = pts.reduce((a, b) => (b.e > a.e ? b : a), pts[0]);

  const bands: ElevationBand[] = [];
  let at = 0;
  blocks.forEach((b, i) => {
    const len = lens[i];
    if (len <= 0) return;
    const x0 = x(at);
    const x1 = x(at + len);
    bands.push({ key: b.id || String(i), x: Math.min(x0, x1), width: +Math.abs(x0 - x1).toFixed(1), color: bandColor(b) });
    at += len;
  });

  const laps: LapMarker[] = [];
  if (opts.loop) {
    for (let k = 1; k * L < totalM - L * 0.1 && k < 8; k++) laps.push({ x: x(k * L), label: `סיבוב ${k + 1}` });
  }

  const legend: LegendItem[] = [];
  if (blocks.some((b) => blockPhase(b) !== 'main')) legend.push({ key: 'easy', color: EASY_BAND_COLOR, label: 'חימום / שחרור' });
  const rep = findMainRep(blocks.filter((b) => blockPhase(b) === 'main'));
  if (rep) legend.push({ key: 'work', color: stripColor(rep.block), label: rep.count >= 2 ? `חזרות ${bareSize(rep.block)}` : 'עיקר' });
  if (blocks.some((b) => blockPhase(b) === 'main' && isRestBlock(b))) legend.push({ key: 'rest', color: STRIP_REST_COLOR, label: 'התאוששות' });

  const gain = gainOf(samples.elevationsM);
  const caption = `שיא ${Math.round(max)} מ׳ · עלייה ${gain} מ׳${opts.loop ? ' לסיבוב' : ''}`;

  return {
    line, area,
    peak: { x: x(top.m), y: y(top.e), label: `${Math.round(top.e)} מ׳` },
    bands, laps, ticks: kmTicks(totalM, ELEV_W, 5), legend, caption,
  };
}
