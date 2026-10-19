import { describe, it, expect } from 'vitest';
import type { WorkoutPlan, WorkoutSegment } from '@/features/parks/core/types/route.types';
import { initTimed, reduceTimedAll } from '@/features/workout-engine/engines/timed/timed-machine';
import { timedView } from '@/features/workout-engine/engines/timed/timed.selectors';
import { buildTimedResult } from '@/features/workout-engine/engines/timed/timed-result';
import type { AmrapState, EmomState, TimedBlockSpec, TimedItem } from '@/features/workout-engine/engines/timed/timed.types';
import { stationRows } from '@/features/workout-engine/components/strength/utils/summary-v2.mapping';
import { mapToCompletedExercises } from '../../logic/summary-mapping';
import {
  isBookendSegment,
  mergeSegmentLog,
  resolveTimedSegment,
  segmentLogId,
  timedBlockPrefix,
  timedResultToLog,
  timedSegmentKey,
} from '../logic/timed-segment';
import {
  amrapRoundLine,
  blockTitle,
  ceilSec,
  clockCaption,
  emomRestLine,
  formatClock,
  formatInfo,
  headerClock,
  itemTarget,
  itemTargetText,
  itemUnit,
  readyItemLine,
  resultLine,
  timedEyebrow,
  workHint,
} from '../logic/timed-labels';
import { timedCardMode, underlyingPhase } from '../logic/timed-card';
import { pendingPrompt, promptEyebrow, promptInitialValue, readyToHandBack } from '../logic/timed-prompt';
import { addRunFix, cueSound, EMPTY_TRACK } from '../logic/timed-feedback';
import { timedListModel } from '../logic/timed-list';
import { blockProgress, mixedStoryBars, segmentBars, TIMED_BAR_WEIGHT } from '../logic/timed-header';

const T0 = 1_000_000;
const ex = (key: string, targetReps = 10, extra: Partial<TimedItem> = {}): TimedItem => ({ kind: 'exercise', key, exerciseId: key, name: key, targetReps, ...extra });

const planEx = (id: string, reps = '10') => ({ id, name: id, reps, exerciseType: 'reps' as const });
const seg = (id: string, extra: Partial<WorkoutSegment> = {}): WorkoutSegment =>
  ({ id, type: 'strength', title: id, exercises: [planEx(`${id}-a`), planEx(`${id}-b`)], ...extra }) as unknown as WorkoutSegment;
const amrapSeg = seg('finisher', { protocol: 'amrap', protocolConfig: { capSec: 300, roundItems: [] } } as Partial<WorkoutSegment>);
const workout = (segments: WorkoutSegment[]) => ({ segments }) as unknown as WorkoutPlan;

