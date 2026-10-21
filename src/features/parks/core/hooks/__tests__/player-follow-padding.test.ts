import { describe, expect, it } from 'vitest';
import {
  cameraCentreY,
  MIN_FREE_WINDOW_PX,
  PLAYER_DOT_FRACTION,
  playerFollowPadding,
  sameChrome,
} from '../player-follow-padding';

const H = 844; // iPhone 13/14 viewport

describe('playerFollowPadding (v2 live players)', () => {
  it('no chrome → null (caller keeps the legacy Waze padding)', () => {
    expect(playerFollowPadding(H, null)).toBeNull();
    expect(playerFollowPadding(H, undefined)).toBeNull();
  });

  it('puts the marker inside the free window between header and bottom card', () => {
    // free run v2: safe 47 + header ~104 on top; safe 34 + 12 + live card ~300 at the bottom
    const chrome = { top: 151, bottom: 346 };
    const p = playerFollowPadding(H, chrome)!;
    const y = cameraCentreY(H, p);
    expect(y).toBeGreaterThan(chrome.top);
    expect(y).toBeLessThan(H - chrome.bottom);
    // a little below the middle of the free window (road ahead above the runner)
    const free = H - chrome.top - chrome.bottom;
    expect(y).toBeCloseTo(chrome.top + free * PLAYER_DOT_FRACTION, 0);
  });

  it('regression: the legacy framing (top 50 %, bottom 0) put the marker under a v2 card', () => {
    const legacyY = cameraCentreY(H, { top: Math.round(H * 0.5), bottom: 0 });
    const cardTop = H - 346;
    expect(legacyY).toBeGreaterThan(cardTop); // hidden — the reported bug
    const y = cameraCentreY(H, playerFollowPadding(H, { top: 151, bottom: 346 })!);
    expect(y).toBeLessThan(cardTop);
  });

  it('padding values are non-negative integers and leave an un-padded area', () => {
    const p = playerFollowPadding(H, { top: 120.4, bottom: 300.6 })!;
    expect(Number.isInteger(p.top)).toBe(true);
    expect(Number.isInteger(p.bottom)).toBe(true);
    expect(p.top).toBeGreaterThanOrEqual(0);
    expect(H - p.top - p.bottom).toBeGreaterThan(0);
    expect(p.left).toBe(0);
    expect(p.right).toBe(0);
  });

  it('header only / card only still frame correctly', () => {
    const onlyCard = playerFollowPadding(H, { top: 0, bottom: 320 })!;
    expect(cameraCentreY(H, onlyCard)).toBeLessThan(H - 320);
    const onlyHeader = playerFollowPadding(H, { top: 160, bottom: 0 })!;
    expect(cameraCentreY(H, onlyHeader)).toBeGreaterThan(160);
  });

  it('degenerate window (cards cover almost everything) → null', () => {
    expect(playerFollowPadding(H, { top: 400, bottom: H - 400 - (MIN_FREE_WINDOW_PX - 1) })).toBeNull();
    expect(playerFollowPadding(0, { top: 10, bottom: 10 })).toBeNull();
  });

  it('bad numbers are treated as 0, never NaN padding', () => {
    const p = playerFollowPadding(H, { top: Number.NaN, bottom: 300 })!;
    expect(Number.isFinite(p.top)).toBe(true);
    expect(Number.isFinite(p.bottom)).toBe(true);
  });
});

describe('sameChrome', () => {
  it('compares by value', () => {
    expect(sameChrome(null, null)).toBe(true);
    expect(sameChrome({ top: 1, bottom: 2 }, { top: 1, bottom: 2 })).toBe(true);
    expect(sameChrome({ top: 1, bottom: 2 }, { top: 1, bottom: 3 })).toBe(false);
    expect(sameChrome(null, { top: 0, bottom: 0 })).toBe(false);
  });
});
