import { describe, expect, it } from 'vitest';
import { identityOf, joinErrorKey, planJoin } from '../core/join-plan';
import he from '@/messages/he/wide.json';

const FALLBACK = 'משתתף';

describe('identityOf', () => {
  it('account / guest / nobody', () => {
    expect(identityOf({ isAnonymous: false })).toBe('account');
    expect(identityOf({ isAnonymous: true })).toBe('guest');
    expect(identityOf(null)).toBe('none');
    expect(identityOf(undefined)).toBe('none');
  });
});

describe('planJoin', () => {
  it('an account joins with the first name of its profile, or the fallback label', () => {
    expect(planJoin({ identity: 'account', accountName: 'נועה כהן', nickname: 'ignored', fallbackName: FALLBACK })).toEqual({ ok: true, guest: false, name: 'נועה' });
    expect(planJoin({ identity: 'account', accountName: '  ', nickname: '', fallbackName: FALLBACK })).toEqual({ ok: true, guest: false, name: FALLBACK });
  });
  it('a guest (or nobody yet) needs a valid nickname, normalised', () => {
    for (const identity of ['guest', 'none'] as const) {
      expect(planJoin({ identity, accountName: '', nickname: '  גיא   הגדול ', fallbackName: FALLBACK })).toEqual({ ok: true, guest: true, name: 'גיא הגדול' });
    }
  });
  it('a guest without a usable nickname is stopped before any network call', () => {
    const plan = (nickname: string) => planJoin({ identity: 'guest', accountName: 'Real Name', nickname, fallbackName: FALLBACK });
    expect(plan('')).toEqual({ ok: false, error: 'nick-empty' });
    expect(plan('ב'.repeat(21))).toEqual({ ok: false, error: 'nick-too-long' });
    expect(plan('<b>')).toEqual({ ok: false, error: 'nick-charset' });
  });
});

describe('joinErrorKey', () => {
  it('every error maps to an existing catalog key', () => {
    const errors = ['not-found', 'expired', 'ended', 'offline', 'unknown', 'host-required', 'invalid-nickname', 'nick-empty', 'nick-too-long', 'nick-charset'] as const;
    for (const e of errors) for (const wantsHost of [true, false]) expect(Object.keys(he), `${e}/${wantsHost}`).toContain(joinErrorKey(e, wantsHost));
  });
  it('a guest who hits a free session is told to host with an account only when they came to host', () => {
    expect(joinErrorKey('host-required', true)).toBe('pair.phone.error.hostNeedsAccount');
    expect(joinErrorKey('host-required', false)).toBe('pair.phone.error.hostRequired');
  });
});
