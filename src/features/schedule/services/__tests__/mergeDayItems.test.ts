import { describe, it, expect } from 'vitest';
import { mergeDayItems } from '../mergeDayItems';

// Pins the gap-map finding #9 fix. Before this, both the strength and running
// write sites in onboarding-sync.service.ts replaced a day-letter's whole
// array whenever they touched it — a returning user who trains strength on
// day X and then completes running onboarding picking day X too silently lost
// their strength entry for that day. mergeDayItems is the pure function that
// makes both directions correct: strip only the caller's own ids from the
// existing array, then append the caller's new ids, leaving every id owned by
// the other domain exactly where it was.

describe('mergeDayItems', () => {
  it('the central test: a day with a strength id AND a running id — a strength-only change leaves the running id byte-identical', () => {
    const result = mergeDayItems(
      ['some_running_template_id_xyz', 'FULL_BODY'],
      ['PLANCHE'],
      'strength',
    );
    expect(result).toEqual(['some_running_template_id_xyz', 'PLANCHE']);
  });

  it('running-only change on a day that also has strength: strength id survives', () => {
    const result = mergeDayItems(
      ['FULL_BODY', 'some_running_template_id_xyz'],
      ['a_different_running_template_id'],
      'running',
    );
    expect(result).toEqual(['FULL_BODY', 'a_different_running_template_id']);
  });

  it('running-only day: adding strength does not delete it', () => {
    const result = mergeDayItems(
      ['some_running_template_id_xyz'],
      ['FULL_BODY'],
      'strength',
    );
    expect(result).toEqual(['some_running_template_id_xyz', 'FULL_BODY']);
  });

  it('strength-only day: adding running does not delete it', () => {
    const result = mergeDayItems(
      ['FULL_BODY', 'PLANCHE'],
      ['some_running_template_id_xyz'],
      'running',
    );
    expect(result).toEqual(['FULL_BODY', 'PLANCHE', 'some_running_template_id_xyz']);
  });

  it('a day not touched by this call (nextIds empty) loses only its own-owner ids, keeps everything else — e.g. strength removing itself from a shared day leaves running intact', () => {
    const result = mergeDayItems(
      ['FULL_BODY', 'some_running_template_id_xyz'],
      [],
      'strength',
    );
    expect(result).toEqual(['some_running_template_id_xyz']);
  });

  it('HANDSTAND is treated as strength-owned (a deliberate template entry, ScheduleStep.tsx:558-562), not filtered out and not left behind on a strength change', () => {
    const removed = mergeDayItems(
      ['HANDSTAND', 'some_running_template_id_xyz'],
      ['FULL_BODY'],
      'strength',
    );
    expect(removed).toEqual(['some_running_template_id_xyz', 'FULL_BODY']);

    const kept = mergeDayItems(
      ['HANDSTAND'],
      ['some_running_template_id_xyz'],
      'running',
    );
    expect(kept).toEqual(['HANDSTAND', 'some_running_template_id_xyz']);
  });

  it('empty existing array: just returns the new ids for either owner', () => {
    expect(mergeDayItems([], ['FULL_BODY'], 'strength')).toEqual(['FULL_BODY']);
    expect(mergeDayItems([], ['some_running_template_id_xyz'], 'running')).toEqual(['some_running_template_id_xyz']);
  });

  it('all 9 strength ids are recognized and stripped on a strength change, in one pass', () => {
    const allStrengthIds = [
      'PLANCHE', 'HSPU', 'FRONT_LEVER', 'OAPU', 'MUSCLE_UP', 'HANDSTAND',
      'FULL_BODY', 'UPPER_BODY', 'UPPER_CALISTHENICS',
    ];
    const result = mergeDayItems(
      [...allStrengthIds, 'some_running_template_id_xyz'],
      ['PLANCHE'],
      'strength',
    );
    expect(result).toEqual(['some_running_template_id_xyz', 'PLANCHE']);
  });
});
