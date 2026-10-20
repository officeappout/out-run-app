import { describe, expect, it } from 'vitest';
import {
  dayFocusOf,
  expandPoolDomains,
  focusRotationOf,
  resolveDayFocus,
  strengthDayIndexOf,
  strengthDayLettersOf,
  titleWithFocusHe,
} from '../day-focus.utils';
import { resolveGeneratorDayFocus, stampDayFocus } from '../day-focus.generator';

describe('rotation by split', () => {
  it('upper / lower, push / pull / legs, full body; other splits are not steered', () => {
    expect(focusRotationOf('upper_lower')).toEqual(['upper', 'lower']);
    expect(focusRotationOf('push_pull_legs')).toEqual(['push', 'pull', 'legs']);
    expect(focusRotationOf('full_body_ab')).toEqual(['full']);
    expect(focusRotationOf('full_body_max')).toEqual(['full']);
    expect(focusRotationOf('habit_builder')).toBeNull();
    expect(focusRotationOf('skill_dominance')).toBeNull();
    expect(focusRotationOf(null)).toBeNull();
  });

  it('day index → focus, deterministic', () => {
    expect([0, 1, 2, 3].map((i) => dayFocusOf('upper_lower', i))).toEqual(['upper', 'lower', 'upper', 'lower']);
    expect([0, 1, 2, 3].map((i) => dayFocusOf('push_pull_legs', i))).toEqual(['push', 'pull', 'legs', 'push']);
    expect(dayFocusOf('upper_lower', -1)).toBeNull();
  });
});

describe('strength days', () => {
  it('template days holding a strength id, Sunday first; running-only days are not strength', () => {
    const letters = strengthDayLettersOf({
      scheduleDays: ['ה', 'א', 'ג', 'ב', 'ד'],
      recurringTemplate: { 'ה': ['FULL_BODY'], 'א': ['full_body'], 'ג': ['run-plan-xyz'], 'ב': ['UPPER_BODY'] },
    });
    expect(letters).toEqual(['א', 'ב', 'ה']);
  });

  it('no template → scheduleDays, sorted', () => {
    expect(strengthDayLettersOf({ scheduleDays: ['ה', 'א', 'ג'] })).toEqual(['א', 'ג', 'ה']);
  });

  it('index of a date among the strength days', () => {
    const letters = ['א', 'ב', 'ד', 'ה'];
    expect(strengthDayIndexOf('2026-10-18', letters)).toBe(0); // Sunday
    expect(strengthDayIndexOf('2026-10-19', letters)).toBe(1); // Monday
    expect(strengthDayIndexOf('2026-10-20', letters)).toBe(-1); // Tuesday — not a strength day
    expect(strengthDayIndexOf('2026-10-22', letters)).toBe(3); // Thursday
  });
});

describe('the focus never adds a domain', () => {
  it('narrows a full-body pool', () => {
    expect(resolveDayFocus('upper', ['push', 'pull', 'legs', 'core'])).toEqual({ focus: 'upper', domains: ['push', 'pull'] });
    expect(resolveDayFocus('lower', ['full_body'])).toEqual({ focus: 'lower', domains: ['legs', 'core'] });
  });

  it('only the assessed part of the focus (legs without core)', () => {
    expect(resolveDayFocus('lower', ['push', 'pull', 'legs'])).toEqual({ focus: 'lower', domains: ['legs'] });
  });

  it('a pool with nothing of the focus → no focus (today\'s content)', () => {
    expect(resolveDayFocus('lower', ['push', 'pull'])).toBeNull();
    expect(resolveDayFocus('upper', ['planche'])).toBeNull();
  });

  it('a pool that already is the focus → labelled, nothing to narrow', () => {
    expect(resolveDayFocus('upper', ['upper_body'])).toEqual({ focus: 'upper', domains: null });
  });

  it('full body → balanced (no restriction)', () => {
    expect(resolveDayFocus('full', ['push', 'pull', 'legs', 'core'])).toEqual({ focus: 'full', domains: null });
    expect(resolveDayFocus(null, ['push'])).toBeNull();
  });

  it('expands master programs', () => {
    expect(expandPoolDomains(['upper_body', 'lower_body'])).toEqual(['push', 'pull', 'legs', 'core']);
  });
});

