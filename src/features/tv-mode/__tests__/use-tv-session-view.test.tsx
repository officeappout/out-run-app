// @vitest-environment jsdom
/** The TV's hook end to end over the in-memory repo: screens, the lost state, once-only commands. */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null } }));

import { TV_HEARTBEAT_MS, TV_LOST_AFTER_MS } from '../core/constants';
import { nextCommand } from '../core/commands';
import { initialMirror, mirrorReducer } from '../core/mirror';
import { useTvSessionView, type TvSessionView } from '../hooks/useTvSessionView';
import { MemoryTvRepo } from '../services/memory-tv-repo';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CODE = '482913';
let root: Root;
let host: HTMLElement;
let view: TvSessionView;
let repo: MemoryTvRepo;

function Probe() {
  view = useTvSessionView(CODE, repo);
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_700_000_000_000);
  repo = new MemoryTvRepo(() => Date.now());
  host = document.createElement('div');
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

const mount = () => act(() => root.render(<Probe />));
const run = async (fn: () => Promise<unknown>) => act(async () => void (await fn()));
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

describe('useTvSessionView', () => {
  it('waiting → lobby → live → lost → live again, the timer never stops', async () => {
    repo.createServerSide(CODE);
    mount();
    expect(view.screen).toBe('waiting');

    await run(() => repo.join(CODE, { uid: 'noa', name: 'נועה', gender: 'female' }));
    expect(view.screen).toBe('lobby');
    expect(view.participants.map((p) => p.uid)).toEqual(['noa']);

    await run(async () => {
      await repo.startWorkout(CODE);
      await repo.beat(CODE);
      const m = mirrorReducer(
        mirrorReducer(initialMirror(), { type: 'exercise', index: 0, count: 3, name: 'מתח', setCount: 3 }),
        { type: 'phase', phase: 'work', timer: { dir: 'down', baseMs: 60_000, running: true, totalMs: 60_000 } },
      );
      await repo.writeMirror(CODE, m, true);
    });
    expect(view.screen).toBe('live');
    expect(view.session?.mirror?.exerciseName).toBe('מתח');

    // the phone goes quiet: after TV_LOST_AFTER_MS the TV shows the reconnect state…
    await tick(TV_LOST_AFTER_MS + 1000);
    expect(view.screen).toBe('lost');
    // …and its own clock kept running (serverNow moved on, the anchor is unchanged)
    expect(view.serverNow - (view.session?.timerAnchorAtMs ?? 0)).toBeGreaterThan(TV_LOST_AFTER_MS);

    // the phone is back: one heartbeat and the TV is live again
    await run(() => repo.beat(CODE));
    expect(view.screen).toBe('live');
  });

  it('learns the server clock from the heartbeat and uses the best sample', async () => {
    repo.createServerSide(CODE);
    mount();
    await run(() => repo.join(CODE, { uid: 'noa', name: 'נועה' }));
    await run(() => repo.startWorkout(CODE));
    for (let i = 0; i < 3; i++) {
      await tick(TV_HEARTBEAT_MS);
      await run(() => repo.beat(CODE));
    }
    // memory repo stamps with the same clock, so the offset is ~0
    expect(Math.abs(view.serverNow - Date.now())).toBeLessThan(1000);
  });

  it('applies a host command once, ends on "end", ignores replays', async () => {
    repo.createServerSide(CODE);
    mount();
    await run(() => repo.join(CODE, { uid: 'noa', name: 'נועה' }));
    await run(() => repo.sendCommand(CODE, nextCommand(null, 'volume', 0.3)));
    expect(view.local.volume).toBe(0.3);
    await run(() => repo.sendCommand(CODE, { seq: 1, type: 'volume', value: 0.9 })); // same seq again
    expect(view.local.volume).toBe(0.3);
    await run(() => repo.sendCommand(CODE, { seq: 2, type: 'end' }));
    expect(view.local.ended).toBe(true);
  });

  it('a host ending the session moves the TV to the ended screen', async () => {
    repo.createServerSide(CODE);
    mount();
    await run(() => repo.join(CODE, { uid: 'noa', name: 'נועה' }));
    await run(() => repo.end(CODE));
    expect(view.screen).toBe('ended');
  });

  it('a late mirror snapshot never replaces a newer one', async () => {
    repo.createServerSide(CODE);
    mount();
    await run(() => repo.join(CODE, { uid: 'noa', name: 'נועה' }));
    const m1 = mirrorReducer(initialMirror(), { type: 'exercise', index: 0, count: 2, name: 'a', setCount: 3 });
    const m2 = mirrorReducer(m1, { type: 'set', setIndex: 2 });
    await run(() => repo.writeMirror(CODE, m2, false));
    // a stale doc sneaks in (re-delivery): bypass the repo's own guard
    repo.sessions.get(CODE)!.mirror = m1;
    await run(async () => void repo.beat(CODE));
    expect(view.session?.mirror?.setIndex).toBe(2);
  });
});
