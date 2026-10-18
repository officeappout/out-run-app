import { describe, it, expect, vi } from 'vitest';
import { runReviewLoop } from '../aiReviewLoop';

describe('runReviewLoop (aiCoachReviewScheduler driver)', () => {
  it('calls slices until nothing remains, passing the threads left of the cap', async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce({ reviewed: 60, remaining: true, stoppedBy: 'time', costUsd: 0.5 })
      .mockResolvedValueOnce({ reviewed: 30, remaining: false, stoppedBy: null, costUsd: 0.25 });
    const r = await runReviewLoop(call, { maxThreads: 200, deadlineMs: Infinity });
    expect(call.mock.calls.map((c) => c[0])).toEqual([200, 140]);
    expect(r).toEqual({ calls: 2, reviewed: 90, failed: 0, costUsd: 0.75, stoppedBy: 'done' });
  });

  it('stops at the daily cap', async () => {
    const call = vi.fn().mockResolvedValue({ reviewed: 100, remaining: true, stoppedBy: 'time' });
    const r = await runReviewLoop(call, { maxThreads: 200, deadlineMs: Infinity });
    expect(r).toMatchObject({ calls: 2, reviewed: 200, stoppedBy: 'cap' });
  });

  it('stops on a hard stop from the route (budget / kill switch / review off)', async () => {
    for (const stop of ['review_budget', 'kill_switch', 'review_off', 'over_budget']) {
      const call = vi.fn().mockResolvedValue({ reviewed: 3, remaining: true, stoppedBy: stop });
      const r = await runReviewLoop(call, { maxThreads: 200, deadlineMs: Infinity });
      expect(r).toMatchObject({ calls: 1, stoppedBy: stop });
    }
  });

  it('stops at the deadline, after two consecutive errors, and when a slice makes no progress', async () => {
    let t = 0;
    const slow = vi.fn(async () => {
      t += 100;
      return { reviewed: 1, remaining: true };
    });
    expect(await runReviewLoop(slow, { maxThreads: 200, deadlineMs: 250, now: () => t })).toMatchObject({ calls: 3, stoppedBy: 'deadline' });

    const failing = vi.fn().mockRejectedValue(new Error('HTTP 500'));
    expect(await runReviewLoop(failing, { maxThreads: 200, deadlineMs: Infinity })).toMatchObject({ calls: 2, stoppedBy: 'errors' });

    const flaky = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce({ reviewed: 2, remaining: false });
    expect(await runReviewLoop(flaky, { maxThreads: 200, deadlineMs: Infinity })).toMatchObject({ calls: 2, reviewed: 2, stoppedBy: 'done' });

    const stuck = vi.fn().mockResolvedValue({ reviewed: 0, failed: 5, remaining: true });
    expect(await runReviewLoop(stuck, { maxThreads: 200, deadlineMs: Infinity })).toMatchObject({ calls: 1, stoppedBy: 'no_progress' });
  });
});
