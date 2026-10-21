import { describe, expect, it } from 'vitest';
import { isInterruptedNavigation } from '../lib/driver';

describe('isInterruptedNavigation', () => {
  it('treats a client-side redirect as fine', () => {
    expect(isInterruptedNavigation(new Error('page.goto: Navigation to "https://outrun.co.il/" is interrupted by another navigation to "https://outrun.co.il/gateway"'))).toBe(true);
  });
  it('keeps real failures as failures', () => {
    expect(isInterruptedNavigation(new Error('net::ERR_NAME_NOT_RESOLVED'))).toBe(false);
    expect(isInterruptedNavigation('Timeout 45000ms exceeded')).toBe(false);
  });
});
