/**
 * i18n batch aw (namespace `player`, keys `timedLabels.*`): the timed-player label builders (logic/*).
 * Snapshots recorded BEFORE the extraction from unmodified origin/main — JSON dumps of every label function over a
 * matrix of engine states (every format, every phase, items with reps / hold / aerobic legs, counts 0 / 1 / 2 / many
 * and >= 1000, with / without the "finisher" prefix). The extraction must keep them byte-identical.
 * (The player labels carry no gender: the Hebrew is the same for male / female / unknown.)
 */
import { describe, expect, it } from 'vitest';
import type { WorkoutPlan, WorkoutSegment } from '@/features/parks/core/types/route.types';
import { initTimed, reduceTimedAll } from '@/features/workout-engine/engines/timed/timed-machine';
import { timedView } from '@/features/workout-engine/engines/timed/timed.selectors';
import type { TimedBlockResult } from '@/features/workout-engine/engines/timed/timed-result';
import type { AmrapState, EmomState, TimedBlockSpec, TimedEvent, TimedItem, TimedState } from '@/features/workout-engine/engines/timed/timed.types';
import {
  amrapRoundLine,
  blockTitle,
  clockCaption,
  emomRestLine,
  formatInfo,
  headerClock,
  itemTarget,
  itemTargetText,
  miniPlayerInfo,
  nextCaption,
  phaseClock,
  readyItemLine,
  resultLine,
  timedEyebrow,
  workHint,
} from '../logic/timed-labels';
import { timedListModel } from '../logic/timed-list';
import { timedPlaylistModel } from '../logic/timed-playlist';
import { promptEyebrow, pendingPrompt, type TimedPrompt } from '../logic/timed-prompt';
import { timedBlockPrefix } from '../logic/timed-segment';

const snap = (name: string) => `./__snapshots__/aw-i18n/${name}.json`;
/** One line per leaf record (path + compact JSON): readable diffs, small files. */
const dump = (v: unknown): string => {
  const lines: string[] = [];
  const walk = (path: string, x: unknown, depth: number) => {
    if (depth < 2 && x && typeof x === 'object' && !Array.isArray(x)) for (const [k, y] of Object.entries(x)) walk(path ? `${path}/${k}` : k, y, depth + 1);
    else lines.push(`${path} ${JSON.stringify(x)}`);
  };
  walk('', v, 0);
  return lines.join('\n') + '\n';
};
const T0 = 1_000_000;

const ex = (key: string, targetReps = 10, extra: Partial<TimedItem> = {}): TimedItem => ({ kind: 'exercise', key, exerciseId: key, name: key, targetReps, ...extra });
const hold = (key: string, sec = 30): TimedItem => ({ kind: 'exercise', key, exerciseId: key, name: key, targetHoldSec: sec });
const bare = (key: string): TimedItem => ({ kind: 'exercise', key, exerciseId: key, name: key });
const runM = (key: string, m = 400): TimedItem => ({ kind: 'aerobic_leg', key, name: `ריצה ${m} מ׳`, distanceM: m });
const runT = (key: string, sec = 90): TimedItem => ({ kind: 'aerobic_leg', key, name: 'ריצה קלה', durationSec: sec });
const runNone = (key: string): TimedItem => ({ kind: 'aerobic_leg', key, name: 'ריצה' });

const amrap = (items: TimedItem[], capSec = 600): TimedBlockSpec => ({ format: 'amrap', config: { capSec, roundItems: [] }, items });
const emom = (items: TimedItem[], intervalSec = 60, totalIntervals = 12): TimedBlockSpec => ({ format: 'emom', config: { intervalSec, totalIntervals }, items });
const tabata = (items: TimedItem[], workSec = 20, restSec = 10, rounds = 8): TimedBlockSpec => ({ format: 'tabata', config: { workSec, restSec, rounds }, items });

