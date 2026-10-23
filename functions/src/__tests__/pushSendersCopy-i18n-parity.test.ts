/**
 * i18n wave 2A (namespace `push`): snapshots of the static words the push senders add around the library
 * copy, recorded from UNMODIFIED origin/main BEFORE they moved to the catalog. The extraction must keep
 * them byte-identical.
 *   - personaliseNotificationText: fallbacks ('חבר', 'קרוב', '0') and the distance words ('מטר', 'ק"מ')
 *   - categoryLabel: the workout-type words that fill @אימון
 *   - stepGoalCopyContext: the vars of the step-goal push (@מרחק across the meters/km boundary, @דקות...)
 * Pure functions: no clock involved.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin', () => {
  const firestoreFn = () => ({});
  (firestoreFn as any).Timestamp = { fromMillis: (ms: number) => ({ toMillis: () => ms }) };
  (firestoreFn as any).FieldValue = {};
  return { apps: [{}], initializeApp: vi.fn(), firestore: firestoreFn, messaging: () => ({}) };
});
vi.mock('firebase-functions', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_o: unknown, fn: unknown) => fn }));
vi.mock('firebase-functions/v2/firestore', () => ({ onDocumentCreated: (_o: unknown, fn: unknown) => fn }));
vi.mock('geofire-common', () => ({ geohashQueryBounds: () => [['0', '~']], distanceBetween: () => 0 }));

import { personaliseNotificationText } from '../services/notification-content.service';
import { categoryLabel } from '../trainingReminderScheduler';
import { stepGoalCopyContext, type CandidateUser } from '../stepGoalNudgeScheduler';
import { chatBodyOrFallback, chatSenderName } from '../chatMessageNotification';
import { KELLY_PUSH_TITLE } from '../onKellyThreadMessage';

const snap = (name: string) => `./__snapshots__/push-senders-copy-i18n/${name}.json`;
const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';

describe('static words around the push copy', () => {
  it('personaliseNotificationText', async () => {
    const TEMPLATE = '@שם: @רצף ימים, נשארו @צעדים_שנותרו צעדים, @מרחק (@דקות דקות) {extra} {missing}';
    const varSets: Array<Record<string, unknown>> = [
      {},
      { name: '' },
      { name: 'דנה' },
      { name: '{steps_left}', stepsLeft: 1234 },
      { name: 'יואב', streakDays: 0, stepsLeft: 0, distanceMeters: 0, walkMinutes: 0 },
      { name: 'יואב', streakDays: 12, stepsLeft: 2400, distanceMeters: 1, walkMinutes: 20, extra: 'x' },
      { distanceMeters: 999 },
      { distanceMeters: 999.5 },
      { distanceMeters: 1000 },
      { distanceMeters: 1049 },
      { distanceMeters: 1050 },
      { distanceMeters: 1234567 },
      { stepsLeft: 1234567, distanceMeters: 2400 },
    ];
    const out = varSets.map((vars) => ({ vars, text: personaliseNotificationText(TEMPLATE, vars as never) }));
    await expect(json(out)).toMatchFileSnapshot(snap('personalise'));
  });

  it('categoryLabel', async () => {
    const sets: Array<string[] | undefined> = [
      undefined, [], ['x'], ['strength'], ['cardio'], ['maintenance'], ['walking'],
      ['strength', 'cardio'], ['walking', 'strength', 'maintenance', 'cardio'], ['strength', 'strength'], ['nope', 'walking'],
    ];
    const out = sets.map((c) => ({ categories: c ?? null, label: categoryLabel(c) }));
    await expect(json(out)).toMatchFileSnapshot(snap('category-label'));
  });

  it('stepGoalCopyContext vars', async () => {
    const base: CandidateUser = {
      uid: 'u1', name: 'דנה', audience: {} as never, personaProfile: {} as never, progression: {},
      dailyStepGoal: 8000, currentStreak: 0, todaySteps: 0,
    };
    const out: unknown[] = [];
    for (const goal of [0, 300, 8000, 10000, 20000]) {
      for (const today of [0, 1, 400, 3000, 7000, 7999, 8000, 15000]) {
        for (const streak of [0, 1, 2, 30]) {
          const c = stepGoalCopyContext({ ...base, dailyStepGoal: goal, todaySteps: today, currentStreak: streak }, 'mid');
          out.push({ goal, today, streak, vars: c.vars, params: c.params });
        }
      }
    }
    await expect(json(out)).toMatchFileSnapshot(snap('step-goal-vars'));
  });
});

/** Added after the extraction: the handler-only words, compared with the literals as they were (pasted verbatim). */
describe('handler-only words equal the old literals', () => {
  it('chat push: sender-name fallback and empty-body line', () => {
    for (const raw of [undefined, null, '', '   ', 42, {}]) expect(chatSenderName(raw)).toBe('מישהו');
    expect(chatSenderName('  דנה כהן ')).toBe('דנה כהן');
    expect(chatBodyOrFallback('')).toBe('💬 הודעה חדשה');
    expect(chatBodyOrFallback('היי')).toBe('היי');
  });

  it("Kelly's push title", () => {
    expect(KELLY_PUSH_TITLE).toBe('קלי');
  });

  it('the moved literals are gone from the sender sources (guard against re-adding them)', () => {
    const dir = path.resolve(__dirname, '..');
    const banned: Record<string, string[]> = {
      'chatMessageNotification.ts': ["'מישהו'", "'💬 הודעה חדשה'"],
      'onKudosCreated.ts': ["'מישהו'"],
      'onKellyThreadMessage.ts': ["'קלי'"],
      'services/notification-content.service.ts': ["'חבר'", "'קרוב'", 'מטר`', 'ק"מ`'],
      'stepGoalNudgeScheduler.ts': ['מטר`', 'ק"מ`'],
      'trainingReminderScheduler.ts': ["'אימון כוח'", "'ריצה'", "'אימון קל'", "'הליכה'", "'אימון'"],
    };
    for (const [file, list] of Object.entries(banned)) {
      // code only: comment lines may still name the fallback words
      const src = readFileSync(path.join(dir, file), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      for (const lit of list) expect(src.includes(lit), `${file} still has ${lit}`).toBe(false);
    }
  });
});
