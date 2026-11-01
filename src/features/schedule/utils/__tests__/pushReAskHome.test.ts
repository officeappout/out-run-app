import { describe, expect, it } from 'vitest';
import { HOME_REASK_COOLDOWN_DAYS, HOME_REASK_MAX_SHOWS, homeReAskAction, shouldShowPushReAsk } from '../pushReAsk';

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const base = { permission: 'prompt' as const, shownAt: null, shownCount: 0, now: NOW, isNative: true };

describe('homeReAskAction', () => {
  it('asks a user who was never prompted', () => {
    expect(homeReAskAction(base)).toBe('prompt');
  });

  it('waits out the cooldown between shows', () => {
    expect(homeReAskAction({ ...base, shownAt: NOW - (HOME_REASK_COOLDOWN_DAYS * DAY - 1) })).toBeNull();
    expect(homeReAskAction({ ...base, shownAt: NOW - HOME_REASK_COOLDOWN_DAYS * DAY })).toBe('prompt');
  });

  it('stops after the max number of shows', () => {
    expect(homeReAskAction({ ...base, shownCount: HOME_REASK_MAX_SHOWS - 1 })).toBe('prompt');
    expect(homeReAskAction({ ...base, shownCount: HOME_REASK_MAX_SHOWS })).toBeNull();
  });

  it('sends a native denied user to the OS settings, never a web one', () => {
    expect(homeReAskAction({ ...base, permission: 'denied' })).toBe('open_settings');
    expect(homeReAskAction({ ...base, permission: 'denied', isNative: false })).toBeNull();
  });

  it('shows nothing when allowed, unsupported, or iOS Safari cannot prompt', () => {
    expect(homeReAskAction({ ...base, permission: 'granted' })).toBeNull();
    expect(homeReAskAction({ ...base, permission: 'unsupported' })).toBeNull();
    expect(homeReAskAction({ ...base, isNative: false, iosWebBlocked: true })).toBeNull();
  });

  it('AJ12: waits the cooldown after an ask elsewhere (signup soft-ask, deferral, OS dialog)', () => {
    const day = 86_400_000;
    expect(homeReAskAction({ ...base, lastOtherAskAt: base.now - day })).toBeNull();
    expect(homeReAskAction({ ...base, permission: 'denied', lastOtherAskAt: base.now - 2 * day })).toBeNull();
    expect(homeReAskAction({ ...base, lastOtherAskAt: base.now - 4 * day })).toBe('prompt');
  });

  it('is not a shouldShowPushReAsk moment', () => {
    expect(shouldShowPushReAsk({ moment: 'home', permission: 'prompt', shownAt: null })).toBe(false);
  });
});
