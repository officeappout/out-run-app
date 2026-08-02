import { describe, it, expect } from 'vitest';
import { parseRememberedRouteStopsDuration } from '../route-stops-duration.util';

describe('parseRememberedRouteStopsDuration — durable "remember last pick" validation', () => {
  it('a valid remembered choice (15/30/45) is returned as-is', () => {
    expect(parseRememberedRouteStopsDuration('15')).toBe(15);
    expect(parseRememberedRouteStopsDuration('30')).toBe(30);
    expect(parseRememberedRouteStopsDuration('45')).toBe(45);
  });

  it('nothing remembered (null, first-ever use) falls back to the 30min default', () => {
    expect(parseRememberedRouteStopsDuration(null)).toBe(30);
  });

  it('a stale/invalid value (not one of the 3 choices) falls back to the default, never crashes', () => {
    expect(parseRememberedRouteStopsDuration('99')).toBe(30);
    expect(parseRememberedRouteStopsDuration('0')).toBe(30);
    expect(parseRememberedRouteStopsDuration('-15')).toBe(30);
  });

  it('garbage/non-numeric input falls back to the default, never NaN/crash', () => {
    expect(parseRememberedRouteStopsDuration('not-a-number')).toBe(30);
    expect(parseRememberedRouteStopsDuration('')).toBe(30);
  });
});
