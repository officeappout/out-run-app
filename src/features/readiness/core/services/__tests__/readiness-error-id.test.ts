import { describe, it, expect, vi, afterEach } from 'vitest';
import { logReadinessInternalError } from '../readiness-error-id';

describe('logReadinessInternalError — 03.10.2026 fix: never swallow an error into an untraceable string', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns a non-empty, route-prefixed error id', () => {
    const id = logReadinessInternalError('/api/units/readiness/roster', new Error('boom'));
    expect(id).toContain('/api/units/readiness/roster');
    expect(id.length).toBeGreaterThan('/api/units/readiness/roster'.length);
  });

  it('two calls produce different ids, even for the same route and error', () => {
    const id1 = logReadinessInternalError('/api/units/readiness/roster', new Error('boom'));
    const id2 = logReadinessInternalError('/api/units/readiness/roster', new Error('boom'));
    expect(id1).not.toBe(id2);
  });

  it('logs the real error detail alongside the id (so the two are cross-referenceable), never just a generic string', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('latest.recordedAt.getTime is not a function');
    const id = logReadinessInternalError('/api/units/readiness/roster', err);
    expect(spy).toHaveBeenCalledTimes(1);
    const loggedArgs = spy.mock.calls[0];
    expect(loggedArgs.some((a) => typeof a === 'string' && a.includes(id))).toBe(true);
    expect(loggedArgs.some((a) => typeof a === 'string' && a.includes('getTime is not a function'))).toBe(true);
  });

  it('handles a non-Error thrown value without crashing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const id = logReadinessInternalError('/api/units/readiness/roster', 'a plain string throw');
    expect(id).toBeTruthy();
    expect(spy).toHaveBeenCalled();
  });
});
