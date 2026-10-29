import { describe, it, expect, vi } from 'vitest';
import { DIVE_HOLD_TIMEOUT_MS, LOCATION_ANSWER_TIMEOUT_MS, askAfterDiveHold, awaitLocationAnswer, diveStartFor } from '../dive-gate';

describe('dive starts only after the location answer (owner note 21.10 #5)', () => {
  it('granted → dive now; denied → never; unknown / timeout → after the first fix', () => {
    expect(diveStartFor('granted')).toBe('now');
    expect(diveStartFor('denied')).toBe('never');
    expect(diveStartFor('unknown')).toBe('after-fix');
    expect(diveStartFor('timeout')).toBe('after-fix');
  });

  it('waits for the OS dialog however long the user takes (under the timeout)', async () => {
    vi.useFakeTimers();
    let answer!: (a: 'granted') => void;
    const ask = () => new Promise<'granted'>((r) => { answer = r; });
    const events: string[] = [];
    const p = awaitLocationAnswer(ask).then((a) => { events.push(`answer:${a}`); return a; });
    // The user is still reading the system dialog: nothing may start yet.
    await vi.advanceTimersByTimeAsync(8000);
    expect(events).toEqual([]);
    answer('granted');
    await expect(p).resolves.toBe('granted');
    expect(diveStartFor(await p)).toBe('now');
    vi.useRealTimers();
  });

  it('a dialog that never answers times out (the fix path takes over)', async () => {
    vi.useFakeTimers();
    const p = awaitLocationAnswer(() => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(LOCATION_ANSWER_TIMEOUT_MS);
    await expect(p).resolves.toBe('timeout');
    vi.useRealTimers();
  });

  it('a throwing / rejecting request is "unknown", never a crash', async () => {
    await expect(awaitLocationAnswer(() => { throw new Error('x'); })).resolves.toBe('unknown');
    await expect(awaitLocationAnswer(() => Promise.reject(new Error('x')))).resolves.toBe('unknown');
  });

  it('denied resolves immediately', async () => {
    await expect(awaitLocationAnswer(async () => 'denied')).resolves.toBe('denied');
  });
});

describe('AC1: the OS dialog opens only after the Earth holds over the country', () => {
  it('dive starts first, the ask waits for the hold', async () => {
    const events: string[] = [];
    let hold!: () => void;
    const p = askAfterDiveHold({
      startDive: () => events.push('dive'),
      waitForHold: () => new Promise<void>((r) => { hold = r; }),
      ask: async () => { events.push('ask'); return 'granted'; },
    });
    await Promise.resolve();
    expect(events).toEqual(['dive']);
    hold();
    await expect(p).resolves.toBe('granted');
    expect(events).toEqual(['dive', 'ask']);
  });

  it('the hold wait is armed before the dive starts (an instant hold is not missed)', async () => {
    const events: string[] = [];
    let hold: (() => void) | null = null;
    const p = askAfterDiveHold({
      startDive: () => { events.push('dive'); hold?.(); },
      waitForHold: () => { events.push('arm'); return new Promise<void>((r) => { hold = r; }); },
      ask: async () => { events.push('ask'); return 'denied'; },
    });
    await expect(p).resolves.toBe('denied');
    expect(events).toEqual(['arm', 'dive', 'ask']);
  });

  it('a hold that never comes still asks after the hold timeout', async () => {
    vi.useFakeTimers();
    const ask = vi.fn(async () => 'granted' as const);
    const p = askAfterDiveHold({ startDive: () => {}, waitForHold: () => new Promise(() => {}), ask });
    await vi.advanceTimersByTimeAsync(DIVE_HOLD_TIMEOUT_MS - 1);
    expect(ask).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toBe('granted');
    expect(ask).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('the hold timeout covers the whole targetless dive (lift + region)', () => {
    expect(DIVE_HOLD_TIMEOUT_MS).toBeGreaterThan(1100 + 1700);
  });
});