describe('timed-segment: who runs a segment', () => {
  it('flag off / embedded → regular strength flow', () => {
    expect(resolveTimedSegment(amrapSeg, { enabled: false })).toBeNull();
    expect(resolveTimedSegment(amrapSeg, { enabled: true, embedded: true })).toBeNull();
    expect(resolveTimedSegment(amrapSeg, { enabled: true })?.format).toBe('amrap');
  });

  it('classic segments and invalid configs stay classic', () => {
    expect(resolveTimedSegment(seg('main'), { enabled: true })).toBeNull();
    expect(resolveTimedSegment(seg('x', { protocol: 'emom', protocolConfig: { intervalSec: 0, totalIntervals: 5 } } as Partial<WorkoutSegment>), { enabled: true })).toBeNull();
    expect(resolveTimedSegment(seg('t', { protocol: 'tabata', protocolConfig: { workSec: 20, restSec: 10, rounds: 8 } } as Partial<WorkoutSegment>), { enabled: true })?.format).toBe('tabata');
  });

  it('key is stable across plan object rebuilds, changes with content', () => {
    const copy = JSON.parse(JSON.stringify(amrapSeg));
    expect(timedSegmentKey(copy)).toBe(timedSegmentKey(amrapSeg));
    expect(timedSegmentKey({ ...copy, protocolConfig: { capSec: 600, roundItems: [] } })).not.toBe(timedSegmentKey(amrapSeg));
    expect(timedSegmentKey(seg('main'))).toBe('');
  });

  it('prefix "פינישר" only after a classic main segment', () => {
    const w = workout([seg('warmup-1', { title: 'חימום' }), seg('main'), amrapSeg]);
    expect(timedBlockPrefix(w, 2)).toBe('פינישר');
    expect(timedBlockPrefix(workout([seg('warmup-1', { title: 'חימום' }), amrapSeg]), 1)).toBeNull();
    expect(isBookendSegment(seg('cool', { title: 'שחרור' }))).toBe(true);
    expect(segmentLogId(w, 2)).toBe('finisher');
  });

  it('result → log rows keyed by segment, merged over the segment, mapped by the summaries', () => {
    const spec = resolveTimedSegment(amrapSeg, { enabled: true })!;
    const s = reduceTimedAll(initTimed(spec), [
      { type: 'START', atMs: T0 },
      { type: 'ITEM_DONE', atMs: T0 + 30_000 },
      { type: 'ITEM_DONE', atMs: T0 + 60_000 },
      { type: 'ITEM_DONE', atMs: T0 + 90_000, reps: 7 },
      { type: 'TICK', atMs: T0 + 300_000 },
      { type: 'LOG_REPS', atMs: T0 + 301_000, reps: 4 },
    ]);
    expect(s.status).toBe('done');
    const rows = timedResultToLog(buildTimedResult(s), amrapSeg, 'finisher');
    expect(rows.map((r) => [r.exerciseId, r.segmentId, r.confirmedReps])).toEqual([
      ['finisher-a', 'finisher', [10, 7]],
      ['finisher-b', 'finisher', [10, 4]],
    ]);
    const stale = { exerciseId: 'finisher-a', exerciseName: 'x', segmentId: 'finisher', confirmedReps: [1], targetReps: 1 };
    const keep = { exerciseId: 'm', exerciseName: 'm', segmentId: 'main', confirmedReps: [8], targetReps: 8 };
    const merged = mergeSegmentLog([keep, stale], 'finisher', rows);
    expect(merged).toHaveLength(3);
    expect(merged[0]).toBe(keep);
    const completed = mapToCompletedExercises(workout([seg('main'), amrapSeg]), merged);
    expect(completed.find((c) => c.id === 'finisher:finisher-a')?.sets).toEqual([10, 7]);
    expect(stationRows(rows)[1].tiles.map((t) => t.tone)).toEqual(['in', 'below']);
  });
});

describe('timed-labels', () => {
  it('clocks', () => {
    expect(ceilSec(200)).toBe(1);
    expect(ceilSec(5000)).toBe(5);
    expect(formatClock(348, true)).toBe('05:48');
    expect(formatClock(38)).toBe('0:38');
  });

  it('titles, targets, units', () => {
    expect(blockTitle({ format: 'amrap', config: { capSec: 600, roundItems: [] }, items: [] })).toBe('AMRAP 10′');
    expect(blockTitle({ format: 'tabata', config: { workSec: 20, restSec: 10, rounds: 8 }, items: [] })).toBe('טבטה 20/10');
    expect(itemTarget(ex('a', 12))).toEqual({ value: '12', unit: 'חזרות' });
    expect(itemTargetText({ kind: 'exercise', key: 'p', name: 'p', targetHoldSec: 30 })).toBe('30 שנ׳');
    expect(itemUnit({ kind: 'exercise', key: 'p', name: 'p', targetHoldSec: 30 })).toBe('time');
    expect(itemTargetText({ kind: 'aerobic_leg', key: 'run-1', name: 'ריצה 400 מ׳', distanceM: 400 })).toBe('ריצה 400 מ׳');
  });

  it('AMRAP eyebrow / caption / round line', () => {
    const spec: TimedBlockSpec = { format: 'amrap', config: { capSec: 600, roundItems: [] }, items: [ex('a'), ex('b')] };
    const s = reduceTimedAll(initTimed(spec), [
      { type: 'START', atMs: T0 },
      { type: 'ITEM_DONE', atMs: T0 + 60_000 },
      { type: 'ITEM_DONE', atMs: T0 + 158_000 },
      { type: 'ITEM_DONE', atMs: T0 + 200_000 },
      { type: 'ITEM_DONE', atMs: T0 + 312_000 },
    ]) as AmrapState;
    const v = timedView(s, T0 + 320_000);
    expect(timedEyebrow(s, v)).toBe('סבב 3 · תרגיל 1 מתוך 2');
    expect(timedEyebrow(s, v, 'פינישר')).toBe('פינישר · סבב 3 · תרגיל 1 מתוך 2');
    expect(clockCaption(v, 'פינישר')).toBe('פינישר · נותרו');
    expect(headerClock(v)).toBe('04:40');
    expect(workHint(v, s.spec.items[0])).toBe('יעד קבוע בכל סבב');
    expect(amrapRoundLine(s, 0)).toBe('2:38 לסבב');
    expect(amrapRoundLine(s, 1)).toBe('2:34 לסבב · מהיר ב-0:04 מהסבב הקודם');
  });

  it('EMOM eyebrow, last-seconds hint, rest line', () => {
    const spec: TimedBlockSpec = { format: 'emom', config: { intervalSec: 60, totalIntervals: 12 }, items: [ex('squat', 12), ex('push', 10)] };
    const s = reduceTimedAll(initTimed(spec), [
      { type: 'START', atMs: T0 },
      { type: 'ITEM_DONE', atMs: T0 + 39_000 },
    ]) as EmomState;
    const rest = timedView(s, T0 + 40_000);
    expect(timedEyebrow(s, rest)).toBe('דקה 1/12');
    expect(rest.phase).toBe('rest');
    expect(emomRestLine(s, rest)).toBe('סיימת ב-0:39 · 20 שנ׳ מנוחה');
    const last = timedView(s, T0 + 116_000);
    expect(last.isLastSeconds).toBe(true);
    expect(workHint(last, spec.items[1])).toBe('עוד 4 שנ׳ — לא סיימת? נרשום כמה הספקת');
  });

  it('format info explains the format only', () => {
    const info = formatInfo({ format: 'amrap', config: { capSec: 600, roundItems: [] }, items: [ex('a'), ex('b'), ex('c'), ex('d')] });
    expect(info.title).toBe('מה זה AMRAP?');
    expect(info.lines[0]).toContain('10 דקות');
    expect(info.lines[1]).toContain('4 התרגילים');
    expect(formatInfo({ format: 'emom', config: { intervalSec: 60, totalIntervals: 12 }, items: [] }).lines[0]).toContain('כל דקה');
  });
});

