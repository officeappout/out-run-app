import { describe, expect, it } from 'vitest';
import {
  cameraCentreY,
  DRAWER_MARKER_CLEARANCE_PX,
  drawerFollowPadding,
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

describe('drawerFollowPadding (enable_run_player_drawer_v1)', () => {
  it('no chrome / bad viewport → null', () => {
    expect(drawerFollowPadding(H, null)).toBeNull();
    expect(drawerFollowPadding(0, { top: 100, bottom: 100, drawer: true })).toBeNull();
  });

  it('a comfortable window frames exactly like playerFollowPadding', () => {
    const chrome = { top: 140, bottom: 140, drawer: true };
    expect(drawerFollowPadding(H, chrome)).toEqual(playerFollowPadding(H, chrome));
  });

  it('follows the drawer: compact snap → the marker sits lower than with the full card', () => {
    const full = drawerFollowPadding(H, { top: 140, bottom: 400, drawer: true })!;
    const compact = drawerFollowPadding(H, { top: 140, bottom: 120, drawer: true })!;
    expect(cameraCentreY(H, compact)).toBeGreaterThan(cameraCentreY(H, full));
    expect(cameraCentreY(H, full)).toBeLessThan(H - 400);
  });

  it('tiny gap: never the legacy fallback — the marker sits just above the drawer top', () => {
    // iPhone SE-ish: tall header + tall full card leave < MIN_FREE_WINDOW_PX
    const h = 667;
    const chrome = { top: 210, bottom: 400, drawer: true };
    expect(playerFollowPadding(h, chrome)).toBeNull();
    const p = drawerFollowPadding(h, chrome)!;
    expect(p).not.toBeNull();
    const y = cameraCentreY(h, p);
    expect(y).toBeCloseTo(h - chrome.bottom - DRAWER_MARKER_CLEARANCE_PX, 0);
    expect(y).toBeLessThan(h - chrome.bottom);
    expect(p.top + p.bottom).toBeLessThan(h);
    expect(p.top).toBeGreaterThanOrEqual(0);
    expect(p.bottom).toBeGreaterThanOrEqual(0);
  });

  it('drawer covering almost everything still yields a valid padding inside the viewport', () => {
    const p = drawerFollowPadding(H, { top: 300, bottom: H - 10, drawer: true })!;
    const y = cameraCentreY(H, p);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(H);
    expect(p.top + p.bottom).toBeLessThan(H);
  });

  it('sameChrome tells a drawer claim apart from a plain one', () => {
    expect(sameChrome({ top: 1, bottom: 2 }, { top: 1, bottom: 2, drawer: true })).toBe(false);
    expect(sameChrome({ top: 1, bottom: 2, drawer: true }, { top: 1, bottom: 2, drawer: true })).toBe(true);
    expect(sameChrome({ top: 1, bottom: 2 }, { top: 1, bottom: 2, drawer: false })).toBe(true);
  });
});
