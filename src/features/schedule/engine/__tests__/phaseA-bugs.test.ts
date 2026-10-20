/**
 * Schedule advisor phase A — one test (at least) per audited bug, by number.
 */
import { describe, it, expect } from 'vitest';
import { buildWeaverInput, defaultWeaveControls, resolveRunningLevel, type WeaverInputProfile } from '../weaverInput';
import { weaveWeek } from '../scheduleWeaver';
import { computeWeaveResultSafely } from '../computeWeaveResultSafely';
import { runningRuleFamily } from '../ruleFamily';
import { validateCrossDomain } from '../crossDomainRules';
import { classifyStrengthId, countStrengthTemplateDays } from '../strengthVocabulary';
import { renderScheduleReasonHe, SCHEDULE_REASON_RANK, type ScheduleReason } from '../reasons';
import type { RunningWeekDay } from '../runningRules';
import type { ScheduleDay, DayOfWeek } from '../../types/smartSchedule.types';
import { WHO_STRENGTH_TARGET_DAYS } from '@/lib/who-strength-target';

const ASOF = new Date('2026-10-15T12:00:00Z');
const START = '2026-10-11T00:00:00';

function runner(scheduleDays = ['ב', 'ד', 'ו']): WeaverInputProfile {
  return {
    running: {
      isUnlocked: true,
      scheduleDays,
      activeProgram: {
        startDate: START,
        schedule: [
          { week: 1, day: 1, category: 'tempo', slotType: 'quality_primary', isQualityWorkout: true },
          { week: 1, day: 2, category: 'easy_run', slotType: 'easy_run', isQualityWorkout: false },
          { week: 1, day: 3, category: 'long_run', slotType: 'long_run', isQualityWorkout: false },
        ],
      },
    },
  };
}

const sDays = (w: ScheduleDay[]) => w.filter((d) => d.sessions.length > 0).map((d) => d.dayOfWeek);
const rDays = (w: RunningWeekDay[]) => w.filter((d) => d.category !== null).map((d) => d.dayOfWeek);

describe('bug #1 — no invented strength for a runner (or a strength request under 2)', () => {
  it('runner-only user in the default mixed tab: zero strength, all 3 runs, no fallback', () => {
    const result = computeWeaveResultSafely(runner(), 'mixed', 50, 3, ASOF)!;
    expect(sDays(result.week.strength)).toEqual([]);
    expect(rDays(result.week.running)).toEqual([1, 3, 5]);
    expect(result.reasons.some((r) => r.code === 'NO_VALID_WEEK')).toBe(false);
  });

  it('the R7 floor applies only when strength is owned AND requested ≥ 2', () => {
    expect(buildWeaverInput(runner(), 'mixed', 50, 3, ASOF)!.crossDomainContext.minStrengthDaysPerWeek).toBe(0);
    const oneDay: WeaverInputProfile = {
      ...runner(),
      progression: { domains: { push: { currentLevel: 3 } }, activePrograms: [{ templateId: 'push' }] },
      lifestyle: { recurringTemplate: { א: ['push'] } },
    };
    const input = buildWeaverInput(oneDay, 'mixed', 50, 3, ASOF)!;
    expect(input.strength.requestedCount).toBe(1);
    expect(input.crossDomainContext.minStrengthDaysPerWeek).toBe(0);
    const woven = weaveWeek(input);
    expect(sDays(woven.week.strength)).toHaveLength(1);
    expect(rDays(woven.week.running)).toHaveLength(3);
    const twoDays = { ...oneDay, lifestyle: { recurringTemplate: { א: ['push'], ג: ['pull'] } } };
    expect(buildWeaverInput(twoDays, 'mixed', 50, 3, ASOF)!.crossDomainContext.minStrengthDaysPerWeek).toBe(WHO_STRENGTH_TARGET_DAYS);
  });

  it('the total-failure fallback never invents a domain (strength 0 requested → empty strength)', () => {
    const input = buildWeaverInput(runner(), 'mixed', 50, 3, ASOF)!;
    // Force the fallback: 3 runs on 0 available days.
    const woven = weaveWeek({ ...input, availableDayCount: 0 });
    expect(sDays(woven.week.strength)).toEqual([]);
  });
});

