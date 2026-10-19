/**
 * "החלף מקטע" — whole alternative main sets for today's run (board M-7b,
 * enable_home_v2). Pure; the drawer only renders this.
 *
 * From the current main set (e.g. 6 × 400 מ׳ · 90″, volume 2400 m):
 *   same volume — other rep sizes whose total fast distance (or time) is
 *                 within ±10 % (4 × 600, 3 × 800, 8 × 300 …) with the
 *                 recovery scaled to the rep, and at most one pyramid /
 *                 ladder (400-800-1200). Much shorter reps (≤ ½) count as
 *                 easier, much longer (≥ 2×) as harder.
 *   easier      — fewer reps with a longer recovery (= the selector's
 *                 "קליל"); half-size reps.
 *   harder      — a shorter recovery; more reps with a shorter recovery
 *                 (= "עוצמתי").
 * The rep keeps its zone, so every alternative runs at the runner's own
 * paces; the time delta comes from those paces. The workout's category
 * bounds the rep sizes (short intervals ≤ 1 km, long intervals ≥ 400 m).
 * Levels use the strength swap's words: lower / same / higher.
 */

import type { RunZoneType } from '../../../../core/types/running.types';
import type { RunPaceContext } from '../run-preview/run-estimates';
import { roundRecovery } from './run-variants';
import {
  decodeMainSet, encodeMainSet, isUniform, mainSetSeconds, mainSetTitle, mainSetVolume, recoveryText,
  type MainSetSource, type MainSetSpec, type MainSetUnit,
} from './run-main-set';

export type SwapLevel = 'lower' | 'same' | 'higher';
export const SWAP_LEVELS: readonly SwapLevel[] = ['lower', 'same', 'higher'];

export interface SwapMiniBar { tone: 'work' | 'rest'; flex: number; height: number }

export interface SwapAlternative {
  key: string;
  level: SwapLevel;
  spec: MainSetSpec;
  /** "4 × 600 מ׳" / "פירמידה". */
  title: string;
  /** "600 מהיר · 2′ התאוששות" / "200-400-600-400-200 · 90″ בין". */
  sub: string;
  /** vs. the current main set, seconds (null without a pace). */
  deltaSec: number | null;
  equalVolume: boolean;
  current: boolean;
  bars: SwapMiniBar[];
}

export interface SwapGroup { level: SwapLevel; items: SwapAlternative[] }

const SIZES: Record<MainSetUnit, number[]> = {
  m: [200, 300, 400, 600, 800, 1000, 1200, 1600, 2000],
  s: [30, 45, 60, 90, 120, 180, 240, 300, 360, 480, 600, 720, 900, 1200],
};
const PYRAMID_STEPS: Record<MainSetUnit, number[]> = { m: [100, 200, 300, 400, 500], s: [30, 60, 90, 120, 180] };
const PYRAMID_SHAPES = [[1, 2, 1], [1, 2, 3, 2, 1], [1, 2, 3]];
const MIN_REP: Record<MainSetUnit, number> = { m: 100, s: 30 };
const VOLUME_TOLERANCE = 0.1;
const MAX_PER_LEVEL: Record<SwapLevel, number> = { lower: 2, same: 4, higher: 2 };
/** "Same" keeps room for a pyramid: at most two same-volume rep sizes. */
const MAX_SAME_SIZES = 2;
/** A pyramid / ladder's longest rep: up to 3× the current rep. */
const PYRAMID_MAX_RATIO = 3;

const FAST_WORDS: Partial<Record<RunZoneType, string>> = {
  sprint: 'מהיר', interval_short: 'מהיר', interval_long: 'מהיר', fartlek_fast: 'מהיר', fartlek_medium: 'בינוני', tempo: 'טמפו',
};

function sizeBounds(unit: MainSetUnit, size: number, category: string | null | undefined): [number, number] {
  let lo = size * 0.4;
  let hi = size * 2.6;
  const cat = (category ?? '').toLowerCase();
  if (unit === 'm' && /short|sprint|speed/.test(cat)) hi = Math.min(hi, 1000);
  if (unit === 'm' && /long/.test(cat)) lo = Math.max(lo, 400);
  return [lo, hi];
}

