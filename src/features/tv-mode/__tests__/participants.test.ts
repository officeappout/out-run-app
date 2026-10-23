import { describe, expect, it } from 'vitest';
import { TV_AVATAR_COUNT } from '../core/constants';
import { defaultAvatar, firstName, initialOf, orderParticipants, participantColor } from '../core/participants';
import type { TvParticipant } from '../core/types';

const p = (uid: string, joinedAtMs: number, state: TvParticipant['state'] = 'joined'): TvParticipant => ({ uid, name: uid, joinedAtMs, avatar: 0, state, seq: 0 });

describe('orderParticipants', () => {
  it('host first, then join order — equal list, no ranking by progress', () => {
    const list = [p('c', 30), p('a', 10), p('host', 20, 'active'), p('b', 15, 'done')];
    expect(orderParticipants(list, 'host').map((x) => x.uid)).toEqual(['host', 'a', 'b', 'c']);
  });
  it('drops people who left and breaks time ties by uid', () => {
    const list = [p('z', 5), p('y', 5), p('gone', 1, 'left')];
    expect(orderParticipants(list, null).map((x) => x.uid)).toEqual(['y', 'z']);
  });
  it('does not mutate its input', () => {
    const list = [p('b', 2), p('a', 1)];
    orderParticipants(list, null);
    expect(list.map((x) => x.uid)).toEqual(['b', 'a']);
  });
});

describe('avatars and names', () => {
  it('colour is stable per uid', () => {
    expect(participantColor('abc')).toBe(participantColor('abc'));
    expect(participantColor('abc')).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('the default avatar is stable, in range, and drives the colour when the doc has one', () => {
    for (const uid of ['a', 'abc', 'uid-12345', '']) {
      const a = defaultAvatar(uid);
      expect(a).toBe(defaultAvatar(uid));
      expect(Number.isInteger(a) && a >= 0 && a < TV_AVATAR_COUNT).toBe(true);
    }
    expect(participantColor('abc', 2)).toBe(participantColor('someone-else', 2));
    expect(participantColor('abc', 99)).toBe(participantColor('abc'));
    expect(participantColor('abc', -1)).toBe(participantColor('abc'));
  });
  it('first name only (shared screen), initial is one character', () => {
    expect(firstName('  נועה כהן  ')).toBe('נועה');
    expect(initialOf('נועה')).toBe('נ');
    expect(initialOf('  ')).toBe('?');
    expect(initialOf('👩‍🦰 Dana')).toBe('👩‍🦰');
  });
});
