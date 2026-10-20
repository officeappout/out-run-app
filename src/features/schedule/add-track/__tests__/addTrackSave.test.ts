import { describe, expect, it } from 'vitest';
import { planAddTrackSave, type AddTrackSaveInput } from '../addTrackSave';
import { isStrengthTemplateId } from '../../engine/strengthVocabulary';
import type { AddTrackDayView, AddTrackSessionView } from '../addTrackWeek';

const isStrengthId = (id: string) => isStrengthTemplateId(id);
const S = (slug: string, status: AddTrackSessionView['status'], fromDow?: number): AddTrackSessionView => ({ kind: 'strength', slug, nameHe: slug, status, fromDow, noteHe: null });
const R = (slot: AddTrackSessionView['slot'], status: AddTrackSessionView['status'], fromDow?: number): AddTrackSessionView => ({ kind: 'run', slot, nameHe: String(slot), status, fromDow, noteHe: null });
const week = (byDow: Partial<Record<number, AddTrackSessionView[]>>): AddTrackDayView[] =>
  [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, sessions: byDow[dow] ?? [] }));

const times = { run: '07:00', strength: '19:00' };

describe('add track save · J3 (strength user adds running)', () => {
  const base: AddTrackSaveInput = {
    added: 'running',
    // Sun push, Tue pull, Thu legs — legs moves to Wed; runs Mon / Thu / Fri.
    days: week({
      0: [S('push', 'kept')],
      1: [R('quality_primary', 'new')],
      2: [S('pull', 'kept')],
      3: [S('legs', 'moved', 4)],
      4: [R('easy_run', 'new')],
      5: [R('long_run', 'new')],
    }),
    template: { א: ['UPPER_BODY'], ג: ['pull'], ה: ['LOWER_BODY', 'stray-run-id'] },
    existingStrengthIds: { 0: ['UPPER_BODY'], 2: ['pull'], 4: ['LOWER_BODY'] },
    newStrengthIds: [],
    storedRunLetters: [],
    isStrengthId,
    times,
  };

  it('a moved strength day carries the user’s own ids; nothing else of the day is lost', () => {
    const plan = planAddTrackSave(base);
    expect(plan.recurringTemplate).toEqual({ א: ['UPPER_BODY'], ג: ['pull'], ד: ['LOWER_BODY'], ה: ['stray-run-id'] });
  });

  it('scheduleDays = strength ∪ run letters; runs are always "changed" for a new track', () => {
    const plan = planAddTrackSave(base);
    expect(plan.lifestyleScheduleDays).toEqual(['א', 'ב', 'ג', 'ד', 'ה', 'ו']);
    expect(plan.runDays).toEqual([1, 4, 5]);
    expect(plan.runLetters).toEqual(['ב', 'ה', 'ו']);
    expect(plan.runsChanged).toBe(true);
    expect(plan.strengthDays).toEqual([0, 2, 3]);
  });

  it('one reminder session per workout at the known times', () => {
    const plan = planAddTrackSave(base);
    expect(plan.sessions).toHaveLength(6);
    expect(plan.sessions.find((s) => s.dow === 3)).toEqual({ dow: 3, kind: 'strength', time: '19:00' });
    expect(plan.sessions.find((s) => s.dow === 1)).toEqual({ dow: 1, kind: 'run', time: '07:00' });
  });

  it('never clobbers: a week without any strength day writes no template and no scheduleDays', () => {
    const plan = planAddTrackSave({ ...base, days: week({ 1: [R('easy_run', 'new')] }) });
    expect(plan.recurringTemplate).toBeNull();
    expect(plan.lifestyleScheduleDays).toBeNull();
    expect(plan.runDays).toEqual([1]);
  });
});

describe('add track save · J4 (runner adds strength)', () => {
  const base: AddTrackSaveInput = {
    added: 'strength',
    days: week({
      0: [R('quality_primary', 'kept')],
      1: [S('full_body', 'new')],
      2: [R('easy_run', 'kept')],
      3: [S('full_body', 'new')],
      5: [R('long_run', 'kept')],
    }),
    template: { א: ['run-tpl-1'], ג: ['run-tpl-1'], ו: ['run-tpl-1'] },
    existingStrengthIds: {},
    newStrengthIds: ['FULL_BODY'],
    storedRunLetters: ['א', 'ג', 'ו'],
    isStrengthId,
    times,
  };

  it('new strength days get the new program id; running ids stay where they were', () => {
    const plan = planAddTrackSave(base);
    expect(plan.recurringTemplate).toEqual({ א: ['run-tpl-1'], ב: ['FULL_BODY'], ג: ['run-tpl-1'], ד: ['FULL_BODY'], ו: ['run-tpl-1'] });
    expect(plan.runsChanged).toBe(false);
    expect(plan.lifestyleScheduleDays).toEqual(['א', 'ב', 'ג', 'ד', 'ו']);
  });

  it('when a run moved, its running ids move with it (and only then)', () => {
    const plan = planAddTrackSave({
      ...base,
      days: week({
        0: [R('quality_primary', 'kept')],
        1: [S('full_body', 'new')],
        3: [R('easy_run', 'moved', 2)],
        4: [S('full_body', 'new')],
        5: [R('long_run', 'kept')],
      }),
    });
    expect(plan.runsChanged).toBe(true);
    expect(plan.runLetters).toEqual(['א', 'ד', 'ו']);
    expect(plan.recurringTemplate).toEqual({ א: ['run-tpl-1'], ב: ['FULL_BODY'], ד: ['run-tpl-1'], ה: ['FULL_BODY'], ו: ['run-tpl-1'] });
  });
});