function equalVolume(a: MainSetSpec, b: MainSetSpec): boolean {
  const va = mainSetVolume(a);
  return Math.abs(mainSetVolume(b) - va) <= va * VOLUME_TOLERANCE;
}

function bare(unit: MainSetUnit, size: number): string {
  if (unit === 'm') return size >= 1000 ? `${size / 1000} ק״מ` : String(size);
  return size < 60 ? `${size}″` : size % 60 ? `${Math.floor(size / 60)}:${String(size % 60).padStart(2, '0')}′` : `${size / 60}′`;
}

function subText(spec: MainSetSpec, word: string): string {
  if (!isUniform(spec)) {
    const list = spec.reps.map((r) => (spec.unit === 'm' ? String(r) : bare(spec.unit, r))).join('-');
    return spec.recoverySec > 0 ? `${list} · ${recoveryText(spec.recoverySec)} בין` : list;
  }
  const head = `${bare(spec.unit, spec.reps[0])} ${word}`;
  return spec.recoverySec > 0 ? `${head} · ${recoveryText(spec.recoverySec)} התאוששות` : head;
}

function bars(spec: MainSetSpec, src: MainSetSource, ctx: RunPaceContext): SwapMiniBar[] {
  const max = Math.max(...spec.reps);
  const uniform = isUniform(spec);
  const out: SwapMiniBar[] = [];
  spec.reps.forEach((r, i) => {
    const sec = mainSetSeconds(src.work, { unit: spec.unit, reps: [r], recoverySec: 0 }, ctx) ?? (spec.unit === 'm' ? r * 0.3 : r);
    out.push({ tone: 'work', flex: Math.round((sec / 60) * 100) / 100, height: uniform ? 100 : Math.round(70 + (30 * r) / max) });
    if (i < spec.reps.length - 1 && spec.recoverySec > 0) out.push({ tone: 'rest', flex: Math.round((spec.recoverySec / 60) * 100) / 100, height: 30 });
  });
  return out;
}

/** "−7 דק׳" / "+2 דק׳ · אותו נפח" / "אותו נפח" / "—" (current). */
export function swapDeltaText(alt: Pick<SwapAlternative, 'deltaSec' | 'equalVolume' | 'current'>): string {
  if (alt.current) return '—';
  const min = alt.deltaSec == null ? 0 : Math.round(alt.deltaSec / 60);
  const parts: string[] = [];
  if (min !== 0) parts.push(`${min > 0 ? '+' : '−'}${Math.abs(min)} דק׳`);
  if (alt.equalVolume) parts.push('אותו נפח');
  return parts.join(' · ') || 'אותו זמן';
}

function uniformSpec(unit: MainSetUnit, size: number, n: number, rec: number): MainSetSpec {
  return { unit, reps: Array.from({ length: n }, () => size), recoverySec: rec };
}

function nearestSize(unit: MainSetUnit, target: number): number {
  return SIZES[unit].reduce((best, s) => (Math.abs(s - target) < Math.abs(best - target) ? s : best), SIZES[unit][0]);
}

/**
 * Candidates around the current main set, grouped lower / same / higher.
 * `selectedKey` marks the one the workout runs now (default: the source).
 * null when there is no main set to swap.
 */
