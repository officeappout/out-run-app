import { describe, it, expect } from 'vitest';
import {
  bucketRemainingLife,
  reportedTtlOutlivesToken,
  REPORTED_TTL_MS,
  TELEMETRY_ENVIRONMENT,
  SAMPLE_RATE,
} from '../appCheckTelemetry';

const MIN = 60_000;

describe('bucketRemainingLife', () => {
  it('maps real remaining life to the documented buckets', () => {
    expect(bucketRemainingLife(-1)).toBe('expired');
    expect(bucketRemainingLife(0)).toBe('expired');
    expect(bucketRemainingLife(4 * MIN)).toBe('lt5m');
    expect(bucketRemainingLife(5 * MIN)).toBe('lt15m');
    expect(bucketRemainingLife(29 * MIN)).toBe('lt30m');
    expect(bucketRemainingLife(49 * MIN)).toBe('lt50m');
    expect(bucketRemainingLife(50 * MIN)).toBe('gte50m');
    expect(bucketRemainingLife(60 * MIN)).toBe('gte50m');
  });

  it('never throws on missing / non-finite input', () => {
    expect(bucketRemainingLife(undefined)).toBe('unknown');
    expect(bucketRemainingLife(NaN)).toBe('unknown');
    expect(bucketRemainingLife(Infinity)).toBe('unknown');
  });
});

describe('reportedTtlOutlivesToken', () => {
  it('is true exactly when the fixed 50-min report exceeds the token life', () => {
    expect(reportedTtlOutlivesToken(REPORTED_TTL_MS - 1)).toBe(true);
    expect(reportedTtlOutlivesToken(REPORTED_TTL_MS)).toBe(false);
    expect(reportedTtlOutlivesToken(59 * MIN)).toBe(false);
    expect(reportedTtlOutlivesToken(undefined)).toBe('unknown');
  });
});

describe('telemetry guard rails', () => {
  it('never targets the production environment (alert rules are scoped to it)', () => {
    expect(TELEMETRY_ENVIRONMENT).not.toBe('production');
  });
  it('samples a bounded fraction of launches', () => {
    expect(SAMPLE_RATE).toBeGreaterThan(0);
    expect(SAMPLE_RATE).toBeLessThanOrEqual(0.25);
  });
});
