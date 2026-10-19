import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_VERSION_CONFIG, needsForceUpdate, parseAppVersionConfig } from '../app-version.logic';

const on = (ios: number, android: number) =>
  parseAppVersionConfig({ enabled: true, ios: { minBuild: ios }, android: { minBuild: android } });

describe('force update — parseAppVersionConfig', () => {
  it('missing / garbage doc → defaults, switched off', () => {
    expect(parseAppVersionConfig(null)).toEqual(DEFAULT_APP_VERSION_CONFIG);
    expect(parseAppVersionConfig('x').enabled).toBe(false);
    expect(parseAppVersionConfig({ enabled: 'yes' }).enabled).toBe(false);
  });

  it('keeps store URLs https-only and builds non-negative integers', () => {
    const c = parseAppVersionConfig({
      enabled: true,
      ios: { minBuild: '31', storeUrl: 'javascript:alert(1)' },
      android: { minBuild: -4, storeUrl: 'https://play.google.com/x' },
    });
    expect(c.ios).toEqual({ minBuild: 31, storeUrl: DEFAULT_APP_VERSION_CONFIG.ios.storeUrl });
    expect(c.android).toEqual({ minBuild: 0, storeUrl: 'https://play.google.com/x' });
  });
});

describe('force update — needsForceUpdate', () => {
  it('blocks only builds below the platform minimum', () => {
    const c = on(30, 25);
    expect(needsForceUpdate('ios', '29', c)).toBe(true);
    expect(needsForceUpdate('ios', '30', c)).toBe(false);
    expect(needsForceUpdate('android', 24, c)).toBe(true);
    expect(needsForceUpdate('android', '26', c)).toBe(false);
  });

  it('fails open: switched off, minBuild 0, web, unknown platform or unreadable build', () => {
    expect(needsForceUpdate('ios', '1', { ...on(30, 30), enabled: false })).toBe(false);
    expect(needsForceUpdate('ios', '1', on(0, 0))).toBe(false);
    expect(needsForceUpdate('web', '1', on(30, 30))).toBe(false);
    expect(needsForceUpdate(null, '1', on(30, 30))).toBe(false);
    expect(needsForceUpdate('ios', '', on(30, 30))).toBe(false);
    expect(needsForceUpdate('android', 'abc', on(30, 30))).toBe(false);
  });
});