describe('timed-prompt', () => {
  it('AMRAP asks for the cut item only', () => {
    const spec: TimedBlockSpec = { format: 'amrap', config: { capSec: 60, roundItems: [] }, items: [ex('a'), ex('b', 20)] };
    const s = reduceTimedAll(initTimed(spec), [
      { type: 'START', atMs: T0 },
      { type: 'ITEM_DONE', atMs: T0 + 20_000 },
      { type: 'TICK', atMs: T0 + 61_000 },
    ]);
    const p = pendingPrompt(s, new Set(), 60_000)!;
    expect(p.kind).toBe('amrap_partial');
    expect(p.item.key).toBe('b');
    expect(promptEyebrow(p)).toBe('הזמן נגמר · b בסבב 1');
    expect(promptInitialValue(p)).toBe(10);
    expect(readyToHandBack(s, p)).toBe(false);
    const done = reduceTimedAll(s, [{ type: 'LOG_REPS', atMs: T0 + 62_000, reps: 9 }]);
    expect(pendingPrompt(done, new Set(), 60_000)).toBeNull();
    expect(readyToHandBack(done, null)).toBe(true);
  });

  it('EMOM asks once per missed minute, after the grace window', () => {
    const spec: TimedBlockSpec = { format: 'emom', config: { intervalSec: 60, totalIntervals: 3 }, items: [ex('a', 12)] };
    const s = reduceTimedAll(initTimed(spec), [{ type: 'START', atMs: T0 }, { type: 'TICK', atMs: T0 + 60_500 }]);
    expect(pendingPrompt(s, new Set(), 60_500)).toBeNull();
    const later = reduceTimedAll(s, [{ type: 'TICK', atMs: T0 + 62_000 }]);
    const p = pendingPrompt(later, new Set(), 62_000)!;
    expect(p).toMatchObject({ kind: 'emom_missed', minuteIndex: 0 });
    expect(promptEyebrow(p)).toBe('דקה 1 · a');
    expect(pendingPrompt(later, new Set([0]), 62_000)).toBeNull();
    const logged = reduceTimedAll(later, [{ type: 'LOG_REPS', atMs: T0 + 63_000, reps: 8, index: 0 }]);
    expect(pendingPrompt(logged, new Set(), 63_000)).toBeNull();
  });
});

