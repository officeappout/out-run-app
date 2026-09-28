import { describe, it, expect } from 'vitest';
import { resolveSafeNextPath } from '../safeNextPath';

describe('resolveSafeNextPath', () => {
  it('accepts a plain /admin path', () => {
    expect(resolveSafeNextPath('/admin/authority/team')).toBe('/admin/authority/team');
  });

  it('accepts bare /admin', () => {
    expect(resolveSafeNextPath('/admin')).toBe('/admin');
  });

  it('accepts a path with a query string', () => {
    expect(resolveSafeNextPath('/admin/authority/units?type=military')).toBe('/admin/authority/units?type=military');
  });

  it('rejects null/undefined/empty', () => {
    expect(resolveSafeNextPath(null)).toBeNull();
    expect(resolveSafeNextPath(undefined)).toBeNull();
    expect(resolveSafeNextPath('')).toBeNull();
  });

  it('rejects a protocol-relative URL (open-redirect vector)', () => {
    expect(resolveSafeNextPath('//evil.example.com/admin')).toBeNull();
  });

  it('rejects an absolute URL even when it points back at this host', () => {
    expect(resolveSafeNextPath('https://outrun.co.il/admin')).toBeNull();
    expect(resolveSafeNextPath('http://evil.example.com')).toBeNull();
  });

  it('rejects a path outside /admin', () => {
    expect(resolveSafeNextPath('/authority-portal/login')).toBeNull();
    expect(resolveSafeNextPath('/')).toBeNull();
  });

  it('rejects a path not starting with a slash', () => {
    expect(resolveSafeNextPath('admin/authorities')).toBeNull();
  });

  it('rejects /admin/login and /admin/auth/callback to prevent a redirect loop', () => {
    expect(resolveSafeNextPath('/admin/login')).toBeNull();
    expect(resolveSafeNextPath('/admin/login?next=/admin/foo')).toBeNull();
    expect(resolveSafeNextPath('/admin/auth/callback')).toBeNull();
    expect(resolveSafeNextPath('/admin/auth/callback?email=a@b.com')).toBeNull();
  });

  it('rejects an /admin-prefixed path smuggling a scheme inside it', () => {
    expect(resolveSafeNextPath('/admin/../evil://host')).toBeNull();
  });
});
