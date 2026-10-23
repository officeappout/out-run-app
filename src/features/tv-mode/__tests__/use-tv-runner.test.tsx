// @vitest-environment jsdom
/** The player's TV hookup: throttled mirror, controls, flag-off / no-session no-op, participant progress, the finish. */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null } }));

import { MemoryTvRepo } from '../services/memory-tv-repo';
import { IDLE_SNAPSHOT_TIMER, type RunnerSnapshot } from '../core/runner-snapshot';

const repoRef: { current: MemoryTvRepo } = { current: undefined as unknown as MemoryTvRepo };
vi.mock('../services/tv-repo', () => ({ getTvRepo: () => repoRef.current }));

import { useTvPhoneStore } from '../phone/phone-store';
import { useTvRunner } from '../hooks/useTvRunner';
import type { RunnerActions } from '../core/runner-controls';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CODE = '482913';
let root: Root;
let snapshot: RunnerSnapshot | null;
let actions: RunnerActions;

const base = (over: Partial<RunnerSnapshot> = {}): RunnerSnapshot => ({
  exerciseKey: 'a', exerciseIndex: 0, exerciseCount: 3, exerciseName: 'מתח', mode: 'strength', setIndex: 1, setCount: 3,
  phase: 'work', paused: false, timer: IDLE_SNAPSHOT_TIMER, together: false, ...over,
});

function Probe() {
  useTvRunner(snapshot, actions);
  return null;
}
const render = () => act(() => root.render(<Probe />));
const store = () => useTvPhoneStore.getState();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_700_000_000_000);
  repoRef.current = new MemoryTvRepo(() => Date.now());
  actions = { togglePause: vi.fn(), next: vi.fn() };
  snapshot = base();
  store().reset();
  root = createRoot(document.createElement('div'));
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  store().reset();
});

describe('useTvRunner', () => {
  it('no TV session (role null): nothing is published, no controls are registered', () => {
    const changes = vi.fn();
    const off = useTvPhoneStore.subscribe(changes);
    render();
    snapshot = base({ setIndex: 2 });
    render();
    off();
    expect(store().mirror).toBeNull();
    expect(store().controls).toBeNull();
    expect(store().progress).toBeNull();
    expect(changes).not.toHaveBeenCalled(); // no store writes at all
  });

  it('host: the first change goes out at once, a burst is coalesced to one trailing write', () => {
    act(() => store().setConnected(CODE, 'host'));
    const seen: number[] = [];
    const off = useTvPhoneStore.subscribe((s, p) => {
      if (s.mirror && s.mirror !== p.mirror) seen.push(s.mirror.seq);
    });
    render();
    expect(store().mirror?.exerciseName).toBe('מתח');
    expect(seen).toHaveLength(1);
    for (const set of [2, 3]) {
      snapshot = base({ setIndex: set });
      render();
    }
    snapshot = base({ setIndex: 3, paused: true });
    render();
    expect(seen).toHaveLength(1); // still inside the gap
    act(() => void vi.advanceTimersByTime(300));
    expect(seen).toHaveLength(2);
    expect(store().mirror).toMatchObject({ setIndex: 3, paused: true });
    off();
  });

  it('host: unchanged re-renders (the player ticks every second) publish nothing', () => {
    act(() => store().setConnected(CODE, 'host'));
    render();
    const first = store().mirror;
    for (let i = 0; i < 5; i++) {
      snapshot = base();
      render();
      act(() => void vi.advanceTimersByTime(1000));
    }
    expect(store().mirror).toBe(first);
  });

  it('host: the remote controls call the player once per press; prev / skip are absent when the player has none', () => {
    act(() => store().setConnected(CODE, 'host'));
    render();
    const c = store().controls!;
    expect(c.prev).toBeUndefined();
    expect(c.skipExercise).toBeUndefined();
    c.next();
    c.next(); // a double tap
    c.togglePause();
    expect(actions.next).toHaveBeenCalledTimes(1);
    expect(actions.togglePause).toHaveBeenCalledTimes(1);
  });

  it('host: others in the room switch the "together" chip on', () => {
    act(() => store().setConnected(CODE, 'host'));
    render();
    expect(store().mirror?.together).toBe(false);
    act(() => store().setOthers(2));
    act(() => void vi.advanceTimersByTime(300));
    expect(store().mirror?.together).toBe(true);
  });

  it('participant: publishes its own progress, never a mirror', () => {
    act(() => store().setConnected(CODE, 'participant'));
    snapshot = base({ phase: 'rest', setIndex: 2 });
    render();
    expect(store().mirror).toBeNull();
    expect(store().progress).toEqual({ state: 'resting', set: 2, totalSets: 3 });
  });

  it('host: when the player goes away the TV gets a finished mirror that outranks the last one', async () => {
    const repo = repoRef.current;
    repo.createServerSide(CODE);
    await act(async () => void (await repo.join(CODE, { uid: 'noa', name: 'נועה' })));
    await act(async () => void (await repo.startWorkout(CODE)));
    act(() => store().setConnected(CODE, 'host'));
    render();
    const last = store().mirror!;
    await act(async () => root.unmount());
    root = createRoot(document.createElement('div'));
    const got: Array<{ phase: string; seq: number }> = [];
    repo.subscribeSession(CODE, (s) => s?.mirror && got.push({ phase: s.mirror.phase, seq: s.mirror.seq }));
    expect(got.at(-1)).toMatchObject({ phase: 'done' });
    expect(got.at(-1)!.seq).toBeGreaterThan(last.seq);
  });
});
