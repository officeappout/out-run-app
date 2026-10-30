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

  it('is not a shouldShowPushReAsk moment', () => {
    expect(shouldShowPushReAsk({ moment: 'home', permission: 'prompt', shownAt: null })).toBe(false);
  });
});
