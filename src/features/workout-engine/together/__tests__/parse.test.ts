import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));

import { Timestamp } from 'firebase/firestore';
import { parsePresenceDoc } from '../services/firestore-presence-adapter';
import { presenceCollectionPath, stripUndefined } from '../core/session-key';

describe('presence doc parsing', () => {
  it('a plain RSVP doc (no together map) is not a participant', () => {
    expect(parsePresenceDoc('u', { uid: 'u', status: 'rsvp' })).toBeNull();
  });
  it('parses a run status, defaulting unknown kind / state defensively', () => {
    const e = parsePresenceDoc('u', {
      status: 'here',
      together: { name: 'דני', kind: 'weird', state: 'nope', distanceKm: 2.5, paceSecPerKm: NaN, clientMs: 10, seq: 3, serverTs: Timestamp.fromMillis(777), cheersSent: { x: 2, y: 0, z: 'a' } },
    });
    expect(e).toMatchObject({ uid: 'u', name: 'דני', kind: 'run', state: 'active', distanceKm: 2.5, seq: 3, serverMs: 777, cheersSent: { x: 2 } });
    expect(e).not.toHaveProperty('paceSecPerKm');
  });
  it('a pending server timestamp reads as null', () => {
    expect(parsePresenceDoc('u', { together: { name: 'א', kind: 'amrap', roundsDone: 2, serverTs: null } })).toMatchObject({ kind: 'amrap', roundsDone: 2, serverMs: null });
  });
  it('path + undefined stripping', () => {
    expect(presenceCollectionPath({ groupId: 'g', attendanceId: 'a' })).toBe('community_groups/g/attendance/a/member_statuses');
    expect(stripUndefined({ a: 1, b: undefined, c: NaN, d: 'x' })).toEqual({ a: 1, d: 'x' });
  });
});
