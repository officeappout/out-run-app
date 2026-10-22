import { describe, it, expect } from 'vitest';
import {
  parseMappedBy,
  mappedByProfileUid,
  resolveMappedByCredit,
  buildCommunityMappedBy,
  directCreateMappedBy,
} from '../mapped-by';

const ADULT = { name: 'דנה כהן', photoURL: 'https://x/p.jpg', ageGroup: 'adult' as const };

describe('resolveMappedByCredit — who to show', () => {
  it('no mappedBy (older parks, imports) → nothing', () => {
    expect(resolveMappedByCredit(undefined, null)).toEqual({ kind: 'none' });
  });
  it('team → צוות OUT', () => {
    expect(resolveMappedByCredit({ kind: 'team' }, undefined)).toEqual({ kind: 'team' });
  });
  it('authority (authority_manager create) → nothing for now', () => {
    expect(resolveMappedByCredit({ kind: 'authority' }, null)).toEqual({ kind: 'none' });
  });
  it('community without a stored uid (minor / unknown age at approval) → anonymous community', () => {
    expect(resolveMappedByCredit({ kind: 'community', contributionId: 'c1' }, ADULT)).toEqual({ kind: 'community' });
  });
  it('community with uid, profile still loading → nothing yet (no flicker)', () => {
    expect(resolveMappedByCredit({ kind: 'community', uid: 'u1' }, undefined)).toEqual({ kind: 'none' });
  });
  it('public adult profile → the person, with photo', () => {
    expect(resolveMappedByCredit({ kind: 'community', uid: 'u1' }, ADULT)).toEqual({
      kind: 'person', uid: 'u1', name: 'דנה כהן', photoURL: 'https://x/p.jpg',
    });
  });
  it('public adult without a photo → the person, no photoURL key at all', () => {
    const c = resolveMappedByCredit({ kind: 'community', uid: 'u1' }, { name: ' דנה ', ageGroup: 'adult' });
    expect(c).toEqual({ kind: 'person', uid: 'u1', name: 'דנה' });
    expect(Object.prototype.hasOwnProperty.call(c, 'photoURL')).toBe(false);
  });
});

describe('resolveMappedByCredit — privacy cases', () => {
  const m = { kind: 'community' as const, uid: 'u1' };
  it('no userPublic doc (profile not discoverable / deleted / read failed) → anonymous', () => {
    expect(resolveMappedByCredit(m, null)).toEqual({ kind: 'community' });
  });
  it('public but a minor → anonymous', () => {
    expect(resolveMappedByCredit(m, { ...ADULT, ageGroup: 'minor' })).toEqual({ kind: 'community' });
  });
  it('public but ageGroup missing (legacy account) → anonymous — strict polarity, missing is not adult', () => {
    expect(resolveMappedByCredit(m, { name: 'דנה' })).toEqual({ kind: 'community' });
  });
  it('public adult with an empty name → anonymous (never a blank or a uid)', () => {
    expect(resolveMappedByCredit(m, { name: '   ', ageGroup: 'adult' })).toEqual({ kind: 'community' });
  });
});

describe('parseMappedBy — field guard on the raw Firestore value', () => {
  it.each([undefined, null, 'team', 5, {}, { kind: 'admin' }])('%s → undefined', (raw) => {
    expect(parseMappedBy(raw)).toBeUndefined();
  });
  it('keeps only known string fields', () => {
    expect(parseMappedBy({ kind: 'community', uid: 'u1', contributionId: 'c1', name: 'leak' })).toEqual({
      kind: 'community', uid: 'u1', contributionId: 'c1',
    });
    expect(parseMappedBy({ kind: 'community', uid: '' })).toEqual({ kind: 'community' });
    expect(parseMappedBy({ kind: 'team', uid: 'u1' })).toEqual({ kind: 'team' });
  });
  it('mappedByProfileUid: a read only for community + uid', () => {
    expect(mappedByProfileUid({ kind: 'community', uid: 'u1' })).toBe('u1');
    expect(mappedByProfileUid({ kind: 'community' })).toBeNull();
    expect(mappedByProfileUid({ kind: 'team' })).toBeNull();
    expect(mappedByProfileUid(undefined)).toBeNull();
  });
});

describe('server stamps', () => {
  it('adult contributor → uid stored', () => {
    expect(buildCommunityMappedBy('u1', 'adult', 'c1')).toEqual({ kind: 'community', uid: 'u1', contributionId: 'c1' });
  });
  it.each(['minor', undefined, null, 'ADULT'])('ageGroup %s → uid NOT stored (key absent)', (ag) => {
    const m = buildCommunityMappedBy('u1', ag, 'c1');
    expect(m).toEqual({ kind: 'community', contributionId: 'c1' });
    expect(Object.prototype.hasOwnProperty.call(m, 'uid')).toBe(false);
  });
  it('no contributor uid → anonymous', () => {
    expect(buildCommunityMappedBy(undefined, 'adult', 'c1')).toEqual({ kind: 'community', contributionId: 'c1' });
  });
  it('direct creates: root → team, authority_manager → authority', () => {
    expect(directCreateMappedBy('root')).toEqual({ kind: 'team' });
    expect(directCreateMappedBy('authority_manager')).toEqual({ kind: 'authority' });
  });
});
