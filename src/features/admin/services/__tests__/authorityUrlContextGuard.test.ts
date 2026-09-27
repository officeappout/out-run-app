import { describe, it, expect } from 'vitest';
import { shouldAutoLoadAuthority } from '../authorityUrlContextGuard';
import type { Authority } from '@/types/admin-types';

function authority(partial: Partial<Authority> & { id: string; type: Authority['type'] }): Authority {
  return { name: 'Test Org', managerIds: [], userCount: 0, ...partial };
}

describe('shouldAutoLoadAuthority', () => {
  it('no ?type= in the URL — no constraint, any candidate loads (existing behavior, e.g. root landing on the page with no vertical selected)', () => {
    const org = authority({ id: 'city_haifa', type: 'city' });
    expect(shouldAutoLoadAuthority(org, '')).toBe(true);
  });

  it('candidate type matches ?type= — loads', () => {
    const org = authority({ id: 'brigade_810', type: 'military_unit' });
    expect(shouldAutoLoadAuthority(org, 'military')).toBe(true);
  });

  it("municipal negative — David's exact real observation: a stored municipal org must NOT auto-load under ?type=military", () => {
    const org = authority({ id: 'city_haifa', type: 'city' });
    expect(shouldAutoLoadAuthority(org, 'military')).toBe(false);
  });

  it('reverse mismatch — a military org must NOT auto-load under ?type=municipal', () => {
    const org = authority({ id: 'brigade_810', type: 'military_unit' });
    expect(shouldAutoLoadAuthority(org, 'municipal')).toBe(false);
  });

  it('candidate could not be resolved (getAuthority returned null) — fails closed, never treated as "no constraint"', () => {
    expect(shouldAutoLoadAuthority(null, 'military')).toBe(false);
  });

  it('school authority under ?type=educational — loads (tenantType-derived, not just type string)', () => {
    const org = authority({ id: 'school_1', type: 'school' });
    expect(shouldAutoLoadAuthority(org, 'educational')).toBe(true);
  });
});