export function buildSwapAlternatives(
  src: MainSetSource | null,
  ctx: RunPaceContext,
  opts: { category?: string | null; selectedKey?: string | null } = {},
): SwapGroup[] | null {
  if (!src || !isUniform(src.spec) || src.spec.reps.length < 2) return null;
  const { unit, recoverySec: rec } = src.spec;
  const size = src.spec.reps[0];
  const n = src.spec.reps.length;
  const volume = n * size;
  const [lo, hi] = sizeBounds(unit, size, opts.category);
  const word = (src.work.zoneType && FAST_WORDS[src.work.zoneType]) || (src.work.type === 'interval' ? 'מהיר' : 'ריצה');
  const baseSec = mainSetSeconds(src.work, src.spec, ctx);
  const sourceKey = encodeMainSet(src.spec);
  const selected = opts.selectedKey ?? sourceKey;

  const picked = new Map<string, SwapAlternative>();
  const add = (level: SwapLevel, spec: MainSetSpec) => {
    if (spec.reps.length < 2 || spec.reps.length > 16 || spec.reps.some((r) => r < MIN_REP[unit])) return;
    const key = encodeMainSet(spec);
    if (picked.has(key)) return;
    const sec = mainSetSeconds(src.work, spec, ctx);
    picked.set(key, {
      key,
      level: key === sourceKey ? 'same' : level,
      spec,
      title: mainSetTitle(spec),
      sub: subText(spec, word),
      deltaSec: sec != null && baseSec != null ? sec - baseSec : null,
      equalVolume: key !== sourceKey && equalVolume(src.spec, spec),
      current: key === selected,
      bars: bars(spec, src, ctx),
    });
  };

  // The current set always leads "same".
  add('same', src.spec);

  // Easier: fewer reps + longer recovery; half-size reps.
  const fewer = n >= 4 ? n - 2 : n - 1;
  if (fewer >= 2) add('lower', uniformSpec(unit, size, fewer, rec > 0 ? roundRecovery(rec * (4 / 3)) : 0));
  const half = nearestSize(unit, size / 2);
  if (half < size && half >= lo) add('lower', uniformSpec(unit, half, Math.round((n * 4) / 3), rec > 0 ? roundRecovery(rec * (2 / 3)) : 0));

  // Same volume, other rep sizes (ordered closest to the current size first).
  const eq = SIZES[unit]
    .filter((c) => c !== size && c >= lo && c <= hi)
    .sort((a, b) => Math.abs(Math.log(a / size)) - Math.abs(Math.log(b / size)));
  let sameSizes = 0;
  for (const c of eq) {
    const k = Math.round(volume / c);
    if (Math.abs(k * c - volume) > volume * VOLUME_TOLERANCE) continue;
    const r = c / size;
    const level: SwapLevel = r >= 1.9 ? 'higher' : r <= 0.55 ? 'lower' : 'same';
    if (level === 'same' && sameSizes >= MAX_SAME_SIZES) continue;
    if (level === 'same') sameSizes += 1;
    add(level, uniformSpec(unit, c, k, rec > 0 ? Math.min(300, roundRecovery(rec * r ** 0.7)) : 0));
  }

  // One pyramid / ladder of about the same volume.
  let pyramid: MainSetSpec | null = null;
  for (const step of PYRAMID_STEPS[unit]) {
    for (const shape of PYRAMID_SHAPES) {
      const reps = shape.map((f) => f * step);
      if (Math.max(...reps) > size * PYRAMID_MAX_RATIO) continue;
      const cand = { unit, reps, recoverySec: rec };
      if (!equalVolume(src.spec, cand)) continue;
      if (!pyramid || Math.abs(mainSetVolume(cand) - volume) < Math.abs(mainSetVolume(pyramid) - volume)) pyramid = cand;
    }
  }
  if (pyramid) add('same', pyramid);

  // Harder: shorter recovery; more reps.
  if (rec >= 60) add('higher', uniformSpec(unit, size, n, roundRecovery(rec / 2)));
  add('higher', uniformSpec(unit, size, n >= 4 ? n + 2 : n + 1, rec > 0 ? roundRecovery(rec * (2 / 3)) : 0));

  // The set the workout runs now (a level of the selector) is always listed.
  const sel = decodeMainSet(selected);
  if (sel && sel.unit === unit && !picked.has(selected)) add('same', sel);

  const groups: SwapGroup[] = SWAP_LEVELS.map((level) => {
    const all = Array.from(picked.values()).filter((a) => a.level === level);
    // Keep the current one, then the first candidates up to the cap.
    const items = [...all.filter((a) => a.current || a.key === sourceKey), ...all.filter((a) => !a.current && a.key !== sourceKey)]
      .slice(0, MAX_PER_LEVEL[level]);
    // The selected one is never cut.
    const sel = all.find((a) => a.current);
    if (sel && !items.includes(sel)) items[items.length - 1] = sel;
    return { level, items };
  });
  return groups.filter((g) => g.items.length > 0);
}
