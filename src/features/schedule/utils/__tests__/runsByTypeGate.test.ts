import { describe, it, expect } from 'vitest';
import { runsByTypeFor } from '../runsByTypeGate';

describe('runsByTypeFor — enable_home_v2 the way home reads it', () => {
  it('the live flag for a regular user', () => {
    expect(runsByTypeFor({ enableHomeV2: true }, false)).toBe(true);
    expect(runsByTypeFor({ enableHomeV2: false }, false)).toBe(false);
    expect(runsByTypeFor(undefined, false)).toBe(false);
    expect(runsByTypeFor(null, undefined)).toBe(false);
  });
  it('a super admin gets the flag\'s superAdminValue (true), whatever the live value', () => {
    expect(runsByTypeFor({ enableHomeV2: false }, true)).toBe(true);
    expect(runsByTypeFor(undefined, true)).toBe(true);
  });
});
