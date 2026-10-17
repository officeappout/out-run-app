import { describe, it, expect } from 'vitest';
import { navBannerProgress, formatBannerDistance, isApproaching, APPROACH_OFF_ROUTE_M } from '../nav-banner';

describe('navBannerProgress', () => {
  it('not joined yet → 0 % and the whole route ahead', () => {
    expect(navBannerProgress(null, 2400)).toEqual({ joined: false, pct: 0, remainingM: 2400 });
  });
  it('along the route → rounded percent + remaining metres', () => {
    expect(navBannerProgress(600, 2400)).toEqual({ joined: true, pct: 25, remainingM: 1800 });
  });
  it('clamps past the end and below zero', () => {
    expect(navBannerProgress(2600, 2400)).toEqual({ joined: true, pct: 100, remainingM: 0 });
    expect(navBannerProgress(-5, 2400)).toEqual({ joined: true, pct: 0, remainingM: 2400 });
  });
  it('degenerate route length never divides by zero', () => {
    expect(navBannerProgress(10, 0).pct).toBe(0);
    expect(navBannerProgress(10, NaN).pct).toBe(0);
  });
});

describe('formatBannerDistance', () => {
  it('formats metres and km in Hebrew', () => {
    expect(formatBannerDistance(42.4)).toBe('42 מ׳');
    expect(formatBannerDistance(123)).toBe('120 מ׳');
    expect(formatBannerDistance(1430)).toBe('1.4 ק״מ');
  });
  it('bad input → dash, never "NaN"', () => {
    expect(formatBannerDistance(NaN)).toBe('—');
    expect(formatBannerDistance(-1)).toBe('—');
  });
});

describe('isApproaching', () => {
  it('off the line and never joined → approach mode', () => {
    expect(isApproaching(false, APPROACH_OFF_ROUTE_M + 1)).toBe(true);
  });
  it('near the line, or already joined → normal turn guidance', () => {
    expect(isApproaching(false, 10)).toBe(false);
    expect(isApproaching(true, 500)).toBe(false);
    expect(isApproaching(false, Infinity)).toBe(false);
  });
});
