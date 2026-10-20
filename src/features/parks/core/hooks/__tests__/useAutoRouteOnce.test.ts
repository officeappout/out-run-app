import { describe, expect, it } from 'vitest';
import { shouldFireAutoRoute } from '../useAutoRouteOnce';

describe('shouldFireAutoRoute', () => {
  it('fires once, only when asked and ready', () => {
    expect(shouldFireAutoRoute(true, true, false)).toBe(true);
    expect(shouldFireAutoRoute(true, true, true)).toBe(false);
    expect(shouldFireAutoRoute(true, false, false)).toBe(false);
    expect(shouldFireAutoRoute(false, true, false)).toBe(false);
  });
});
