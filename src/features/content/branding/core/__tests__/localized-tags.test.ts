import { describe, it, expect } from 'vitest';
import { LOCALIZED_CONTENT_TAGS, unsafeTags } from '../../../../../../scripts/i18n/content/collection-bulk';
import { getAvailableContentTags, resolveContentTags, type TagResolverContext } from '../branding.utils';
import type { NotificationTriggerType } from '../branding.types';

const HEBREW = /[֐-׿]/;
const TRIGGERS: NotificationTriggerType[] = ['Location_Based', 'Inactivity', 'League_Overtake', 'Community_Group_New', 'Social_Matchmaking'];
// ASCII-only caller data, as an English session would hand in.
const rich: TagResolverContext = {
  currentTime: new Date(2026, 9, 1, 8, 0), userName: 'Dana', userGender: 'female', persona: 'parent', location: 'park', locationName: 'Yarkon Park',
  exerciseName: 'Pull-up', category: 'strength', muscles: ['chest', 'back'], goal: 'weight_loss', equipment: ['rings'], sportType: 'running',
  experienceLevel: 'pro', programProgress: 40, currentProgram: 'pulling', targetLevel: 3, distanceMeters: 800, estimatedArrivalMinutes: 5,
  durationMinutes: 30, difficulty: 2, dominantMuscle: 'abs', targetExerciseName: 'Pull-up', targetValue: '10 reps', goalProgressPercent: 50,
  runningBasePace: 330, targetDistanceLabel: '5 km', programPhase: 'base', runningCategory: 'tempo', weekNumber: 2, totalWeeks: 8,
  intensityReason: 'short rests', challengeType: 'level up', equipmentAdaptation: 'bodyweight only', weeklyGapDomain: 'pushing', weeklyGapPercent: 30,
  streakDays: 5, stepsLeft: 1200, walkMinutes: 10, currentProgressionStep: 'Diamond push-ups', avgRepCount: 8, weeklyCompletedSets: 10, weeklySetQuota: 20,
  daysInactive: 4, overtakingUserName: 'Noa', newLeaderboardRank: 2, stepDelta: 900, groupName: 'Morning run', groupTypeLabel: 'Running group',
  meetingLocationName: 'Park', meetingTimeFormatted: '06:30', meetingDayFormatted: 'Tuesday', partnerName: 'Sam', partnerLevel: 'level 3', partnerArrivalTime: '18:00',
};

describe('LOCALIZED_CONTENT_TAGS', () => {
  it('covers every tag the admin tag list offers', () => {
    const missing = getAvailableContentTags().map((t) => t.tag).filter((t) => !LOCALIZED_CONTENT_TAGS.includes(t));
    expect(missing).toEqual([]);
  });

  it('every listed tag resolves in English without Hebrew words for ASCII caller data (trigger-gated tags under their trigger)', () => {
    for (const tag of LOCALIZED_CONTENT_TAGS) {
      const outs = TRIGGERS.map((triggerType) => resolveContentTags(`x ${tag} y`, { ...rich, triggerType }, 'en'));
      expect(outs.some((o) => !HEBREW.test(o)), `${tag} -> ${outs[0]}`).toBe(true);
      // under any other trigger the tag is either resolved or left whole (never half Hebrew words)
      for (const o of outs) expect(o === `x ${tag} y` || !HEBREW.test(o), `${tag} -> ${o}`).toBe(true);
    }
  });

  it('unknown tags stay rejected, localized ones pass', () => {
    expect(unsafeTags('A @מיקוד_פיזיולוגי b @סיבת_רצף c')).toEqual([]);
    expect(unsafeTags('A @תג_לא_מוכר b @מיקום')).toEqual(['@תג_לא_מוכר']);
  });
});
