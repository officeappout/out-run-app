import { describe, it, expect, vi } from 'vitest';
import { LOCATION_ANSWER_TIMEOUT_MS, askBeforeDive, awaitLocationAnswer, diveStartFor } from '../dive-gate';

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

describe('AF4: the tap opens the OS dialog first, the answer starts the dive', () => {
  it('asks before anything moves; granted starts the dive', async () => {
    const events: string[] = [];
    let answer!: (a: 'granted') => void;
    const p = askBeforeDive({
      ask: () => { events.push('ask'); return new Promise((r) => { answer = r; }); },
      isCurrent: () => true,
      startDive: () => events.push('dive'),
    });
    await Promise.resolve();
    expect(events).toEqual(['ask']);
    answer('granted');
    await expect(p).resolves.toEqual({ answer: 'granted', start: 'now' });
    expect(events).toEqual(['ask', 'dive']);
  });

  it('denied never dives (the caller opens the city search)', async () => {
    const startDive = vi.fn();
    const r = await askBeforeDive({ ask: async () => 'denied', isCurrent: () => true, startDive });
    expect(r).toEqual({ answer: 'denied', start: 'never' });
    expect(startDive).not.toHaveBeenCalled();
  });

  it('unknown leaves the dive to the first fix', async () => {
    const startDive = vi.fn();
    const r = await askBeforeDive({ ask: async () => 'unknown', isCurrent: () => true, startDive });
    expect(r?.start).toBe('after-fix');
    expect(startDive).not.toHaveBeenCalled();
  });

  it('a late answer after the user moved on is dropped: no dive behind the search', async () => {
    const startDive = vi.fn();
    const r = await askBeforeDive({ ask: async () => 'granted', isCurrent: () => false, startDive });
    expect(r).toBeNull();
    expect(startDive).not.toHaveBeenCalled();
  });
});
