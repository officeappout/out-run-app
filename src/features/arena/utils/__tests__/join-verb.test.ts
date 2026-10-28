import { describe, it, expect } from 'vitest';
import he from '@/messages/he/community.json';
import { groupJoinVerbKey, eventJoinVerbKey } from '../join-verb';

const heText = (k: string) => (he as Record<string, string>)[k];

// The Hebrew verbs the app used before they moved into the catalog (byte-identical contract).
const GROUP_BEFORE: Record<string, string> = { walking: 'ילך', running: 'ירוץ', yoga: 'יתאמן', calisthenics: 'יתאמן', cycling: 'ירכב', other: 'יתאמן' };
const EVENT_BEFORE: Record<string, string> = { race: 'ירוץ', fitness_day: 'יתאמן', workshop: 'ישתתף', community_meetup: 'ישתתף', other: 'יתאמן' };

describe('join verb: Hebrew is byte-identical, the verb comes from the catalog', () => {
  it.each(Object.entries(GROUP_BEFORE))('group %s', (cat, verb) => {
    expect(heText(groupJoinVerbKey(cat))).toBe(verb);
  });
  it.each(Object.entries(EVENT_BEFORE))('event %s', (cat, verb) => {
    expect(heText(eventJoinVerbKey(cat))).toBe(verb);
  });
  it('unknown / missing category falls back to the old default verb', () => {
    expect(heText(groupJoinVerbKey('??'))).toBe('יתאמן');
    expect(heText(groupJoinVerbKey(undefined))).toBe('יתאמן');
    expect(heText(eventJoinVerbKey('??'))).toBe('יתאמן');
  });
  it('the subtitle still composes the same Hebrew sentence', () => {
    expect(heText('postJoin.subtitle')).toContain('{verb}');
  });
});