describe('bug #2 — drawer defaults come from the profile, not 3 days / focus 50', () => {
  it('runner-only → running tab; strength-only → strength tab; both → mixed', () => {
    expect(defaultWeaveControls(runner()).mode).toBe('running');
    const strength: WeaverInputProfile = { progression: { domains: { push: { currentLevel: 2 } } }, lifestyle: { recurringTemplate: { א: ['push'], ג: ['pull'], ה: ['legs'], ו: ['core'] } } };
    expect(defaultWeaveControls(strength)).toEqual({ mode: 'strength', focus: 50, availableDayCount: 4 });
    const both = { ...strength, ...runner(), lifestyle: { ...strength.lifestyle, primaryTrack: 'run' } };
    expect(defaultWeaveControls(both)).toEqual({ mode: 'mixed', focus: 65, availableDayCount: 7 });
  });

  it('primaryTrack strength → focus < 50 (strength dominant); saved prefs win', () => {
    const p: WeaverInputProfile = { lifestyle: { primaryTrack: 'strength' } };
    expect(defaultWeaveControls(p).focus).toBeLessThan(50);
    const saved: WeaverInputProfile = { ...runner(), lifestyle: { scheduleAdvisorPrefs: { availableDayCount: 4, focus: 20 } } };
    expect(defaultWeaveControls(saved)).toMatchObject({ availableDayCount: 4, focus: 20 });
  });
});

describe('bug #3 — one strength vocabulary (slugs, hash ids, legs)', () => {
  it('program slugs map into the schedule taxonomy, legs → LOWER_BODY', () => {
    expect(classifyStrengthId('push').scheduleId).toBe('UPPER_BODY');
    expect(classifyStrengthId('legs').scheduleId).toBe('LOWER_BODY');
    expect(classifyStrengthId('lower_body').scheduleId).toBe('LOWER_BODY');
    expect(classifyStrengthId('planche').scheduleId).toBe('PLANCHE');
    expect(classifyStrengthId('PLANCHE').scheduleId).toBe('PLANCHE');
    expect(classifyStrengthId('run_plan_5k').scheduleId).toBeNull();
  });

  it('a raw Firestore id resolves only through the resolver — never guessed', () => {
    const hash = 'aB3dE5fG7hI9jK1lM2nO';
    expect(classifyStrengthId(hash).scheduleId).toBeNull();
    expect(classifyStrengthId(hash, (id) => (id === hash ? 'legs' : id)).scheduleId).toBe('LOWER_BODY');
  });

  it('a push / pull / legs template counts 3 strength days (it used to count 0)', () => {
    const template = { א: ['push'], ג: ['pull', 'run_plan_5k'], ה: ['legs'], ו: ['run_plan_5k'] };
    expect(countStrengthTemplateDays(template)).toBe(3);
    const profile: WeaverInputProfile = { progression: { domains: { push: { currentLevel: 3 } }, activePrograms: [{ templateId: 'push' }] }, lifestyle: { recurringTemplate: template } };
    const input = buildWeaverInput(profile, 'strength', 30, 3, ASOF)!;
    expect(input.strength.requestedCount).toBe(3);
    expect(input.strength.existingWeek[4].sessions.map((s) => s.skillId)).toEqual(['LOWER_BODY']);
  });
});

