import { describe, it, expect } from 'vitest';
import { resolveLoginDoorForPath } from '../loginDoorForPath';

describe('resolveLoginDoorForPath', () => {
  it('routes /admin/authority/* paths to the officer/manager door', () => {
    expect(resolveLoginDoorForPath('/admin/authority/units/9307')).toBe('/authority-portal/login');
    expect(resolveLoginDoorForPath('/admin/authority/team')).toBe('/authority-portal/login');
  });

  it('routes /admin/authority-manager (no trailing segment) to the officer/manager door', () => {
    expect(resolveLoginDoorForPath('/admin/authority-manager')).toBe('/authority-portal/login');
  });

  it('routes root-only paths to the super-admin door', () => {
    expect(resolveLoginDoorForPath('/admin/roadmap')).toBe('/admin/login');
    expect(resolveLoginDoorForPath('/admin')).toBe('/admin/login');
    expect(resolveLoginDoorForPath('/admin/exercises')).toBe('/admin/login');
  });

  it('falls back to the super-admin door for null/undefined (matches the pre-existing default)', () => {
    expect(resolveLoginDoorForPath(null)).toBe('/admin/login');
    expect(resolveLoginDoorForPath(undefined)).toBe('/admin/login');
  });
});
