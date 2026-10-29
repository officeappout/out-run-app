/**
 * Kelly server locale: Hebrew baseline. Snapshots of the system prompt and the session context,
 * recorded from unmodified origin/main BEFORE the locale work; they must pass unchanged after it
 * (flag off or locale he = byte-identical prompts).
 */
import { expect, it } from 'vitest';
import { COACH_SYSTEM_PROMPT, buildSessionContext, greeting, quickReplies, type CoachGender } from '../persona';
import { coachSystemPrompt } from '../round4/prompt';
import { OWNER_SHEET } from './owner-sheet.fixture';

const snap = (name: string) => `./__snapshots__/kelly-prompt/${name}.txt`;
const GENDERS: CoachGender[] = ['male', 'female', 'other'];

it('system prompt', async () => {
  await expect(COACH_SYSTEM_PROMPT).toMatchFileSnapshot(snap('system'));
  await expect(coachSystemPrompt({ round4: true })).toMatchFileSnapshot(snap('system-round4'));
});

it('session context', async () => {
  const out = GENDERS.map((gender) =>
    buildSessionContext({
      firstName: 'דוד',
      gender,
      todayKey: '2026-10-20',
      israelDayOfWeek: 2,
      israelHour: 9,
      summary: 'סיכום',
      sheet: OWNER_SHEET,
      scheduleAdvisor: true,
      phase2: true,
      requestFidelity: true,
      workoutFormat: true,
      round4Note: 'R4',
      memory: 'MEM',
      typoHints: [{ word: 'השתפרתי', suggestion: 'השתפרת' }],
    }),
  ).join('\n=====\n');
  await expect(out + '\n').toMatchFileSnapshot(snap('session-context'));
  await expect(buildSessionContext({ firstName: '', gender: 'other', todayKey: '2026-10-20', israelDayOfWeek: 0, israelHour: 7, sheet: null }) + '\n').toMatchFileSnapshot(snap('session-context-nosheet'));
});

it('greeting and quick replies', async () => {
  const out = GENDERS.map((g) => JSON.stringify({ g, hi: greeting(g, 'דוד'), hi0: greeting(g, ''), q: quickReplies(g) })).join('\n');
  await expect(out + '\n').toMatchFileSnapshot(snap('greeting'));
});