describe('timed-feedback', () => {
  it('cue sounds', () => {
    expect(cueSound({ type: 'countdown', secondsLeft: 3, atActiveMs: 0 })).toBe('short');
    expect(cueSound({ type: 'minute_start', minute: 0, atActiveMs: 0 })).toBeNull();
    expect(cueSound({ type: 'minute_start', minute: 4, atActiveMs: 0 })).toBe('long');
    expect(cueSound({ type: 'cap_reached', atActiveMs: 0 })).toBe('long');
  });

  it('run distance ignores jitter and jumps', () => {
    let t = addRunFix(EMPTY_TRACK, { lat: 32, lng: 34.8 });
    t = addRunFix(t, { lat: 32.00001, lng: 34.8 }); // ~1 m jitter
    expect(t.distanceM).toBe(0);
    t = addRunFix(t, { lat: 32.0005, lng: 34.8 }); // ~55 m
    expect(Math.round(t.distanceM)).toBe(56);
    t = addRunFix(t, { lat: 32.01, lng: 34.8 }); // ~1 km jump
    expect(Math.round(t.distanceM)).toBe(56);
  });
});

describe('timed-list', () => {
  it('AMRAP basket: done summed per item, rest of the round queued', () => {
    const spec: TimedBlockSpec = { format: 'amrap', config: { capSec: 600, roundItems: [] }, items: [ex('a', 12), ex('b', 10), ex('c', 8)] };
    const s = reduceTimedAll(initTimed(spec), [
      { type: 'START', atMs: T0 },
      { type: 'ITEM_DONE', atMs: T0 + 10_000 },
      { type: 'ITEM_DONE', atMs: T0 + 20_000 },
      { type: 'ITEM_DONE', atMs: T0 + 30_000 },
      { type: 'ITEM_DONE', atMs: T0 + 40_000 },
    ]);
    const m = timedListModel(s, T0 + 45_000);
    expect(m.headline).toBe('4 פריטים בסל');
    expect(m.summary).toBe('1 סבב מלא · 42 חזרות');
    expect(m.done.map((r) => [r.name, r.detail, r.trailing])).toEqual([
      ['a', '24 חזרות', '×2'],
      ['b', '10 חזרות', '×1'],
      ['c', '8 חזרות', '×1'],
    ]);
    expect(m.queueTitle).toBe('סבב 2');
    expect(m.queue.map((r) => [r.name, r.now ?? false])).toEqual([['b', true], ['c', false]]);
  });

  it('EMOM pills per minute', () => {
    const spec: TimedBlockSpec = { format: 'emom', config: { intervalSec: 60, totalIntervals: 4 }, items: [ex('a', 12), ex('b', 10)] };
    const s = reduceTimedAll(initTimed(spec), [
      { type: 'START', atMs: T0 },
      { type: 'ITEM_DONE', atMs: T0 + 41_000 },
      { type: 'TICK', atMs: T0 + 125_000 },
      { type: 'LOG_REPS', atMs: T0 + 126_000, reps: 8, index: 1 },
    ]);
    const m = timedListModel(s, T0 + 126_000);
    expect(m.done[0].pills).toEqual([{ label: '0:41', tone: 'done' }]);
    expect(m.done[0].trailing).toBe('דקה 3');
    expect(m.done[1].pills).toEqual([{ label: '8/10', tone: 'partial' }]);
    expect(m.headline).toBe('1 דקה הושלמה');
    expect(m.queue[0]).toMatchObject({ detail: 'דקה 3 · 12 חזרות', now: true });
  });

  it('tabata intervals per member', () => {
    const spec: TimedBlockSpec = { format: 'tabata', config: { workSec: 20, restSec: 10, rounds: 4 }, items: [ex('a'), ex('b')] };
    const s = reduceTimedAll(initTimed(spec), [{ type: 'START', atMs: T0 }]);
    const m = timedListModel(s, T0 + 35_000); // interval 2 work
    expect(m.headline).toBe('1/4 אינטרוולים');
    expect(m.done.map((r) => r.detail)).toEqual(['20 שנ׳ · 1/2', '20 שנ׳ · 0/2']);
    expect(m.queue[0]).toMatchObject({ name: 'b', now: true });
  });
});

describe('timed-header', () => {
  it('one bar per segment with content, the block is current', () => {
    const w = workout([seg('warmup-1'), seg('empty', { exercises: [] }), seg('main'), amrapSeg]);
    const b = segmentBars(w, 3);
    expect(b.segments.map((s) => s.key)).toEqual(['warmup-1', 'main', 'finisher']);
    expect(b.currentIndex).toBe(2);
    expect(blockProgress(150_000, 300_000)).toBe(0.5);
    expect(blockProgress(1, 0)).toBe(0);
  });
});

