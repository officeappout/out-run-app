import { describe, expect, it } from 'vitest';
import { alignScopeWithAuthorDoc, extractFeedScope } from '../feed-scope.utils';

describe('alignScopeWithAuthorDoc', () => {
  it('legacy account without core.ageGroup → the post carries no ageGroup (the create rule wants null)', () => {
    const profile = { core: { gender: 'male', birthDate: '1990-01-01' } };
    const scope = extractFeedScope(profile);
    expect(scope.ageGroup).toBe('adult'); // the fallback that the rule rejected
    const out = alignScopeWithAuthorDoc({ ...scope, groupIds: [] }, profile);
    expect(out.ageGroup).toBeUndefined();
    expect(out.gender).toBe('male');
  });
  it('copies neighborhood/gender/ageGroup from the doc and keeps only the doc\'s groups', () => {
    const userDoc = { core: { neighborhoodId: 'n1', ageGroup: 'adult', gender: 'female' }, social: { groupIds: ['g1'] } };
    const out = alignScopeWithAuthorDoc({ neighborhoodId: 'stale', ageGroup: 'minor' as const, gender: 'male' as const, groupIds: ['g1', 'g2'], other: 1 }, userDoc);
    expect(out).toEqual({ neighborhoodId: 'n1', ageGroup: 'adult', gender: 'female', groupIds: ['g1'], other: 1 });
  });
  it('doc unreadable → unchanged', () => {
    const p = { ageGroup: 'adult' as const, groupIds: ['g'] };
    expect(alignScopeWithAuthorDoc(p, undefined)).toBe(p);
  });
});
