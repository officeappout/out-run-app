import { describe, it, expect, vi, afterEach } from 'vitest';
import { scheduleIdle } from '../scheduleIdle';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('scheduleIdle', () => {
  it('uses requestIdleCallback (with the timeout ceiling) when available, and does NOT run synchronously', () => {
    const ric = vi.fn<(cb: () => void, o?: { timeout: number }) => number>(() => 7);
    const cic = vi.fn();
    vi.stubGlobal('window', { requestIdleCallback: ric, cancelIdleCallback: cic });
    const cb = vi.fn();
    const cancel = scheduleIdle(cb, { timeoutMs: 1234 });
    expect(cb).not.toHaveBeenCalled();
    expect(ric).toHaveBeenCalledTimes(1);
    expect(ric.mock.calls[0][1]).toEqual({ timeout: 1234 });
    ric.mock.calls[0][0](); // the browser fires it when idle
    expect(cb).toHaveBeenCalledTimes(1);
    cancel();
    expect(cic).toHaveBeenCalledWith(7);
  });

  it('falls back to a short setTimeout where requestIdleCallback does not exist (Safari / WKWebView)', () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {});
    const cb = vi.fn();
    scheduleIdle(cb, { fallbackDelayMs: 600 });
    vi.advanceTimersByTime(599);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('cancel() before it fires prevents the callback (fallback path)', () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {});
    const cb = vi.fn();
    const cancel = scheduleIdle(cb);
    cancel();
    vi.advanceTimersByTime(10_000);
    expect(cb).not.toHaveBeenCalled();
  });
});
