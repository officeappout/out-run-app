import { describe, it, expect } from 'vitest';
import { resolveTenantSelectionAfterOptionsLoad, type MilitaryTenantOption } from '../militaryTenantSelection.util';

const OPTIONS: MilitaryTenantOption[] = [
  { id: 'brigade-a', name: 'חטיבה א' },
  { id: 'brigade-b', name: 'חטיבה ב' },
];

describe('resolveTenantSelectionAfterOptionsLoad (06.10.2026, David\'s review)', () => {
  it('nothing saved yet → stays null', () => {
    expect(resolveTenantSelectionAfterOptionsLoad(null, OPTIONS)).toBeNull();
  });

  it('saved tenantId IS in the real options list → kept unchanged', () => {
    expect(resolveTenantSelectionAfterOptionsLoad('brigade-a', OPTIONS)).toBe('brigade-a');
  });

  it('saved tenantId is NOT in the real options list (role changed / different user on this browser) → cleared to null, never surfaced as an error', () => {
    expect(resolveTenantSelectionAfterOptionsLoad('brigade-stale', OPTIONS)).toBeNull();
  });

  it('saved tenantId with an EMPTY options list (this caller has zero brigades in scope) → cleared to null, same rule', () => {
    expect(resolveTenantSelectionAfterOptionsLoad('brigade-a', [])).toBeNull();
  });
});
