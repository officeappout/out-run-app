import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ auth: { currentUser: null, authStateReady: async () => {} } }));

import { calendarSubscriptionUrl, openCalendarOnSwitchOn } from '../calendar-subscription';

describe('calendar sync switch (pilot P17: the switch must open the calendar)', () => {
  it('turning the switch ON opens the subscription with the feed path', () => {
    const open = vi.fn();
    expect(openCalendarOnSwitchOn(true, '/api/calendar/t/abc', open)).toBe(true);
    expect(open).toHaveBeenCalledWith('/api/calendar/t/abc');
  });

  it('turning it OFF, or before the feed path loaded, opens nothing', () => {
    const open = vi.fn();
    expect(openCalendarOnSwitchOn(false, '/api/calendar/t/abc', open)).toBe(false);
    expect(openCalendarOnSwitchOn(true, null, open)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('platform URLs: webcal on iOS and web, Google Calendar subscribe on Android', () => {
    expect(calendarSubscriptionUrl('ios', 'outrun.co.il', '/api/calendar/t/x')).toBe('webcal://outrun.co.il/api/calendar/t/x');
    expect(calendarSubscriptionUrl('web', 'localhost:3000', '/api/calendar/t/x')).toBe('webcal://localhost:3000/api/calendar/t/x');
    expect(calendarSubscriptionUrl('android', 'outrun.co.il', '/api/calendar/t/x')).toBe(
      `https://calendar.google.com/calendar/r?cid=${encodeURIComponent('webcal://outrun.co.il/api/calendar/t/x')}`,
    );
  });
});
