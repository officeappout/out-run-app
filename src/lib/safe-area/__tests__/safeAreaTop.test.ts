import { describe, it, expect } from 'vitest';
import { resolveSafeAreaTop, ANDROID_STATUS_BAR_FALLBACK_PX } from '../safeAreaTop';

describe('resolveSafeAreaTop', () => {
  it('uses the env() reading when the WebView reports one', () => {
    expect(resolveSafeAreaTop(47, 'ios')).toBe(47);
    expect(resolveSafeAreaTop(31.6, 'android')).toBe(32);
  });

  it('Android edge-to-edge with env() = 0 falls back to the status bar height', () => {
    expect(resolveSafeAreaTop(0, 'android')).toBe(ANDROID_STATUS_BAR_FALLBACK_PX);
    expect(resolveSafeAreaTop(Number.NaN, 'android')).toBe(ANDROID_STATUS_BAR_FALLBACK_PX);
  });

  it('iOS / web with no inset stays 0', () => {
    expect(resolveSafeAreaTop(0, 'ios')).toBe(0);
    expect(resolveSafeAreaTop(0, 'web')).toBe(0);
  });
});