/** Every label function over the state after each event prefix, sampled at three moments. */
function labelsAt(spec: TimedBlockSpec, events: TimedEvent[]) {
  const out: Record<string, unknown> = {};
  for (let k = 0; k <= events.length; k++) {
    const state = reduceTimedAll(initTimed(spec), events.slice(0, k)) as TimedState;
    const last = k === 0 ? T0 : events[k - 1].atMs;
    for (const dt of [500, 20_000]) {
      const now = last + dt;
      const view = timedView(state, now);
      const key = `e${k}+${dt}`;
      const row: Record<string, unknown> = {
        status: view.status,
        eyebrow: timedEyebrow(state, view),
        eyebrowFinisher: timedEyebrow(state, view, 'פינישר'),
        caption: clockCaption(view),
        captionFinisher: clockCaption(view, 'פינישר'),
        header: headerClock(view),
        phase: phaseClock(view),
        next: nextCaption(view),
        mini: miniPlayerInfo(state, view),
        miniFinisher: miniPlayerInfo(state, view, 'פינישר'),
        hints: spec.items.map((it) => workHint(view, it)),
        hintNull: workHint(view, null),
        list: timedListModel(state, now),
      };
      if (state.spec.format === 'emom') row.restLine = emomRestLine(state as EmomState, view);
      out[key] = row;
    }
    if (state.spec.format === 'amrap') {
      const rounds = (state as AmrapState).data.rounds.length;
      for (let r = 0; r < rounds + 1; r++) out[`e${k}/round${r}`] = amrapRoundLine(state as AmrapState, r);
    }
    for (const asked of [new Set<number>(), new Set([0, 1, 2, 3, 4, 5])]) {
      const prompt = pendingPrompt(state, asked, last + 2_500);
      out[`e${k}/prompt${asked.size}`] = prompt ? { prompt: prompt.kind, eyebrow: promptEyebrow(prompt) } : null;
    }
  }
  return out;
}

const D = (s: number) => s * 1000;
const amrapEvents = (n: number): TimedEvent[] => {
  const ev: TimedEvent[] = [{ type: 'START', atMs: T0 }];
  let t = 0;
  for (let i = 0; i < n; i++) {
    t += [30, 28, 25, 35, 31, 1][i % 6] * 1000 + (i % 3) * 7000;
    ev.push({ type: 'ITEM_DONE', atMs: T0 + t, ...(i % 4 === 3 ? { reps: 7 } : {}) });
  }
  return ev;
};

describe('aw parity — timed labels', () => {
  it('AMRAP: reps / hold / run items, rounds, cap + partial prompt', async () => {
    const specs: Record<string, TimedBlockSpec> = {
      one: amrap([ex('a', 12)], 300),
      two: amrap([ex('a', 12), hold('p')], 600),
      mix: amrap([ex('a', 12), hold('p', 45), runM('r1'), runT('r2'), runNone('r3'), bare('b')], 900),
      many: amrap([ex('a', 1000), ex('b', 5), ex('c', 1), hold('d', 1), runM('e', 1500)], 1260),
    };
    const out: Record<string, unknown> = {};
    for (const [name, spec] of Object.entries(specs)) {
      const ev = amrapEvents(spec.items.length * 3 + 2);
      const capEv: TimedEvent[] = [...ev, { type: 'TICK', atMs: T0 + (spec as { config: { capSec: number } }).config.capSec * 1000 + 100 }];
      out[name] = labelsAt(spec, capEv);
      out[`${name}/afterPartial`] = labelsAt(spec, [...capEv, { type: 'LOG_REPS', atMs: capEv[capEv.length - 1].atMs + 1000, reps: 4 }]);
    }
    await expect(dump(out)).toMatchFileSnapshot(snap('amrap-labels'));
  });

  it('EMOM: 1 / 2 / 3 items, minute intervals, missed + partial + done minutes', async () => {
    const out: Record<string, unknown> = {};
    const items = { one: [ex('squat', 12)], two: [ex('squat', 12), ex('push', 10)], three: [ex('a', 12), hold('p', 20), runM('r')], aer: [runT('r'), ex('x', 8)] };
    for (const [name, its] of Object.entries(items)) {
      for (const interval of [60, 45]) {
        const spec = emom(its, interval, 8);
        const ev: TimedEvent[] = [
          { type: 'START', atMs: T0 },
          { type: 'ITEM_DONE', atMs: T0 + D(39) },
          { type: 'TICK', atMs: T0 + D(interval) + 3_000 },
          { type: 'ITEM_DONE', atMs: T0 + D(interval) + D(20) },
          { type: 'TICK', atMs: T0 + D(interval * 2) + 3_000 },
          { type: 'LOG_REPS', atMs: T0 + D(interval * 2) + 4_000, reps: 3, index: 1 },
          { type: 'PAUSE', atMs: T0 + D(interval * 2) + D(10) },
          { type: 'RESUME', atMs: T0 + D(interval * 2) + D(30) },
          { type: 'TICK', atMs: T0 + D(interval * 3) + 40_000 },
          { type: 'FINISH', atMs: T0 + D(interval * 4) + 500 },
        ];
        out[`${name}/${interval}`] = labelsAt(spec, ev);
      }
    }
    await expect(dump(out)).toMatchFileSnapshot(snap('emom-labels'));
  });

  it('Tabata: unilateral members, work / rest, pause, done', async () => {
    const out: Record<string, unknown> = {};
    for (const [name, spec] of Object.entries({
      plain: tabata([ex('a', 10), ex('b', 10)], 20, 10, 8),
      uni: tabata([ex('a', 10, { isUnilateral: true }), ex('b', 10)], 30, 15, 6),
      big: tabata([ex('a', 10), ex('b', 5), ex('c', 5)], 40, 20, 1100),
    })) {
      const ev: TimedEvent[] = [{ type: 'START', atMs: T0 }];
      for (let s = 12; s <= 400; s += 23) ev.push({ type: 'TICK', atMs: T0 + D(s) });
      ev.splice(5, 0, { type: 'PAUSE', atMs: T0 + D(95) }, { type: 'RESUME', atMs: T0 + D(105) });
      ev.push({ type: 'LOG_REPS', atMs: T0 + D(401), reps: 8 }, { type: 'FINISH', atMs: T0 + D(900) });
      out[name] = labelsAt(spec, ev.sort((a, b) => a.atMs - b.atMs));
    }
    await expect(dump(out)).toMatchFileSnapshot(snap('tabata-labels'));
  });
});

