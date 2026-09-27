import { describe, it, expect } from 'vitest';
import { mergeAndSortInvitations } from '../mergeInvitations';
import type { AdminInvitation } from '@/types/invitation.type';

function inv(partial: Partial<AdminInvitation> & { id: string; createdAt: Date }): AdminInvitation {
  return {
    email: 'x@example.com',
    role: 'authority_manager',
    token: 'tok',
    isUsed: false,
    expiresAt: new Date('2026-01-01'),
    createdBy: 'root',
    ...partial,
  };
}

describe('mergeAndSortInvitations', () => {
  it('municipal case — only authorityId results exist, tenantId list is empty, order preserved (existing behavior unchanged)', () => {
    const a = inv({ id: 'muni-1', authorityId: 'city_haifa', createdAt: new Date('2026-09-20') });
    const b = inv({ id: 'muni-2', authorityId: 'city_haifa', createdAt: new Date('2026-09-25') });
    const result = mergeAndSortInvitations([b, a], []);
    expect(result.map((r) => r.id)).toEqual(['muni-2', 'muni-1']);
  });

  it('military/educational case — authorityId list is empty, tenantId results still appear (the bug this fixes)', () => {
    const t = inv({ id: 'mil-1', tenantId: 'brigade_810', authorityId: undefined, createdAt: new Date('2026-09-26') });
    const result = mergeAndSortInvitations([], [t]);
    expect(result.map((r) => r.id)).toEqual(['mil-1']);
  });

  it('a doc present in BOTH lists (the real anomalous production doc, §13.34 finding 5) is de-duplicated, not doubled', () => {
    const both = inv({ id: 'anomaly-1', authorityId: 'brigade_810', tenantId: 'brigade_810', createdAt: new Date('2026-09-24') });
    const result = mergeAndSortInvitations([both], [both]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('anomaly-1');
  });

  it('mixed municipal + military invitations sort together by createdAt descending, not grouped by source query', () => {
    const muni = inv({ id: 'muni-old', authorityId: 'city_haifa', createdAt: new Date('2026-09-10') });
    const mil = inv({ id: 'mil-new', tenantId: 'brigade_810', createdAt: new Date('2026-09-27') });
    const result = mergeAndSortInvitations([muni], [mil]);
    expect(result.map((r) => r.id)).toEqual(['mil-new', 'muni-old']);
  });

  it('both lists empty — returns empty array, no throw', () => {
    expect(mergeAndSortInvitations([], [])).toEqual([]);
  });
});
