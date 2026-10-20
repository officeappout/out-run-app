import { describe, expect, it } from 'vitest';
import {
  addTrackDoneRoute,
  addTrackWeekRoute,
  parseAddedTrack,
  strengthResultNextRoute,
} from '../add-track-routing';
import { ADD_TRACK_COMBINED_WEEK_ROUTE } from '../run-signup-routing';

describe('add-track routing (enable_home_v2, J3 / J4)', () => {
  it('J3: the running signup hands a strength user off to the combined week', () => {
    expect(ADD_TRACK_COMBINED_WEEK_ROUTE).toBe(addTrackWeekRoute('running'));
    expect(parseAddedTrack(new URL(`https://x${ADD_TRACK_COMBINED_WEEK_ROUTE}`).searchParams.get('added'))).toBe('running');
  });

  it('J4: a runner who signed the declaration goes from the strength result to the combined week', () => {
    expect(strengthResultNextRoute({ v2: true, hasRunningTrack: true, healthAccepted: true })).toBe('/onboarding-new/add-track-week?added=strength');
  });

  it('flag off, a first track, or an unsigned declaration keep today’s route (health)', () => {
    expect(strengthResultNextRoute({ v2: false, hasRunningTrack: true, healthAccepted: true })).toBe('/onboarding-new/health');
    expect(strengthResultNextRoute({ v2: true, hasRunningTrack: false, healthAccepted: true })).toBe('/onboarding-new/health');
    expect(strengthResultNextRoute({ v2: true, hasRunningTrack: true, healthAccepted: false })).toBe('/onboarding-new/health');
  });

  it('after reminders: a new running track still runs the signup sync (health, auto-skipped); strength goes home', () => {
    expect(addTrackDoneRoute('running')).toBe('/onboarding-new/health');
    expect(addTrackDoneRoute('strength')).toBe('/home');
  });

  it('rejects unknown tracks', () => {
    expect(parseAddedTrack('yoga')).toBeNull();
    expect(parseAddedTrack(null)).toBeNull();
  });
});
