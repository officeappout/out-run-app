import { describe, it, expect } from 'vitest';
import { memberRoleField, shouldSyncGroupChat, attendanceCountDelta, groupChatId } from '../join-writes';

describe('memberRoleField (P1-4)', () => {
  it('a re-join never rewrites the role — admins are not demoted (flag off too)', () => {
    expect(memberRoleField({ alreadyMember: true, existingRole: 'admin', isDesignatedLeader: false, fixesOn: false })).toEqual({});
    expect(memberRoleField({ alreadyMember: true, existingRole: 'admin', isDesignatedLeader: false, fixesOn: true })).toEqual({});
  });
  it('a new member joins as member', () => {
    expect(memberRoleField({ alreadyMember: false, isDesignatedLeader: false, fixesOn: true })).toEqual({ role: 'member' });
    expect(memberRoleField({ alreadyMember: false, isDesignatedLeader: true, fixesOn: false })).toEqual({ role: 'member' });
  });
  it('fixes on: the designated leader joins as / is promoted to admin', () => {
    expect(memberRoleField({ alreadyMember: false, isDesignatedLeader: true, fixesOn: true })).toEqual({ role: 'admin' });
    expect(memberRoleField({ alreadyMember: true, existingRole: 'member', isDesignatedLeader: true, fixesOn: true })).toEqual({ role: 'admin' });
    expect(memberRoleField({ alreadyMember: true, existingRole: 'admin', isDesignatedLeader: true, fixesOn: true })).toEqual({});
  });
});

describe('shouldSyncGroupChat (P1-6)', () => {
  it('only with the flag, never for ephemeral run groups', () => {
    expect(shouldSyncGroupChat({ fixesOn: false, groupType: undefined })).toBe(false);
    expect(shouldSyncGroupChat({ fixesOn: true, groupType: undefined })).toBe(true);
    expect(shouldSyncGroupChat({ fixesOn: true, groupType: 'ephemeral' })).toBe(false);
  });
  it('chat id matches chat.service', () => {
    expect(groupChatId('g1')).toBe('group_g1');
  });
});

describe('attendanceCountDelta (P2-12)', () => {
  it('+1 only for a new attendee with the flag on', () => {
    expect(attendanceCountDelta({ fixesOn: true, attendees: ['a'], uid: 'b' })).toBe(1);
    expect(attendanceCountDelta({ fixesOn: true, attendees: ['a', 'b'], uid: 'b' })).toBe(0);
    expect(attendanceCountDelta({ fixesOn: true, attendees: undefined, uid: 'b' })).toBe(1);
    expect(attendanceCountDelta({ fixesOn: false, attendees: [], uid: 'b' })).toBe(0);
  });
});
