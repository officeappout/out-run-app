/**
 * recurring-day.core — the template rules shared by the client hydrate and
 * the server training reminder (push-lifecycle audit, gap 4).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  DEFAULT_RECURRING_START_TIME,
  dayLetterOfDateKey,
  existingDayBlocksTemplate,
  recurringDayPlan,
  recurringStartTime,
  templateSessionsToMaterialize,
} from '../recurring-day.core';
import { getHebrewDayLetter } from '../dateUtils';

// 2026-10-21 is a Wednesday ('ד').
const WED = '2026-10-21';

describe('server mirror', () => {
  it('functions/src/shared/recurring-day.core.ts is this file, byte for byte (run the functions build to refresh)', () => {
    const root = path.resolve(__dirname, '../../../../../..');
    const app = readFileSync(path.join(root, 'src/features/user/scheduling/utils/recurring-day.core.ts'), 'utf8');
    const mirror = readFileSync(path.join(root, 'functions/src/shared/recurring-day.core.ts'), 'utf8');
    expect(mirror.slice(mirror.indexOf('\n') + 1)).toBe(app);
  });
});

describe('dayLetterOfDateKey', () => {
  it('agrees with the client getHebrewDayLetter for a whole week', () => {
    for (let d = 18; d <= 24; d++) {
      const key = `2026-10-${d}`;
      expect(dayLetterOfDateKey(key)).toBe(getHebrewDayLetter(new Date(`${key}T00:00:00`)));
    }
    expect(dayLetterOfDateKey(WED)).toBe('ד');
  });
});

describe('recurringStartTime', () => {
  it('strengthTime, then runningTime, then 07:00', () => {
    expect(recurringStartTime({ strengthTime: '18:00', runningTime: '19:00' })).toBe('18:00');
    expect(recurringStartTime({ runningTime: '19:00' })).toBe('19:00');
    expect(recurringStartTime(undefined)).toBe(DEFAULT_RECURRING_START_TIME);
    expect(DEFAULT_RECURRING_START_TIME).toBe('07:00');
  });
});

describe('recurringDayPlan', () => {
  it('none when the weekday is not in the template', () => {
    expect(recurringDayPlan({ א: ['p1'] }, WED)).toEqual({ kind: 'none' });
    expect(recurringDayPlan(null, WED)).toEqual({ kind: 'none' });
  });

  it('rest when the weekday holds an empty list', () => {
    expect(recurringDayPlan({ ד: [] }, WED)).toEqual({ kind: 'rest' });
  });

  it('one session per id, in order, with the start time and the run id as cardio', () => {
    const plan = recurringDayPlan({ ד: ['full_body', 'run_prog'] }, WED, { runningTime: '19:00' }, 'run_prog');
    expect(plan).toEqual({
      kind: 'training',
      sessions: [
        { programId: 'full_body', startTime: '19:00', category: 'strength' },
        { programId: 'run_prog', startTime: '19:00', category: 'cardio' },
      ],
    });
  });
});

describe('templateSessionsToMaterialize', () => {
  const template = { ד: ['full_body'] };

  it('no day doc → the template sessions', () => {
    expect(templateSessionsToMaterialize(template, WED, null)).toHaveLength(1);
    expect(templateSessionsToMaterialize(template, WED, [])).toHaveLength(1);
  });

  it('a user override or manual rest blocks the template', () => {
    expect(existingDayBlocksTemplate([{ type: 'rest', source: 'manual', override: true }])).toBe(true);
    expect(existingDayBlocksTemplate([{ type: 'rest', source: 'manual' }])).toBe(true);
    expect(templateSessionsToMaterialize(template, WED, [{ type: 'rest', source: 'manual' }])).toEqual([]);
  });

  it('a day already hydrated (recurring entries) adds nothing', () => {
    expect(templateSessionsToMaterialize(template, WED, [{ type: 'training', source: 'recurring' }])).toEqual([]);
  });

  it('a community session alone does not block (hydrate adds alongside it)', () => {
    expect(templateSessionsToMaterialize(template, WED, [{ type: 'training', source: 'community' }])).toHaveLength(1);
  });
});