describe('aw parity — pure label helpers', () => {
  it('titles, targets, format explainers', async () => {
    const specs: TimedBlockSpec[] = [
      amrap([], 600), amrap([], 90), amrap([], 3600), emom([], 60, 12), emom([], 30, 10), tabata([], 20, 10, 8), tabata([], 45, 15, 1), tabata([], 20, 10, 1000),
    ];
    const items: Array<TimedItem | null | undefined> = [
      null, undefined, ex('a', 12), ex('a', 1), ex('a', 1000), hold('h', 30), hold('h', 1), bare('b'), runM('r'), runM('r', 5), runT('r'), runT('r', 3725), runNone('r'),
      { kind: 'exercise', key: 'both', name: 'both', targetReps: 8, targetHoldSec: 20 },
    ];
    const infoSpecs: TimedBlockSpec[] = [
      amrap([], 600), amrap([ex('a')], 600), amrap([ex('a'), ex('b')], 90), amrap([ex('a'), ex('b'), ex('c'), ex('d')], 3600), amrap(Array.from({ length: 1000 }, (_, i) => ex(`k${i}`)), 1200),
      emom([], 60, 12), emom([], 45, 10), emom([], 30, 1000), emom([], 120, 1), tabata([], 20, 10, 8), tabata([], 40, 20, 1200),
    ];
    const results: TimedBlockResult[] = [];
    const base = { outcome: 'completed' as const, startedAtMs: 0, endedAtMs: 1, activeSec: 1, plannedSec: 1, exerciseLog: [], aerobicLegs: [] };
    for (const fullRounds of [0, 1, 2, 4, 1000, 12345]) {
      for (const extraReps of [0, 1, 2, 16, 1500]) {
        results.push({ ...base, format: 'amrap', amrap: { score: { fullRounds, extraReps } as never, rounds: [] } });
      }
    }
    results.push({ ...base, format: 'emom', emom: { minutes: [], done: 11, total: 12 } }, { ...base, format: 'emom', emom: { minutes: [], done: 0, total: 1000 } });
    results.push({ ...base, format: 'tabata', tabata: { intervalsDone: 8, intervalsTotal: 8 } }, { ...base, format: 'tabata', tabata: { intervalsDone: 0, intervalsTotal: 1200 } });
    results.push({ ...base, format: 'amrap' });
    const out = {
      blockTitle: specs.map((s) => [s.format, blockTitle(s)]),
      itemTarget: items.map((i) => itemTarget(i)),
      itemTargetText: items.map((i) => itemTargetText(i)),
      formatInfo: infoSpecs.map((s) => formatInfo(s)),
      resultLine: results.map((r) => resultLine(r)),
      readyItemLine: ([
        amrap([ex('a', 12), runM('r'), bare('b'), hold('h')]), emom([ex('a', 12)]), emom([ex('a', 12), hold('h'), bare('b')]), emom([runM('r'), ex('a', 7)]),
        emom([ex('a'), ex('b'), ex('c'), ex('d'), ex('e')]), emom([bare('a'), bare('b')]), tabata([ex('a'), ex('u', 8, { isUnilateral: true })], 30, 15, 6),
      ] as TimedBlockSpec[]).map((s) => [0, 1, 2, 3, 4, 5, 9].map((i) => readyItemLine(s, i))),
    };
    await expect(dump(out)).toMatchFileSnapshot(snap('helpers'));
  });

  it('prompt eyebrows', async () => {
    const prompts: TimedPrompt[] = [
      { kind: 'amrap_partial', itemIndex: 0, item: ex('שכיבות סמיכה'), round: 5 },
      { kind: 'amrap_partial', itemIndex: 1, item: ex('a'), round: 1 },
      { kind: 'amrap_partial', itemIndex: 1, item: ex('a'), round: 1200 },
      { kind: 'emom_missed', minuteIndex: 4, item: ex('סקוואט') },
      { kind: 'emom_missed', minuteIndex: 0, item: ex('a') },
      { kind: 'emom_missed', minuteIndex: 1199, item: ex('a') },
    ];
    await expect(dump(prompts.map(promptEyebrow))).toMatchFileSnapshot(snap('prompt-eyebrow'));
  });

  it('block prefix + the classic-list model (before / after / upcoming)', async () => {
    const planEx = (id: string) => ({ id, name: id, reps: '10', exerciseType: 'reps' as const });
    const seg = (id: string, extra: Partial<WorkoutSegment> = {}): WorkoutSegment =>
      ({ id, type: 'strength', title: id, exercises: [planEx(`${id}-a`), planEx(`${id}-b`)], ...extra }) as unknown as WorkoutSegment;
    const fin = seg('finisher', { protocol: 'amrap', protocolConfig: { capSec: 300, roundItems: [] } } as Partial<WorkoutSegment>);
    const w = (segs: WorkoutSegment[]) => ({ segments: segs }) as unknown as WorkoutPlan;
    const prefixes = [
      timedBlockPrefix(w([seg('warmup-1', { title: 'חימום' }), seg('main'), fin]), 2),
      timedBlockPrefix(w([seg('warmup-1', { title: 'חימום' }), fin]), 1),
      timedBlockPrefix(w([fin]), 0),
      timedBlockPrefix(w([seg('x', { title: 'מתיחות' }), fin]), 1),
    ];
    const log = (reps: number[], source: string) => [{ exerciseId: 'a', exerciseName: 'a', segmentId: 's', confirmedReps: reps, targetReps: 12, repsSource: reps.map(() => source) as never }];
    const result = (full: number): TimedBlockResult => ({ format: 'amrap', outcome: 'completed', startedAtMs: 0, endedAtMs: 1, activeSec: 1, plannedSec: 1, exerciseLog: [], aerobicLegs: [], amrap: { score: { fullRounds: full, extraReps: 3 } as never, rounds: [] } });
    const playlists: unknown[] = [];
    for (const spec of [amrap([ex('a', 12), hold('p')]), emom([ex('a', 12), ex('b', 5)]), tabata([ex('a', 10, { isUnilateral: true })]), emom([ex('a')]), amrap([ex('a', 1)], 60)]) {
      for (const status of ['upcoming', 'active', 'done'] as const) {
        for (const [l, r] of [
          [[], null], [log([12, 12, 7], 'default'), null], [log([30, 30, 0], 'timer'), null], [log([1], 'default'), result(1)], [log([1500, 600], 'default'), result(2)], [log([0, 0], 'default'), null],
        ] as const) {
          playlists.push(timedPlaylistModel(spec, status, l as never, r));
        }
      }
    }
    await expect(dump({ prefixes, playlists })).toMatchFileSnapshot(snap('segment-playlist'));
  });
});
