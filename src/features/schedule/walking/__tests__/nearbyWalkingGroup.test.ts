import { describe, expect, it } from 'vitest';
import {
  minutesUntilSlot,
  pickWalkingGroupSuggestion,
  suggestionLineHe,
  walkingGroupHref,
  whenLabelHe,
} from '../nearbyWalkingGroup';

// Wednesday 21.10.2026 17:00, Tel Aviv
const NOW = new Date(2026, 9, 21, 17, 0);
const ME = { lat: 32.0853, lng: 34.7818 };

const group = (over: Record<string, unknown> = {}) => ({
  id: 'g1',
  name: 'הולכים בירקון',
  category: 'walking' as const,
  isActive: true,
  isPublic: true,
  meetingLocation: { address: 'פארק הירקון', location: { lat: 32.0985, lng: 34.8 } },
  scheduleSlots: [{ dayOfWeek: 3, time: '18:30', frequency: 'weekly' as const }],
  ...over,
});

describe('slot timing', () => {
  it('minutes until the next weekly slot', () => {
    expect(minutesUntilSlot({ dayOfWeek: 3, time: '18:30' }, NOW)).toBe(90);
    expect(minutesUntilSlot({ dayOfWeek: 3, time: '16:00' }, NOW)).toBe(7 * 1440 - 60);
    expect(minutesUntilSlot({ dayOfWeek: 3, time: 'bad' }, NOW)).toBeNull();
  });
  it('labels', () => {
    expect(whenLabelHe({ dayOfWeek: 3, time: '18:30' }, NOW)).toBe('היום 18:30');
    expect(whenLabelHe({ dayOfWeek: 4, time: '07:00' }, NOW)).toBe('מחר 07:00');
    expect(whenLabelHe({ dayOfWeek: 0, time: '07:00' }, NOW)).toBe('ביום א׳ 07:00');
  });
});

describe('pick', () => {
  it('the soonest nearby walking session', () => {
    const later = group({ id: 'g2', scheduleSlots: [{ dayOfWeek: 5, time: '07:00', frequency: 'weekly' }] });
    const s = pickWalkingGroupSuggestion([later, group()], ME, NOW);
    expect(s?.groupId).toBe('g1');
    expect(s?.whenHe).toBe('היום 18:30');
    expect(s && suggestionLineHe(s)).toBe('יש קבוצת הליכה היום 18:30 · פארק הירקון');
  });
  it('skips far, city-only, non-walking, private and ephemeral groups', () => {
    const far = group({ meetingLocation: { location: { lat: 31.25, lng: 34.79 } } });
    const city = group({ meetingLocation: { precision: 'city', location: ME } });
    expect(pickWalkingGroupSuggestion([far, city, group({ category: 'running' }), group({ isPublic: false }), group({ type: 'ephemeral' })], ME, NOW)).toBeNull();
  });
  it('no position → nothing', () => {
    expect(pickWalkingGroupSuggestion([group()], null, NOW)).toBeNull();
  });
  it('links to the group drawer', () => {
    expect(walkingGroupHref('a b')).toBe('/home?openGroupDrawer=a%20b');
  });
});
