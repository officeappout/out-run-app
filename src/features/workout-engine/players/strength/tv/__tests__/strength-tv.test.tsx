// @vitest-environment jsdom
/** The strength player's TV bridge: runner state → snapshot, the card clock, and the no-session no-op. */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null } }));

import { advanceRunnerMirror, startRunnerMirror } from '@/features/tv-mode/core/runner-mirror';
import { useTvPhoneStore } from '@/features/tv-mode/phone/phone-store';
import { buildStrengthSnapshot, cardTimer, tvMediaFor, type StrengthFacts } from '../strength-snapshot';
import { buildTimedSnapshot } from '../timed-snapshot';
import type { CardClockReport } from '../card-clock';
import StrengthTvBridge from '../StrengthTvBridge';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const facts = (over: Partial<StrengthFacts> = {}): StrengthFacts => ({
  nowMs: 10_000, workoutState: 'ACTIVE', paused: false, segmentIndex: 1, exerciseIndex: 2, segmentSizes: [3, 4, 2],
  exerciseId: 'row', exerciseName: 'חתירה', nextName: 'סקווט', round: 2, totalRounds: 4, repsMin: 8, repsMax: 12,
  clockDriven: false, isTabata: false, restLeftSec: 0, restTotalSec: 0, card: null, ...over,
});
const card = (over: Partial<CardClockReport> = {}): CardClockReport => ({
  phase: 'counting', paused: false, elapsedSec: 10, prepLeftSec: 0, prepTotalSec: 5, durationSec: 30, at: 10_000, ...over,
});

describe('buildStrengthSnapshot', () => {
  it('exercise n of m counts exercises across segments, not sets', () => {
    const s = buildStrengthSnapshot(facts());
    expect(s).toMatchObject({ exerciseIndex: 5, exerciseCount: 9, setIndex: 2, setCount: 4, repsMin: 8, repsMax: 12, phase: 'work', mode: 'strength', nextExerciseName: 'סקווט' });
    expect(s.timer.dir).toBe('none');
  });
  it('a single target rep count becomes min = max', () => {
    expect(buildStrengthSnapshot(facts({ repsMin: undefined, repsMax: undefined, targetReps: 10 }))).toMatchObject({ repsMin: 10, repsMax: 10 });
  });
  it('resting: the rest clock counts down, paused freezes it', () => {
    const s = buildStrengthSnapshot(facts({ workoutState: 'RESTING', restLeftSec: 45, restTotalSec: 60 }));
    expect(s).toMatchObject({ phase: 'rest', paused: false });
    expect(s.timer).toEqual({ dir: 'down', baseMs: 45_000, running: true, totalMs: 60_000 });
    expect(buildStrengthSnapshot(facts({ workoutState: 'RESTING', restLeftSec: 45, restTotalSec: 60, paused: true })).paused).toBe(true);
  });
  it('a hold: the card clock is mirrored (prep, counting, overtime), aged to now, frozen when paused', () => {
    const f = facts({ clockDriven: true, durationSec: 30, repsMin: undefined, repsMax: undefined });
    expect(buildStrengthSnapshot({ ...f, card: null })).toMatchObject({ holdSec: 30, timer: { dir: 'none' } });
    expect(buildStrengthSnapshot({ ...f, card: card({ phase: 'preparing', prepLeftSec: 4 }) }).timer).toEqual({ dir: 'down', baseMs: 4000, running: true, totalMs: 5000 });
    expect(buildStrengthSnapshot({ ...f, nowMs: 12_000, card: card({ at: 10_000 }) }).timer).toEqual({ dir: 'down', baseMs: 18_000, running: true, totalMs: 30_000 });
    expect(cardTimer(card({ phase: 'overtime', elapsedSec: 36 }), 10_000)).toEqual({ dir: 'up', baseMs: 6000, running: true, totalMs: 0 });
    const paused = buildStrengthSnapshot({ ...f, nowMs: 20_000, card: card({ paused: true }) });
    expect(paused.paused).toBe(true);
    expect(paused.timer).toMatchObject({ running: false, baseMs: 20_000 });
  });
  it('the card clock does not leak into other states', () => {
    expect(buildStrengthSnapshot(facts({ workoutState: 'INPUT', clockDriven: true, card: card() })).timer.dir).toBe('none');
  });
  it('tabata is its own mode; PREPARING is idle', () => {
    expect(buildStrengthSnapshot(facts({ isTabata: true })).mode).toBe('tabata');
    expect(buildStrengthSnapshot(facts({ workoutState: 'PREPARING' })).phase).toBe('idle');
  });
  it('a running hold does not make the TV re-write every second', () => {
    const f = facts({ clockDriven: true, durationSec: 30, repsMin: undefined, repsMax: undefined });
    let st = advanceRunnerMirror(startRunnerMirror(0), buildStrengthSnapshot({ ...f, nowMs: 10_000, card: card() }), 10_000);
    const seq = st.mirror.seq;
    for (let t = 11_000; t <= 20_000; t += 1000) st = advanceRunnerMirror(st, buildStrengthSnapshot({ ...f, nowMs: t, card: card() }), t);
    expect(st.mirror.seq).toBe(seq);
  });
});

