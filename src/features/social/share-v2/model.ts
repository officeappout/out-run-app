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

const DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const pad2 = (n: number) => String(n).padStart(2, '0');
const posNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

export const MAX_ROWS = 3;
export const MAX_BOXES = 5;

/** "יום ב׳ · 19.10" — or with the time of day ("יום ב׳ · 06:40") for runs. */
export function shareDateLabel(ms: number | undefined, withTime: boolean): string | undefined {
  if (!posNum(ms)) return undefined;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return undefined;
  const day = `יום ${DAYS[d.getDay()]}`;
  return withTime ? `${day} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : `${day} · ${d.getDate()}.${d.getMonth() + 1}`;
}

/** "30:10" / "1:05:10". */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(sec)}` : `${m}:${pad2(sec)}`;
}

/** Strength: "42 · דקות" (or "1:05 · שעות"); run with seconds: "30:10 · זמן". */
export function durationStat(input: Pick<ShareImageInput, 'durationMinutes' | 'durationSeconds'>, clock: boolean): ShareStatV2 {
  if (clock && posNum(input.durationSeconds)) return { value: formatClock(input.durationSeconds), unit: 'זמן' };
  const min = Math.max(0, Math.round(input.durationMinutes || 0));
  if (min >= 60) return { value: `${Math.floor(min / 60)}:${pad2(min % 60)}`, unit: 'שעות' };
  return { value: String(min), unit: 'דקות' };
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
  const name = input.programName || input.title || 'אימון כוח';
  const level =
    posNum(input.levelIndex) && posNum(input.levelCount)
      ? { index: input.levelIndex, count: input.levelCount, frac: Math.min(1, input.levelIndex / input.levelCount) }
      : undefined;
  const sets = posNum(input.totalSets) ? { value: String(input.totalSets), unit: 'סטים' } : null;
  const reps = posNum(input.totalReps) ? { value: String(input.totalReps), unit: 'חזרות' } : null;
  const exCount = posNum(input.exerciseCount) ? input.exerciseCount : (input.topExercises?.length ?? 0) + (input.moreExercises ?? 0);
  const exercises = exCount > 0 ? { value: String(exCount), unit: 'תרגילים' } : null;
  const streak = posNum(input.streakDays) ? { value: String(input.streakDays), unit: 'ימים ברצף' } : null;
  const stats = [duration, sets, reps, exercises, streak].filter((s): s is ShareStatV2 => !!s).slice(0, 4);
  const hero = reps ?? sets ?? duration;
  const rows = setRows(input);
  const names = (input.topExercises ?? []).map((e) => e.name);
  return {
    kind: 'strength',
    dateLabel: shareDateLabel(input.dateMs, false),
    // Without a program name the name already says "אימון כוח" — don't repeat it.
    chip: (name === 'אימון כוח' ? [input.parkName] : ['אימון כוח', input.parkName]).filter(Boolean).join(' · ') || 'אימון הושלם',
    name,
    level,
    duration,
    stats,
    rows,
    moreLine: posNum(input.moreExercises) ? `ועוד ${input.moreExercises} תרגילים` : undefined,
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
    ...(pace ? [{ value: pace, unit: 'דק׳ לק״מ' }] : []),
    duration,
    ...(fastest ? [{ value: fastest, unit: 'הקפה מהירה' }] : []),
  ];
  const route = Array.isArray(input.routeShape) && input.routeShape.length >= 6 ? input.routeShape : undefined;
  const kmMarks = route && posNum(input.distanceKm) ? kmMarkFractions(input.distanceKm) : undefined;
  return {
    kind: 'cardio',
    dateLabel: shareDateLabel(input.dateMs, true),
    chip: [input.title || 'ריצה', input.parkName].filter(Boolean).join(' · '),
    name: input.title || 'ריצה',
    duration,
    stats,
    rows: [],
    streakDays: posNum(input.streakDays) ? input.streakDays : undefined,
    hero: km ? { value: km, unit: 'ק״מ' } : duration,
    distance: km,
    pace,
    fastest,
    splits,
    route,
    kmMarks: kmMarks?.length ? kmMarks : undefined,
    together: buildTogetherModel(input.together),
  };
}

export function buildShareModel(input: ShareImageInput): ShareModel {
  return input.kind === 'cardio' ? runModel(input) : strengthModel(input);
}
