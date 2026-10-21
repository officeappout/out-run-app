import { describe, it, expect } from 'vitest';
import {
  dropoffStageOf,
  firstWorkoutDue,
  firstWorkoutWindow,
  pushTrackFromUserData,
  recordRetentionLegacySend,
  retentionLegacyCapReached,
  retentionLegacyLogFrom,
  RETENTION_LEGACY_MAX_SENDS,
  trackConditions,
} from '../push-lifecycle';
import { isConfirmedAdult } from '../age-guard';
import { selectPushCopy } from '../../shared/push-library.core';

const H = 3_600_000;

describe('pushTrackFromUserData', () => {
  it('run / strength / walk / mixed', () => {
    expect(pushTrackFromUserData({ running: { isUnlocked: true } })).toBe('run');
    expect(pushTrackFromUserData({ progression: { domains: { upper_body: { currentLevel: 3 } } } })).toBe('strength');
    // a running domain alone is not strength
    expect(pushTrackFromUserData({ running: { isUnlocked: true }, progression: { domains: { running: { currentLevel: 2 } } } })).toBe('run');
    expect(pushTrackFromUserData({ lifestyle: { primaryTrack: 'health' } })).toBe('walk');
    const both = { running: { isUnlocked: true }, progression: { domains: { full_body: { currentLevel: 1 } } } };
    expect(pushTrackFromUserData(both)).toBeNull();
    expect(pushTrackFromUserData({ ...both, lifestyle: { primaryTrack: 'run' } })).toBe('run');
    expect(pushTrackFromUserData({})).toBeNull();
  });
});

describe('dropoffStageOf + the "נשאר רק עוד צעד" rule', () => {
  it('maps onboardingStep to a stage', () => {
    expect(dropoffStageOf('IDENTITY')).toBe('early');
    expect(dropoffStageOf('ASSESSMENT')).toBe('mid');
    expect(dropoffStageOf('HEALTH')).toBe('near_end');
    expect(dropoffStageOf('VISUAL_ASSESSMENT_COMPLETE')).toBe('near_end');
    expect(dropoffStageOf(undefined)).toBeNull();
  });

  const pick = (uid: string, stage: string | null, gender: 'male' | 'female' | null = null) =>
    selectPushCopy('onboarding_dropoff', [], {
      uid,
      audience: { gender },
      vars: { '@שם': 'דנה' },
      conditions: trackConditions(null, { stage }),
    })!;

  it('"נשאר רק עוד צעד" / "פחות מדקה" never go to who stopped early, mid, or unknown', () => {
    for (const stage of ['early', 'mid', null]) {
      for (const g of ['male', 'female', null] as const) {
        for (let i = 0; i < 40; i++) {
          const c = pick(`u-${stage}-${g}-${i}`, stage, g);
          expect(`${c.title} ${c.body}`).not.toMatch(/נשאר רק עוד צעד|פחות מדקה|עוד דקה/);
        }
      }
    }
  });

  it('who stopped at the health declaration can get it', () => {
    const titles = Array.from({ length: 60 }, (_, i) => pick(`n-${i}`, 'near_end').title);
    expect(titles.some((t) => t.includes('נשאר רק עוד צעד'))).toBe(true);
  });
});

describe('first workout window', () => {
  const signup = Date.UTC(2026, 9, 18, 9);
  it('day1 = 24–48h, day2 = 48–72h, else null', () => {
    expect(firstWorkoutWindow(signup, signup + 20 * H)).toBeNull();
    expect(firstWorkoutWindow(signup, signup + 30 * H)).toBe('day1');
    expect(firstWorkoutWindow(signup, signup + 50 * H)).toBe('day2');
    expect(firstWorkoutWindow(signup, signup + 80 * H)).toBeNull();
    expect(firstWorkoutWindow(null, signup)).toBeNull();
  });
  it('once per window, at most twice', () => {
    expect(firstWorkoutDue('day1', [])).toBe(true);
    expect(firstWorkoutDue('day1', ['day1'])).toBe(false);
    expect(firstWorkoutDue('day2', ['day1'])).toBe(true);
    expect(firstWorkoutDue('day2', ['day1', 'day2'])).toBe(false);
  });
  it('first_workout copy is per track and never says "לחזור"', () => {
    for (const track of ['strength', 'run', 'walk', null] as const) {
      for (const when of ['day1', 'day2', 'later']) {
        const c = selectPushCopy('first_workout', [], { uid: `x-${track}-${when}`, vars: { '@שם': 'דנה' }, conditions: trackConditions(track, { when }) })!;
        expect(c).not.toBeNull();
        expect(`${c.title} ${c.body}`).not.toMatch(/לחזור|חוזרים/);
      }
    }
    const run = selectPushCopy('first_workout', [], { uid: 'r', conditions: trackConditions('run', { when: 'day1' }) })!;
    expect(run.title).toContain('ריצה');
  });
});

describe('retention legacy cap', () => {
  it(`stops after ${RETENTION_LEGACY_MAX_SENDS} sends per absence; a new activity resets`, () => {
    let log = retentionLegacyLogFrom(undefined);
    for (let i = 0; i < RETENTION_LEGACY_MAX_SENDS; i++) {
      expect(retentionLegacyCapReached(log, 1000)).toBe(false);
      log = recordRetentionLegacySend(log, 1000);
    }
    expect(retentionLegacyCapReached(log, 1000)).toBe(true);
    expect(retentionLegacyCapReached(log, 2000)).toBe(false);
    expect(recordRetentionLegacySend(log, 2000)).toEqual({ anchor: 2000, count: 1 });
  });
});

describe('isConfirmedAdult (minors guard)', () => {
  const now = new Date(Date.UTC(2026, 9, 21));
  it('only a known adult passes', () => {
    expect(isConfirmedAdult({ core: { ageGroup: 'adult' } }, now)).toBe(true);
    expect(isConfirmedAdult({ core: { ageGroup: 'minor' } }, now)).toBe(false);
    expect(isConfirmedAdult({ core: {} }, now)).toBe(false);
    expect(isConfirmedAdult(undefined, now)).toBe(false);
    expect(isConfirmedAdult({ core: { ageGroup: 'adult', birthDate: Date.UTC(2012, 0, 1) } }, now)).toBe(false);
    expect(isConfirmedAdult({ core: { ageGroup: 'adult', birthDate: '1990-05-01' } }, now)).toBe(true);
  });
});
