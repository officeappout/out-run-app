import { describe, it, expect } from 'vitest';
import { shouldReInvite, localNowStamp, attendanceIdFromClientNow } from '../run-invite';

describe('shouldReInvite (P2-16)', () => {
  const live = { scheduled: false, groupId: 'g', attendanceId: 'a' };
  it('flag off: any live session context re-invites (legacy)', () => {
    expect(shouldReInvite({ ...live, groupFixes: false, isGroupRun: false })).toBe(true);
  });
  it('flag on: only a group run or the lobby re-invites', () => {
    expect(shouldReInvite({ ...live, groupFixes: true, isGroupRun: false })).toBe(false);
    expect(shouldReInvite({ ...live, groupFixes: true, isGroupRun: true })).toBe(true);
    expect(shouldReInvite({ ...live, groupFixes: true, isGroupRun: false, fromLobby: true })).toBe(true);
  });
  it('scheduled or no session → never', () => {
    expect(shouldReInvite({ ...live, scheduled: true, groupFixes: false, isGroupRun: true })).toBe(false);
    expect(shouldReInvite({ scheduled: false, groupId: null, attendanceId: 'a', groupFixes: false, isGroupRun: true })).toBe(false);
  });
});

describe('client local time for "now" invites (P2-15)', () => {
  it('localNowStamp formats the device wall clock', () => {
    expect(localNowStamp(new Date(2026, 9, 22, 7, 5))).toBe('2026-10-22T07:05');
  });
  it('server accepts a plausible local stamp (Israel = UTC+3)', () => {
    const serverNow = Date.UTC(2026, 9, 22, 16, 30);
    expect(attendanceIdFromClientNow('2026-10-22T19:30', serverNow)).toBe('2026-10-22_19-30');
  });
  it('server rejects malformed or implausible stamps', () => {
    const serverNow = Date.UTC(2026, 9, 22, 16, 30);
    expect(attendanceIdFromClientNow(undefined, serverNow)).toBeNull();
    expect(attendanceIdFromClientNow('2026-10-22 19:30', serverNow)).toBeNull();
    expect(attendanceIdFromClientNow('2026-10-25T19:30', serverNow)).toBeNull();
    expect(attendanceIdFromClientNow('2026-10-22T25:30', serverNow)).toBeNull();
  });
});