describe('title', () => {
  it('generic title → "אימון עליון"; a real title gets the focus appended once', () => {
    expect(titleWithFocusHe('אימון כוח', 'upper')).toBe('אימון עליון');
    expect(titleWithFocusHe('כוח בפארק', 'lower')).toBe('כוח בפארק · תחתון');
    expect(titleWithFocusHe('אימון עליון', 'upper')).toBe('אימון עליון');
    expect(titleWithFocusHe('אימון כל הגוף', 'lower')).toBe('אימון תחתון');
  });
  it('full body / no focus → unchanged', () => {
    expect(titleWithFocusHe('כוח בפארק', 'full')).toBe('כוח בפארק');
    expect(titleWithFocusHe('כוח בפארק', undefined)).toBe('כוח בפארק');
  });
});

describe('generator glue', () => {
  const profile = {
    core: { mainGoal: 'muscle_gain' },
    progression: { tracks: { push: { level: 8 }, pull: { level: 8 }, legs: { level: 8 } } },
    lifestyle: { scheduleDays: ['א', 'ב', 'ד', 'ה'] },
  };
  const pool = ['push', 'pull', 'legs', 'core'];
  const base = { enabled: true, profile, pool, selectedDate: '2026-10-18' };

  it('flag off / manual / explicit domains / rest day → null', () => {
    expect(resolveGeneratorDayFocus({ ...base, enabled: false })).toBeNull();
    expect(resolveGeneratorDayFocus({ ...base, enabled: undefined })).toBeNull();
    expect(resolveGeneratorDayFocus({ ...base, isManualOverride: true })).toBeNull();
    expect(resolveGeneratorDayFocus({ ...base, hasExplicitDomains: true })).toBeNull();
    expect(resolveGeneratorDayFocus({ ...base, isRestDay: true })).toBeNull();
  });

  it('intermediate × 4 days → upper / lower by day', () => {
    expect(resolveGeneratorDayFocus(base)?.focus).toBe('upper');
    expect(resolveGeneratorDayFocus({ ...base, selectedDate: '2026-10-19' })?.focus).toBe('lower');
    expect(resolveGeneratorDayFocus({ ...base, selectedDate: '2026-10-21' })?.focus).toBe('upper');
    expect(resolveGeneratorDayFocus({ ...base, selectedDate: '2026-10-22' })?.focus).toBe('lower');
  });

  it('not a strength day → null', () => {
    expect(resolveGeneratorDayFocus({ ...base, selectedDate: '2026-10-20' })).toBeNull();
  });

  it('3 days → full body (balanced)', () => {
    const p3 = { ...profile, lifestyle: { scheduleDays: ['א', 'ג', 'ה'] } };
    expect(resolveGeneratorDayFocus({ ...base, profile: p3 })).toEqual({ focus: 'full', domains: null });
  });

  it('health_cap kept: a routine / health intermediate on 4 days stays full body', () => {
    const health = { ...profile, core: { mainGoal: 'healthy_lifestyle' }, selectedGoals: ['health'] };
    expect(resolveGeneratorDayFocus({ ...base, profile: health })?.focus).toBe('full');
  });

  it('hard skills → not steered (skill logic untouched)', () => {
    const skills = { ...profile, progression: { ...profile.progression, skillFocusIds: ['planche'] } };
    expect(resolveGeneratorDayFocus({ ...base, profile: skills })).toBeNull();
  });

  it('stampDayFocus marks every option; no focus → untouched', () => {
    const trio = { options: [{ result: { workout: {} as { dayFocus?: string } } }, { result: { workout: {} } }] };
    expect(stampDayFocus(trio as never, null)).toBe(trio);
    expect(trio.options[0].result.workout.dayFocus).toBeUndefined();
    stampDayFocus(trio as never, 'upper');
    expect(trio.options.map((o) => (o.result.workout as { dayFocus?: string }).dayFocus)).toEqual(['upper', 'upper']);
  });
});