describe('R4 / R6b / R5 — the leg notion at work', () => {
  const week = (legsDay: number, legsId: 'LOWER_BODY' | 'FULL_BODY' = 'LOWER_BODY') => {
    const strength: ScheduleDay[] = Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i as DayOfWeek, sessions: [], isRestDay: true, warnings: [] }));
    strength[legsDay] = { dayOfWeek: legsDay as DayOfWeek, sessions: [{ skillId: legsId, volumePercent: 100, sessionType: 'FULL' }], isRestDay: false, warnings: [] };
    strength[0] = { dayOfWeek: 0, sessions: [{ skillId: 'UPPER_BODY', volumePercent: 100, sessionType: 'FULL' }], isRestDay: false, warnings: [] };
    const running: RunningWeekDay[] = Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, category: null }));
    running[3] = { dayOfWeek: 3, category: 'tempo', slotType: 'quality_primary' };
    running[6] = { dayOfWeek: 6, category: 'long_run', slotType: 'long_run' };
    return { strength, running };
  };
  const ctx = { minStrengthDaysPerWeek: 2 };

  it('R4: heavy legs the day before a quality run is an ERROR; full body only a WARN', () => {
    expect(validateCrossDomain(week(2), ctx).violations).toContainEqual(expect.objectContaining({ code: 'R4', severity: 'ERROR' }));
    expect(validateCrossDomain(week(2, 'FULL_BODY'), ctx).violations).toContainEqual(expect.objectContaining({ code: 'R4', severity: 'WARN' }));
    expect(validateCrossDomain(week(2, 'FULL_BODY'), ctx).valid).toBe(true);
  });

  it('R6b: heavy legs the day before the long run is an ERROR', () => {
    const v = validateCrossDomain(week(5), ctx);
    expect(v.valid).toBe(false);
    expect(v.violations.map((x) => x.code)).toContain('R6b');
  });

  it('R5: a double day on an easy run is a WARN, never a block', () => {
    const w = week(1);
    w.running[0] = { dayOfWeek: 0, category: 'easy_run', slotType: 'easy_run' };
    const v = validateCrossDomain(w, ctx);
    expect(v.violations).toContainEqual(expect.objectContaining({ code: 'R5', severity: 'WARN', affectedDays: [0] }));
  });
});

describe('bug #4 — strength moves to any sound day-set, including 7 days', () => {
  it('a 7-day strength request is honoured in the strength tab', () => {
    const template = { א: ['push'], ב: ['pull'], ג: ['legs'], ד: ['core'], ה: ['push'], ו: ['pull'], ש: ['legs'] };
    const profile: WeaverInputProfile = { progression: { domains: { push: { currentLevel: 3 } } }, lifestyle: { recurringTemplate: template } };
    const result = computeWeaveResultSafely(profile, 'strength', 30, 7, ASOF)!;
    expect(sDays(result.week.strength)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(result.reasons.some((r) => r.code === 'SATURDAY_USED')).toBe(true);
  });
});

describe('bug #5 — recovery runs are dropped first', () => {
  it('reduceTo drops the recovery run before the easy run', () => {
    const w: RunningWeekDay[] = Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, category: null }));
    w[1] = { dayOfWeek: 1, category: 'tempo', slotType: 'quality_primary' };
    w[2] = { dayOfWeek: 2, category: 'easy_run', slotType: 'easy_run' };
    w[4] = { dayOfWeek: 4, category: 'easy_run', slotType: 'recovery' };
    w[6] = { dayOfWeek: 6, category: 'long_run', slotType: 'long_run' };
    const r = runningRuleFamily.reduceTo(w, 3, { targetDistanceKm: 10 });
    expect(r.week[4].category).toBeNull();
    expect(r.week[2].category).toBe('easy_run');
    // It used to be unable to reach the target at all when only recovery was left to drop.
    const onlyRecovery = runningRuleFamily.reduceTo(
      w.map((d) => (d.dayOfWeek === 2 ? { dayOfWeek: 2, category: null } : d)),
      2,
      { targetDistanceKm: 10 },
    );
    expect(onlyRecovery.week.filter((d) => d.category !== null)).toHaveLength(2);
  });
});

