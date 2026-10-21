import { describe, it, expect, vi } from 'vitest';
import { LOCATION_ANSWER_TIMEOUT_MS, awaitLocationAnswer, diveStartFor } from '../dive-gate';

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
