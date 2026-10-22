import { describe, it, expect } from 'vitest';
import { isLastGroupAdmin } from '../last-admin';

describe('isLastGroupAdmin (P2-17)', () => {
  it('the only admin is blocked', () => {
    expect(isLastGroupAdmin({ userId: 'a', members: [{ uid: 'a', role: 'admin' }, { uid: 'b', role: 'member' }] })).toBe(true);
  });
  it('the creator counts as an admin', () => {
    expect(isLastGroupAdmin({ userId: 'c', createdBy: 'c', members: [{ uid: 'c', role: 'member' }, { uid: 'b', role: 'member' }] })).toBe(true);
    expect(isLastGroupAdmin({ userId: 'a', createdBy: 'c', members: [{ uid: 'a', role: 'admin' }, { uid: 'c', role: 'member' }] })).toBe(false);
  });
  it('another admin exists → may leave; plain members always may', () => {
    expect(isLastGroupAdmin({ userId: 'a', members: [{ uid: 'a', role: 'admin' }, { uid: 'b', role: 'admin' }] })).toBe(false);
    expect(isLastGroupAdmin({ userId: 'b', members: [{ uid: 'a', role: 'admin' }, { uid: 'b', role: 'member' }] })).toBe(false);
    expect(isLastGroupAdmin({ userId: undefined, members: [] })).toBe(false);
  });
});