describe('media for the TV', () => {
  it('public https only: a blob URL from the offline cache never reaches the doc', () => {
    expect(tvMediaFor({ videoUrl: 'blob:https://app/1', imageUrl: 'https://i.example.com/a.jpg' })).toEqual({ imageUrl: 'https://i.example.com/a.jpg' });
    const bunny = tvMediaFor({ bunnyVideoId: '0b0e4a2e-1111-4222-8333-444455556666' });
    expect(bunny?.videoUrl).toMatch(/^https:\/\/.+\/0b0e4a2e-1111-4222-8333-444455556666\/play_720p\.mp4$/);
  });
});

describe('buildTimedSnapshot', () => {
  const items = [
    { kind: 'exercise' as const, key: 'a', exerciseId: 'a', name: 'ברפי', targetReps: 10 },
    { kind: 'exercise' as const, key: 'b', exerciseId: 'b', name: 'קפיצות', targetHoldSec: 20 },
  ];
  const view = (over: Record<string, unknown> = {}) => ({
    status: 'running', format: 'tabata', phase: 'work', activeMs: 0, totalMs: 240_000, remainingMs: 200_000, phaseRemainingMs: 12_000, phaseElapsedMs: 8_000,
    round: 3, roundsTotal: 8, current: items[0], next: items[1], side: null, isLastSeconds: false, ...over,
  });
  const snap = (v: unknown, format = 'tabata') => ({ spec: { format, items, config: {} }, state: {}, view: v, prompt: null, prefix: null, result: null, runDistanceM: 0 }) as never;
  const mediaFor = () => ({ imageUrl: 'https://i.example.com/x.jpg' });
  it('tabata / emom: the phase clock counts down; mode, round and targets come across', () => {
    const s = buildTimedSnapshot({ snapshot: snap(view()), segmentIndex: 2, paused: false, mediaFor });
    expect(s).toMatchObject({ mode: 'tabata', phase: 'work', setIndex: 3, setCount: 8, exerciseName: 'ברפי', nextExerciseName: 'קפיצות', repsMin: 10, exerciseCount: 2 });
    expect(s.timer).toEqual({ dir: 'down', baseMs: 12_000, running: true, totalMs: 20_000 });
    expect(s.media).toEqual({ imageUrl: 'https://i.example.com/x.jpg' });
  });
  it('amrap: the block clock counts down and the round is open-ended', () => {
    const s = buildTimedSnapshot({ snapshot: snap(view({ format: 'amrap', roundsTotal: null, round: 4 }), 'amrap'), segmentIndex: 0, paused: false, mediaFor });
    expect(s.mode).toBe('amrap');
    expect(s.timer).toEqual({ dir: 'down', baseMs: 200_000, running: true, totalMs: 240_000 });
    expect(s.setCount).toBe(4);
  });
  it('rest, paused and finished', () => {
    expect(buildTimedSnapshot({ snapshot: snap(view({ phase: 'rest' })), segmentIndex: 0, paused: false, mediaFor }).phase).toBe('rest');
    const p = buildTimedSnapshot({ snapshot: snap(view({ status: 'paused', phase: 'paused' })), segmentIndex: 0, paused: false, mediaFor });
    expect(p).toMatchObject({ paused: true, phase: 'work' });
    expect(p.timer.running).toBe(false);
    expect(buildTimedSnapshot({ snapshot: snap(view({ status: 'done', phase: 'done' })), segmentIndex: 0, paused: false, mediaFor }).timer.dir).toBe('none');
  });
});

describe('StrengthTvBridge gate', () => {
  it('no TV session: renders nothing and writes nothing to the TV store', () => {
    useTvPhoneStore.getState().reset();
    const writes = vi.fn();
    const off = useTvPhoneStore.subscribe(writes);
    const host = document.createElement('div');
    const sm = { workoutState: 'ACTIVE' } as never;
    act(() => createRoot(host).render(<StrengthTvBridge sm={sm} workout={{ segments: [] } as never} timed={{ active: false, spec: null, store: {} as never }} onSaveInput={() => {}} />));
    expect(host.innerHTML).toBe('');
    off();
    expect(writes).not.toHaveBeenCalled();
  });
});