describe('timed-card', () => {
  const tabata: TimedBlockSpec = { format: 'tabata', config: { workSec: 20, restSec: 10, rounds: 4 }, items: [ex('a'), ex('b')] };
  const emom: TimedBlockSpec = { format: 'emom', config: { intervalSec: 60, totalIntervals: 3 }, items: [ex('a', 12)] };

  it('ready → clock / rest for tabata, through a pause', () => {
    const idle = initTimed(tabata);
    expect(timedCardMode(idle, timedView(idle, T0), null)).toBe('ready');
    const s = reduceTimedAll(idle, [{ type: 'START', atMs: T0 }]);
    expect(timedCardMode(s, timedView(s, T0 + 5_000), null)).toBe('clock');
    expect(timedCardMode(s, timedView(s, T0 + 25_000), null)).toBe('rest');
    const paused = reduceTimedAll(s, [{ type: 'PAUSE', atMs: T0 + 25_000 }]);
    const pv = timedView(paused, T0 + 40_000);
    expect(pv.phase).toBe('paused');
    expect(underlyingPhase(paused, pv)).toBe('rest');
    expect(timedCardMode(paused, pv, null)).toBe('rest');
  });

  it('EMOM work → rest after done; prompt wins; done at the end', () => {
    const s = reduceTimedAll(initTimed(emom), [{ type: 'START', atMs: T0 }]);
    expect(timedCardMode(s, timedView(s, T0 + 1_000), null)).toBe('work');
    const d = reduceTimedAll(s, [{ type: 'ITEM_DONE', atMs: T0 + 30_000 }]);
    expect(timedCardMode(d, timedView(d, T0 + 31_000), null)).toBe('rest');
    const p = pendingPrompt(reduceTimedAll(d, [{ type: 'TICK', atMs: T0 + 125_000 }]), new Set(), 125_000);
    expect(timedCardMode(d, timedView(d, T0 + 125_000), p)).toBe('prompt');
    const end = reduceTimedAll(d, [{ type: 'TICK', atMs: T0 + 200_000 }]);
    expect(timedCardMode(end, timedView(end, T0 + 200_000), null)).toBe('done');
  });

  it('result line + ready lines', () => {
    const am: TimedBlockSpec = { format: 'amrap', config: { capSec: 60, roundItems: [] }, items: [ex('a', 5), ex('b', 5)] };
    const s = reduceTimedAll(initTimed(am), [
      { type: 'START', atMs: T0 },
      { type: 'ITEM_DONE', atMs: T0 + 10_000 },
      { type: 'ITEM_DONE', atMs: T0 + 20_000 },
      { type: 'ITEM_DONE', atMs: T0 + 30_000 },
      { type: 'TICK', atMs: T0 + 61_000 },
      { type: 'LOG_REPS', atMs: T0 + 62_000, reps: 3 },
    ]);
    expect(resultLine(buildTimedResult(s))).toBe('1 סבב מלא · ועוד 8 חזרות');
    expect(readyItemLine(am, 0)).toBe('5 חזרות · בכל סבב');
    expect(readyItemLine({ ...emom, items: [ex('a', 12), ex('b', 10)] }, 1)).toBe('דקות זוגיות · 10 חזרות');
    expect(readyItemLine(tabata, 0)).toBe('20 שנ׳');
  });
});

describe('mixedStoryBars (A-5b)', () => {
  it('classic sets as bars, the timed block as one wide bar', () => {
    const w = workout([seg('main'), amrapSeg]);
    const opts = { isTimed: (i: number) => i === 1, setsOf: () => 3, loggedSetsOf: (i: number) => (i === 0 ? 1 : 40) };
    const atMain = mixedStoryBars(w, { ...opts, currentSegmentIndex: 0 });
    expect(atMain.map((b) => [b.isActive, b.isCurrent, b.weight ?? 1])).toEqual([
      [true, false, 1],
      [false, true, 1],
      [false, false, 1],
      [false, false, TIMED_BAR_WEIGHT],
    ]);
    const atBlock = mixedStoryBars(w, { ...opts, currentSegmentIndex: 1 });
    expect(atBlock.map((b) => [b.isActive, b.isCurrent])).toEqual([[true, false], [true, false], [true, false], [false, true]]);
  });
});
