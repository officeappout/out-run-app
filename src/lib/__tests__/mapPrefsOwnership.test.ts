import { describe, it, expect } from 'vitest';
import { decideMapPrefsOwnership, MAP_PREFS_GUEST_OWNER } from '@/lib/mapPrefsOwnership';

const base = { prefAuthorityId: 'city-a', profileAuthorityId: null };

describe('decideMapPrefsOwnership', () => {
  it('trusts the same account (returning user unchanged)', () => {
    expect(decideMapPrefsOwnership({ ...base, ownerUid: 'u1', currentUid: 'u1' }))
      .toEqual({ trust: true, claim: false, clear: false });
  });

  it('ignores and clears another account\'s answer', () => {
    expect(decideMapPrefsOwnership({ ...base, ownerUid: 'u1', currentUid: 'u2' }))
      .toEqual({ trust: false, claim: false, clear: true });
  });

  it('ignores but keeps a stamped answer while no uid is known yet', () => {
    expect(decideMapPrefsOwnership({ ...base, ownerUid: 'u1', currentUid: null }))
      .toEqual({ trust: false, claim: false, clear: false });
  });

  it('trusts a guest answer and claims it once signed in', () => {
    expect(decideMapPrefsOwnership({ ...base, ownerUid: MAP_PREFS_GUEST_OWNER, currentUid: 'u2' }))
      .toEqual({ trust: true, claim: true, clear: false });
    expect(decideMapPrefsOwnership({ ...base, ownerUid: MAP_PREFS_GUEST_OWNER, currentUid: null }))
      .toEqual({ trust: true, claim: false, clear: false });
  });

  describe('legacy (no owner stamp)', () => {
    it('ignores and clears for a brand-new account with no city', () => {
      expect(decideMapPrefsOwnership({ ...base, ownerUid: null, currentUid: 'u2' }))
        .toEqual({ trust: false, claim: false, clear: true });
    });

    it('trusts and claims when the profile already has that city', () => {
      expect(decideMapPrefsOwnership({
        ownerUid: null, currentUid: 'u1', prefAuthorityId: 'city-a', profileAuthorityId: 'city-a',
      })).toEqual({ trust: true, claim: true, clear: false });
    });

    it('ignores when the profile has a different city', () => {
      expect(decideMapPrefsOwnership({
        ownerUid: null, currentUid: 'u1', prefAuthorityId: 'city-a', profileAuthorityId: 'city-b',
      }).trust).toBe(false);
    });

    it('ignores with no signed-in account', () => {
      expect(decideMapPrefsOwnership({ ...base, ownerUid: null, currentUid: null }).trust).toBe(false);
    });

    it('ignores an anchor-only legacy answer (no authority to match)', () => {
      expect(decideMapPrefsOwnership({
        ownerUid: null, currentUid: 'u1', prefAuthorityId: null, profileAuthorityId: 'city-a',
      }).trust).toBe(false);
    });
  });
});
