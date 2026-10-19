import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initTimed } from '@/features/workout-engine/engines/timed/timed-machine';
import { timedView } from '@/features/workout-engine/engines/timed/timed.selectors';
import type { TimedBlockSpec } from '@/features/workout-engine/engines/timed/timed.types';
import { createTimedStore, type TimedSnapshot } from '../state/timed-store';
import { beginTimedSession, recordTimedResult, resetTimedResults, timedResultsFor } from '../state/timed-results';

const spec: TimedBlockSpec = { format: 'amrap', config: { capSec: 60, roundItems: [] }, items: [{ kind: 'exercise', key: 'a', name: 'a', targetReps: 5 }] };
const snap = (): TimedSnapshot => {
  const state = initTimed(spec);
  return { spec, state, view: timedView(state, 0), prompt: null, prefix: null, result: null, runDistanceM: 0 };
};

describe('timed-store (perf: the tick never reaches the player root)', () => {
  it('notifies subscribers only on a new snapshot; actions are stable and rebindable', () => {
    const store = createTimedStore();
    const l = vi.fn();
    const off = store.subscribe(l);
    const s1 = snap();
    store.publish(s1);
    store.publish(s1);
    expect(l).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe(s1);
    const actions = store.actions;
    const itemDone = vi.fn();
    expect(actions.finishNow()).toEqual([]); // unbound → inert
    store.bindActions({ start: vi.fn(), itemDone, answerPrompt: vi.fn(), skipPrompt: vi.fn(), finishNow: () => [] });
    store.actions.itemDone();
    expect(itemDone).toHaveBeenCalledTimes(1);
    expect(store.actions).toBe(actions);
    off();
    store.publish(snap());
    expect(l).toHaveBeenCalledTimes(1);
  });

  it('StrengthRunner never runs the engine or subscribes to the snapshot itself', () => {
    const src = readFileSync(join(__dirname, '../../StrengthRunner.tsx'), 'utf8');
    expect(src).not.toMatch(/useTimedBlock|useTimedRuntime|useTimedSnapshot|useSyncExternalStore/);
    expect(src).toMatch(/<TimedRuntime/);
  });
});

describe('timed-results (in-memory, current session only)', () => {
  it('records per segment, clears on a new session', () => {
    resetTimedResults();
    beginTimedSession('w1');
    const result = { format: 'amrap' } as never;
    recordTimedResult('seg-main', result);
    recordTimedResult('seg-main', result);
    expect(timedResultsFor(['seg-warmup', 'seg-main'])).toHaveLength(1);
    beginTimedSession('w1');
    expect(timedResultsFor(['seg-main'])).toHaveLength(1);
    beginTimedSession('w2');
    expect(timedResultsFor(['seg-main'])).toHaveLength(0);
  });
});
