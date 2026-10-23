import { describe, expect, it } from 'vitest';
import { playerActivityForPick, rideModeOn, xpActivityFor } from '../ride-mode';

describe('ride-mode (cycling-fixes-v1)', () => {
  it('rideModeOn: home v2 OR the cycling-fixes flag', () => {
    expect(rideModeOn(false, false)).toBe(false);
    expect(rideModeOn(true, false)).toBe(true);
    expect(rideModeOn(false, true)).toBe(true);
  });

  it('playerActivityForPick: flag off reproduces the old FreeRunDrawer expression exactly', () => {
    const old = (sel: string, v2: boolean) => (sel === 'walking' ? 'walking' : v2 && sel === 'cycling' ? 'cycling' : 'running');
    for (const sel of ['walking', 'running', 'cycling', undefined as unknown as string]) {
      for (const v2 of [false, true]) {
        expect(playerActivityForPick(sel, rideModeOn(v2, false))).toBe(old(sel, v2));
      }
    }
  });

  it('flag on: a non-v2 cyclist gets a ride; walking and running are unchanged', () => {
    expect(playerActivityForPick('cycling', rideModeOn(false, true))).toBe('cycling');
    expect(playerActivityForPick('walking', true)).toBe('walking');
    expect(playerActivityForPick('running', true)).toBe('running');
  });

  it('xpActivityFor: flag off passes the activity through untouched', () => {
    for (const homeV2 of [false, true]) {
      expect(xpActivityFor('cycling', { homeV2, cyclingFixes: false })).toBe('cycling');
      expect(xpActivityFor('walking', { homeV2, cyclingFixes: false })).toBe('walking');
      expect(xpActivityFor(null, { homeV2, cyclingFixes: false })).toBe('running');
    }
  });

  it('xpActivityFor: a ride that exists only because of the flag keeps XP as a run; home v2 unchanged', () => {
    expect(xpActivityFor('cycling', { homeV2: false, cyclingFixes: true })).toBe('running');
    expect(xpActivityFor('cycling', { homeV2: true, cyclingFixes: true })).toBe('cycling');
    expect(xpActivityFor('walking', { homeV2: false, cyclingFixes: true })).toBe('walking');
  });
});
