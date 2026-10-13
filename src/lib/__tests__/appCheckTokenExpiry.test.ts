import { describe, it, expect } from 'vitest';
import {
  shouldForceRefresh,
  reportedExpiry,
  SDK_REFRESH_OFFSET_MS,
  FORCE_REFRESH_BELOW_MS,
  MIN_FORCE_REFRESH_INTERVAL_MS,
  SAFETY_MARGIN_MS,
  MIN_REPORTED_LIFE_MS,
  LEGACY_REPORTED_TTL_MS,
} from '../appCheckTokenExpiry';

const MIN = 60_000;
const NOW = 1_700_000_000_000;

describe('reportedExpiry', () => {
  it('reports the real expiry minus the safety margin for a healthy token', () => {
    const real = NOW + 40 * MIN;
    expect(reportedExpiry(NOW, real)).toBe(real - SAFETY_MARGIN_MS);
  });

  it('never reports MORE life than the token really has (the original bug)', () => {
    // Cached token with 12 min left: the old code claimed 50 min.
    const real = NOW + 12 * MIN;
    expect(reportedExpiry(NOW, real)).toBeLessThanOrEqual(real);
    expect(reportedExpiry(NOW, real)).toBeLessThan(NOW + LEGACY_REPORTED_TTL_MS);
  });

  it('falls back to the legacy TTL when the plugin gives no usable expiry', () => {
    for (const bad of [undefined, 0, -5, NaN, Infinity]) {
      expect(reportedExpiry(NOW, bad as number | undefined)).toBe(NOW + LEGACY_REPORTED_TTL_MS);
    }
  });

  it('LOOP SAFETY: always leaves more life than the SDK refresh offset', () => {
    // Sweep real remaining life from long-expired to a full day.
    for (let remaining = -30 * MIN; remaining <= 24 * 60 * MIN; remaining += 30_000) {
      const reported = reportedExpiry(NOW, NOW + remaining);
      expect(reported - NOW).toBeGreaterThan(SDK_REFRESH_OFFSET_MS);
      expect(reported - NOW).toBeGreaterThanOrEqual(MIN_REPORTED_LIFE_MS);
    }
  });
});

describe('shouldForceRefresh', () => {
  it('forces a refresh only when the cached token is nearly dead', () => {
    expect(shouldForceRefresh(NOW, NOW + 3 * MIN, null)).toBe(true);
    expect(shouldForceRefresh(NOW, NOW - 1 * MIN, null)).toBe(true); // already expired
    expect(shouldForceRefresh(NOW, NOW + FORCE_REFRESH_BELOW_MS - 1, null)).toBe(true);
    expect(shouldForceRefresh(NOW, NOW + FORCE_REFRESH_BELOW_MS, null)).toBe(false);
    expect(shouldForceRefresh(NOW, NOW + 45 * MIN, null)).toBe(false);
  });

  it('rate-limits forced refreshes', () => {
    const nearDead = NOW + 2 * MIN;
    expect(shouldForceRefresh(NOW, nearDead, NOW - (MIN_FORCE_REFRESH_INTERVAL_MS - 1))).toBe(false);
    expect(shouldForceRefresh(NOW, nearDead, NOW - MIN_FORCE_REFRESH_INTERVAL_MS)).toBe(true);
  });

  it('never forces when the expiry is unknown (keeps the old behaviour)', () => {
    expect(shouldForceRefresh(NOW, undefined, null)).toBe(false);
    expect(shouldForceRefresh(NOW, 0, null)).toBe(false);
    expect(shouldForceRefresh(NOW, NaN, null)).toBe(false);
  });

  it('the force threshold sits above the reported-life floor', () => {
    // So a successfully refreshed token never lands on the floor.
    expect(FORCE_REFRESH_BELOW_MS).toBeGreaterThan(MIN_REPORTED_LIFE_MS);
    expect(MIN_REPORTED_LIFE_MS).toBeGreaterThan(SDK_REFRESH_OFFSET_MS);
  });
});
