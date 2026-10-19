import { describe, it, expect } from 'vitest';
import {
  buildLifestyleWizardFinalWrite,
  type LifestyleWizardFinalWriteInput,
} from '../lifestyle-wizard-final-write';

const base: LifestyleWizardFinalWriteInput = {
  strengthScheduleEdited: false,
  editedScheduleDays: undefined,
  historyFrequency: undefined,
  calendarSyncEnabled: undefined,
  sessionLifestyleTags: ['office_worker', 'wfh'],
  goalsSkipped: false,
  existingLifestyleTags: undefined,
  existingRunningScheduleDays: undefined,
};

describe('buildLifestyleWizardFinalWrite — scheduleDays guard', () => {
  it('runner (running step only): never writes scheduleDays, even with stale store days', () => {
    const out = buildLifestyleWizardFinalWrite({
      ...base,
      editedScheduleDays: ['א', 'ג', 'ה'], // stale signup default in the store
    });
    expect(out.lifestyle).not.toHaveProperty('scheduleDays');
  });

  it('later session (empty store) without editing: no scheduleDays key → stored days untouched', () => {
    const out = buildLifestyleWizardFinalWrite({ ...base, editedScheduleDays: [] });
    expect('scheduleDays' in out.lifestyle).toBe(false);
  });

  it('strength schedule edited in this session: writes the chosen days', () => {
    const out = buildLifestyleWizardFinalWrite({
      ...base,
      strengthScheduleEdited: true,
      editedScheduleDays: ['ה', 'א'],
    });
    expect(out.lifestyle.scheduleDays).toEqual(['א', 'ה']);
  });

  it('merges, never clobbers, the running days', () => {
    const out = buildLifestyleWizardFinalWrite({
      ...base,
      strengthScheduleEdited: true,
      editedScheduleDays: ['ב', 'ד'],
      existingRunningScheduleDays: ['א', 'ד', 'ו'],
    });
    expect(out.lifestyle.scheduleDays).toEqual(['א', 'ב', 'ד', 'ו']);
  });

  it('an edited-but-empty value never erases stored days', () => {
    const out = buildLifestyleWizardFinalWrite({ ...base, strengthScheduleEdited: true, editedScheduleDays: [] });
    expect('scheduleDays' in out.lifestyle).toBe(false);
  });
});

describe('buildLifestyleWizardFinalWrite — no silent writes', () => {
  it('runner: no trainingHistory, no settings.calendarSync', () => {
    const out = buildLifestyleWizardFinalWrite({ ...base, calendarSyncEnabled: true, historyFrequency: '3+' });
    expect(out.lifestyle).not.toHaveProperty('trainingHistory');
    expect(out).not.toHaveProperty('settings');
  });

  it('strength user who answered: writes the real history + calendar answers (off included)', () => {
    const out = buildLifestyleWizardFinalWrite({
      ...base,
      strengthScheduleEdited: true,
      editedScheduleDays: ['א'],
      historyFrequency: 'none',
      calendarSyncEnabled: false,
    });
    expect(out.lifestyle.trainingHistory).toBe('none');
    expect(out.settings).toEqual({ calendarSync: false });
  });

  it('strength user with no history answer / no toggle value: neither is written', () => {
    const out = buildLifestyleWizardFinalWrite({
      ...base,
      strengthScheduleEdited: true,
      editedScheduleDays: ['א'],
      historyFrequency: '',
    });
    expect(out.lifestyle).not.toHaveProperty('trainingHistory');
    expect(out).not.toHaveProperty('settings');
  });

  it('ignores an unknown history value', () => {
    const out = buildLifestyleWizardFinalWrite({
      ...base,
      strengthScheduleEdited: true,
      editedScheduleDays: ['א'],
      historyFrequency: 'often',
    });
    expect(out.lifestyle).not.toHaveProperty('trainingHistory');
  });
});

describe('buildLifestyleWizardFinalWrite — lifestyleTags', () => {
  it('writes the session tags', () => {
    const out = buildLifestyleWizardFinalWrite({ ...base, sessionLifestyleTags: ['parent', 'goal_routine'] });
    expect(out.lifestyle.lifestyleTags).toEqual(['parent', 'goal_routine']);
  });

  it('goals skipped: keeps existing goal_* tags instead of wiping them', () => {
    const out = buildLifestyleWizardFinalWrite({
      ...base,
      goalsSkipped: true,
      sessionLifestyleTags: ['parent', 'busy'],
      existingLifestyleTags: ['student', 'goal_fitness', 'goal_skills'],
    });
    expect(out.lifestyle.lifestyleTags).toEqual(['parent', 'busy', 'goal_fitness', 'goal_skills']);
  });

  it('goals asked: existing goal tags are replaced by the new answer', () => {
    const out = buildLifestyleWizardFinalWrite({
      ...base,
      sessionLifestyleTags: ['parent', 'goal_routine'],
      existingLifestyleTags: ['goal_fitness'],
    });
    expect(out.lifestyle.lifestyleTags).toEqual(['parent', 'goal_routine']);
  });

  it('missing session tags → empty array (no crash)', () => {
    const out = buildLifestyleWizardFinalWrite({ ...base, sessionLifestyleTags: undefined });
    expect(out.lifestyle.lifestyleTags).toEqual([]);
  });
});
