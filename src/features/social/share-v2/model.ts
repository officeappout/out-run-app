/**
 * ShareImageInput → ShareModel: every string a v2 template may draw, derived
 * once. Pure, unit-tested. A missing fact is dropped (never invented); the
 * templates' layouts then grow what's left so the image stays full.
 */
import { formatSecPerKm, paceBarHeights } from '../services/feed-post-details';
import type { ShareImageInput } from '../services/share-image';
import { kmMarkFractions } from './route-geometry';
import { buildTogetherModel } from './together';
import type { ShareModel, ShareSetRow, ShareStatV2 } from './types';
import { unitLabel, weekdayLabel } from '@/lib/i18n/units';
import { fastestLapUnit, shareCommonT, shareT, streakUnit, strengthDefaultName } from './copy';
import { estimateSteps } from '@/lib/steps-estimate';

const pad2 = (n: number) => String(n).padStart(2, '0');
const posNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

export const MAX_ROWS = 3;
export const MAX_BOXES = 5;

/** "Mon · 10/19" (he: "day Mon · 19.10") — or with the time of day ("06:40") for runs. */
export function shareDateLabel(ms: number | undefined, withTime: boolean): string | undefined {
  if (!posNum(ms)) return undefined;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return undefined;
  const weekday = weekdayLabel(d.getDay(), 'short', shareCommonT);
  return withTime
    ? shareT('shareV2.date.withTime', { weekday, time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}` })
    : shareT('shareV2.date.withDate', { weekday, day: String(d.getDate()), month: String(d.getMonth() + 1) });
}

/** "30:10" / "1:05:10". */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(sec)}` : `${m}:${pad2(sec)}`;
}

/** Strength: "42 · minutes" (or "1:05 · hours"); run with seconds: "30:10 · time". */
export function durationStat(input: Pick<ShareImageInput, 'durationMinutes' | 'durationSeconds'>, clock: boolean): ShareStatV2 {
  if (clock && posNum(input.durationSeconds)) return { value: formatClock(input.durationSeconds), unit: shareT('shareV2.duration.clock') };
  const min = Math.max(0, Math.round(input.durationMinutes || 0));
  if (min >= 60) return { value: `${Math.floor(min / 60)}:${pad2(min % 60)}`, unit: unitLabel('hours', shareCommonT) };
  return { value: String(min), unit: unitLabel('minutes', shareCommonT) };
}

export function setRows(input: ShareImageInput): ShareSetRow[] {
  return (input.topExercises ?? []).slice(0, MAX_ROWS).map((e) => {
    const n = Math.min(MAX_BOXES, Math.max(e.sets, e.setsDone));
    const label = e.value !== undefined ? String(e.value) : '✓';
    return { name: e.name, boxes: Array.from({ length: n }, (_, i) => (i < e.setsDone ? label : null)) };
  });
}

function strengthModel(input: ShareImageInput): ShareModel {
  const duration = durationStat(input, false);
  const name = input.programName || input.title || strengthDefaultName();
  const level =
    posNum(input.levelIndex) && posNum(input.levelCount)
      ? { index: input.levelIndex, count: input.levelCount, frac: Math.min(1, input.levelIndex / input.levelCount) }
      : undefined;
  const sets = posNum(input.totalSets) ? { value: String(input.totalSets), unit: shareT('shareV2.unit.sets') } : null;
  const reps = posNum(input.totalReps) ? { value: String(input.totalReps), unit: shareT('shareV2.unit.reps') } : null;
  const exCount = posNum(input.exerciseCount) ? input.exerciseCount : (input.topExercises?.length ?? 0) + (input.moreExercises ?? 0);
  const exercises = exCount > 0 ? { value: String(exCount), unit: shareT('shareV2.unit.exercises') } : null;
  const streak = posNum(input.streakDays) ? { value: String(input.streakDays), unit: streakUnit() } : null;
  const stats = [duration, sets, reps, exercises, streak].filter((s): s is ShareStatV2 => !!s).slice(0, 4);
  const hero = reps ?? sets ?? duration;
  const rows = setRows(input);
  const names = (input.topExercises ?? []).map((e) => e.name);
  return {
    kind: 'strength',
    dateLabel: shareDateLabel(input.dateMs, false),
    // Without a program name the name already says "strength workout": don't repeat it.
    chip: (name === strengthDefaultName() ? [input.parkName] : [strengthDefaultName(), input.parkName]).filter(Boolean).join(' · ') || shareT('shareV2.doneFallback'),
    name,
    level,
    duration,
    stats,
    rows,
    moreLine: posNum(input.moreExercises) ? shareT('shareV2.more', { count: input.moreExercises }) : undefined,
    exerciseNames: names.length ? names.join(' · ') + (input.moreExercises ? ' · …' : '') : undefined,
    streakDays: streak ? input.streakDays : undefined,
    hero,
  };
}

function runModel(input: ShareImageInput): ShareModel {
  const duration = durationStat(input, true);
  const km = posNum(input.distanceKm) ? input.distanceKm.toFixed(1) : undefined;
  const pace = posNum(input.paceSecPerKm) ? formatSecPerKm(input.paceSecPerKm) : undefined;
  const splitsIn = Array.isArray(input.paceSplits) && input.paceSplits.length >= 2 ? input.paceSplits : undefined;
  let splits: ShareModel['splits'];
  let fastest: string | undefined;
  if (splitsIn) {
    const min = Math.min(...splitsIn);
    fastest = formatSecPerKm(min);
    splits = { heights: paceBarHeights(splitsIn), fastestIndex: splitsIn.indexOf(min), fastestLabel: fastest };
  }
  const stats: ShareStatV2[] = [
    ...(pace ? [{ value: pace, unit: unitLabel('minPerKm', shareCommonT) }] : []),
    duration,
    ...(fastest ? [{ value: fastest, unit: fastestLapUnit() }] : []),
  ];
  const route = Array.isArray(input.routeShape) && input.routeShape.length >= 6 ? input.routeShape : undefined;
  const kmMarks = route && posNum(input.distanceKm) ? kmMarkFractions(input.distanceKm) : undefined;
  return {
    kind: 'cardio',
    dateLabel: shareDateLabel(input.dateMs, true),
    chip: [input.title || shareT('shareV2.run.name'), input.parkName].filter(Boolean).join(' · '),
    name: input.title || shareT('shareV2.run.name'),
    duration,
    stats,
    rows: [],
    streakDays: posNum(input.streakDays) ? input.streakDays : undefined,
    hero: km ? { value: km, unit: unitLabel('km', shareCommonT) } : duration,
    distance: km,
    pace,
    fastest,
    splits,
    route,
    kmMarks: kmMarks?.length ? kmMarks : undefined,
    together: buildTogetherModel(input.together),
  };
}

export interface ShareModelOptions {
  /** enable_workout_post_v1: the post family (walk / combined, new stickers, sticker logo at the bottom). */
  postV1?: boolean;
}

/** Walk family: the steps are the hero, then km and time; never a pace. */
function walkModel(base: ShareModel, input: ShareImageInput): ShareModel {
  const km = posNum(input.distanceKm) ? input.distanceKm : 0;
  const name = input.title || shareT('shareV2.walk.name');
  const steps = estimateSteps(km);
  return {
    ...base,
    name,
    chip: [name, input.parkName].filter(Boolean).join(' · '),
    hero: steps > 0 ? { value: steps.toLocaleString('en-US'), unit: shareT('shareV2.unit.steps') } : base.hero,
    stats: [...(km > 0 ? [{ value: km.toFixed(1), unit: unitLabel('km', shareCommonT) }] : []), base.duration],
    pace: undefined,
    fastest: undefined,
    splits: undefined,
  };
}

/** Combined family: total time as the hero; the walk / run km and the strength sets beside it. */
function combinedModel(base: ShareModel, input: ShareImageInput): ShareModel {
  const h = input.hybrid!;
  const name = input.title || shareT('shareV2.combined.name');
  const aerKm = h.walkKm + h.runKm;
  const stats: ShareStatV2[] = [
    ...(aerKm > 0 ? [{ value: aerKm.toFixed(1), unit: unitLabel('km', shareCommonT) }] : []),
    ...(h.strengthSets > 0 ? [{ value: String(h.strengthSets), unit: shareT('shareV2.unit.sets') }] : []),
  ];
  const total = durationStat(input, false);
  return { ...base, name, chip: [name, input.parkName].filter(Boolean).join(' · '), hero: total, stats, pace: undefined, fastest: undefined, splits: undefined, combined: true };
}

export function buildShareModel(input: ShareImageInput, opts: ShareModelOptions = {}): ShareModel {
  const base = input.kind === 'cardio' ? runModel(input) : strengthModel(input);
  if (!opts.postV1) return base;
  const post = { ...base, postV1: true };
  if (input.hybrid) return combinedModel(post, input);
  if (input.kind === 'cardio' && input.activity === 'walking') return walkModel(post, input);
  return post;
}
