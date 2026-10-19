import { describe, it, expect } from 'vitest';
import {
  PARTNER_GROUPS_AUTHORITY_LIMIT,
  PARTNER_GROUPS_FALLBACK_LIMIT,
  isPartnerGroupVisible,
  partnerGroupQuerySpecs,
} from '../partner-group-scope';

describe('partnerGroupQuerySpecs', () => {
  it('scopes to the user authority, capped', () => {
    expect(partnerGroupQuerySpecs('tlv', [])).toEqual([{ kind: 'authority', authorityId: 'tlv', limit: PARTNER_GROUPS_AUTHORITY_LIMIT }]);
  });
  it('no authority → a bounded newest-first fallback, never an unbounded listener', () => {
    expect(partnerGroupQuerySpecs(null, [])).toEqual([{ kind: 'fallback', limit: PARTNER_GROUPS_FALLBACK_LIMIT }]);
    expect(partnerGroupQuerySpecs('', [])[0].kind).toBe('fallback');
  });
  it("adds the user's own groups by id in chunks of 30, deduped", () => {
    const ids = Array.from({ length: 65 }, (_, i) => `g${i}`);
    const specs = partnerGroupQuerySpecs('tlv', [...ids, 'g0', '']);
    const mine = specs.filter((s) => s.kind === 'mine') as Array<{ kind: 'mine'; ids: string[] }>;
    expect(mine.map((m) => m.ids.length)).toEqual([30, 30, 5]);
    expect(mine.flatMap((m) => m.ids)).toEqual(ids);
  });
});

describe('isPartnerGroupVisible', () => {
  const members = new Set(['priv-mine']);
  it('active public / legacy groups are visible to everyone', () => {
    expect(isPartnerGroupVisible('a', { isActive: true, isPublic: true }, members)).toBe(true);
    expect(isPartnerGroupVisible('a', { isActive: true }, members)).toBe(true);
  });
  it('private groups only for members', () => {
    expect(isPartnerGroupVisible('priv-mine', { isActive: true, isPublic: false }, members)).toBe(true);
    expect(isPartnerGroupVisible('priv-other', { isActive: true, isPublic: false }, members)).toBe(false);
  });
  it('inactive groups (e.g. from the by-id slice) are never shown', () => {
    expect(isPartnerGroupVisible('priv-mine', { isActive: false, isPublic: false }, members)).toBe(false);
    expect(isPartnerGroupVisible('a', {}, members)).toBe(false);
  });
});
