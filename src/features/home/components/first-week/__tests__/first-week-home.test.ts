import { describe, it, expect } from 'vitest';
import {
  createdAtMillis,
  firstWeekArtTrack,
  firstWeekCardForProfile,
  firstWeekDismissKey,
  profileHasWorkout,
} from '../first-week-home';

const D = 86_400_000;
const NOW = Date.UTC(2026, 9, 21, 9); // 12:00 Israel

describe('first-week home card (enable_home_v2)', () => {
  it('reads createdAt from a Timestamp, Date, millis or ISO', () => {
    expect(createdAtMillis({ toMillis: () => 5 })).toBe(5);
    expect(createdAtMillis({ seconds: 2 })).toBe(2000);
    expect(createdAtMillis(new Date(7))).toBe(7);
    expect(createdAtMillis('2026-10-21T00:00:00Z')).toBe(Date.UTC(2026, 9, 21));
    expect(createdAtMillis(null)).toBeNull();
  });

  it('welcome on day 0 with the first name; the day-2 walk card links to a walk on the map', () => {
    expect(firstWeekCardForProfile({ createdAt: NOW - 3_600_000, core: { name: 'דנה כהן' } }, NOW)?.title).toBe('דנה, הכול מוכן');
    const d2 = firstWeekCardForProfile({ createdAt: NOW - 2 * D }, NOW);
    expect(d2?.lever).toBe('low_bar');
    expect(d2?.href).toBe('/map?openRun=walking');
  });

  it('gone after the first workout, after day 7, or with no signup date', () => {
    expect(firstWeekCardForProfile({ createdAt: NOW - 2 * D, progression: { workoutCount: 1 } }, NOW)).toBeNull();
    expect(firstWeekCardForProfile({ createdAt: NOW - 2 * D }, NOW, true)).toBeNull();
    expect(firstWeekCardForProfile({ createdAt: NOW - 2 * D, running: { lastWorkoutDate: '2026-10-20' } }, NOW)).toBeNull();
    expect(firstWeekCardForProfile({ createdAt: NOW - 9 * D }, NOW)).toBeNull();
    expect(firstWeekCardForProfile({}, NOW)).toBeNull();
    expect(firstWeekCardForProfile(null, NOW)).toBeNull();
    expect(profileHasWorkout({ progression: { workoutCount: 0 } })).toBe(false);
  });

  it('art follows the track; dismissal is per user per day', () => {
    expect(firstWeekArtTrack({ lifestyle: { primaryTrack: 'run' } })).toBe('running');
    expect(firstWeekArtTrack({})).toBe('strength');
    expect(firstWeekDismissKey('u1', 3)).not.toBe(firstWeekDismissKey('u1', 4));
  });
});