describe('bug #6 — reasons bind on the final week, rendered in Hebrew only', () => {
  it('a week with room reports nothing (no rule "encountered" by a rejected candidate)', () => {
    const profile: WeaverInputProfile = {
      ...runner(),
      progression: { domains: { push: { currentLevel: 3 } }, activePrograms: [{ templateId: 'push' }] },
      lifestyle: { recurringTemplate: { א: ['push'], ג: ['pull'], ה: ['push'] } },
    };
    const result = computeWeaveResultSafely(profile, 'mixed', 50, 7, ASOF)!;
    expect(result.reasons).toEqual([]);
    expect(result.notes).toEqual([]);
  });

  it('every reason code renders to Hebrew with no code, id or English token', () => {
    const samples: ScheduleReason[] = [
      { code: 'LONG_RUN_PROTECTED' },
      { code: 'LEGS_BEFORE_KEY_RUN', run: 'long', soft: false },
      { code: 'LEGS_BEFORE_KEY_RUN', run: 'quality', soft: true, day: 2 },
      { code: 'QUALITY_RUN_FIRST', day: 1 },
      { code: 'ONE_SHARED_DAY_MAX' },
      { code: 'STRENGTH_FLOOR', floor: 2 },
      { code: 'RUN_SPACING' },
      { code: 'RUN_STREAK_CAP', max: 3 },
      { code: 'EASY_DAY_DOUBLED', day: 3 },
      { code: 'SATURDAY_USED' },
      { code: 'RUNNING_REDUCED', from: 3, to: 2, dropped: ['easy_run'] },
      { code: 'STRENGTH_REDUCED', from: 3, to: 2 },
      { code: 'AVAILABILITY_SHORT', available: 3, requested: 6 },
      { code: 'DOMAIN_EXCLUDED_BY_TAB', domain: 'running' },
      { code: 'NO_VALID_WEEK' },
      { code: 'STRENGTH_PEAK_IN_RUN_PEAK', strengthWeek: 4, runWeek: 6 },
      { code: 'STRENGTH_DELOAD_WEEK' },
      { code: 'RUN_PEAK_WEEK', runWeek: 6 },
      { code: 'RUN_TAPER_WEEK', runWeek: 8 },
      { code: 'TODAY_DONE', kind: 'run' },
      { code: 'TODAY_PLANNED', kind: 'strength' },
      { code: 'MAKEUP_MISSED', kind: 'run', day: 1 },
      { code: 'WALK_ALSO_TODAY' },
      { code: 'KEY_RUN_TOMORROW', run: 'quality' },
      { code: 'HARD_DAY_YESTERDAY' },
      { code: 'WHO_STRENGTH_GAP', done: 1, target: 2 },
      { code: 'WELCOME_BACK' },
      { code: 'FRESH_START' },
      { code: 'REST_DAY' },
    ];
    expect(new Set(samples.map((s) => s.code))).toEqual(new Set(SCHEDULE_REASON_RANK));
    for (const s of samples) {
      const text = renderScheduleReasonHe(s);
      expect(text.length).toBeGreaterThan(5);
      expect(text).not.toMatch(/[A-Za-z_]{2,}/);
    }
  });
});

describe('bug #10 — the real running level', () => {
  it('profileType 3 → beginner, 1 → advanced, 2/4 → intermediate, unknown → intermediate', () => {
    expect(resolveRunningLevel({ paceProfile: { profileType: 3 } })).toBe('beginner');
    expect(resolveRunningLevel({ paceProfile: { profileType: 1 } })).toBe('advanced');
    expect(resolveRunningLevel({ paceProfile: { profileType: 4 } })).toBe('intermediate');
    expect(resolveRunningLevel({ onboardingData: { currentAbility: { abilityTier: 'none' } } })).toBe('beginner');
    expect(resolveRunningLevel(undefined)).toBe('intermediate');
  });

  it('reaches validateContext (RUN-04 cap)', () => {
    const p = runner();
    p.running!.paceProfile = { profileType: 3 };
    expect(buildWeaverInput(p, 'running', 70, 3, ASOF)!.running.validateContext.level).toBe('beginner');
  });
});
