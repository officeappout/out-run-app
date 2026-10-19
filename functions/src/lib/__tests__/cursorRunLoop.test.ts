import { describe, expect, it } from 'vitest';
import { runCursorLoop } from '../cursorRunLoop';

describe('runCursorLoop', () => {
  it('follows the cursor until nothing remains', async () => {
    const seen: Array<string | null> = [];
    const r = await runCursorLoop(
      async (c) => {
        seen.push(c);
        if (c === null) return { remaining: true, cursor: 'u3', sent: 2 };
        if (c === 'u3') return { remaining: true, cursor: 'u7', sent: 1, costUsd: 0.01 };
        return { remaining: false, cursor: null, stoppedBy: 'done' };
      },
      { deadlineMs: Date.now() + 60_000 },
    );
    expect(seen).toEqual([null, 'u3', 'u7']);
    expect(r).toMatchObject({ calls: 3, sent: 3, stoppedBy: 'done' });
  });
  it('stops on a hard stop (flag off) after one call', async () => {
    const r = await runCursorLoop(async () => ({ remaining: false, stoppedBy: 'flag_off' }), { deadlineMs: Date.now() + 60_000 });
    expect(r).toMatchObject({ calls: 1, stoppedBy: 'flag_off' });
  });
  it('stops when a slice makes no progress, after two errors, and at the deadline', async () => {
    expect((await runCursorLoop(async () => ({ remaining: true, cursor: null }), { deadlineMs: Date.now() + 60_000 })).stoppedBy).toBe('no_progress');
    expect((await runCursorLoop(async () => { throw new Error('x'); }, { deadlineMs: Date.now() + 60_000 })).stoppedBy).toBe('errors');
    expect((await runCursorLoop(async () => ({ remaining: true, cursor: 'a' }), { deadlineMs: 0 })).stoppedBy).toBe('deadline');
  });
});
