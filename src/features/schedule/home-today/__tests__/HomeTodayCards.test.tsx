/** Home today cards (board HomeToday): static markup, Hebrew board copy, logical classes, no long dash. */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: {}, loading: false }) }));

import HomeTodayCards from '../components/HomeTodayCards';
import { resolveHomeToday, type HomeTodayInput } from '../model/homeToday';

const PHYSICAL = /\b(ml|mr|pl|pr)-\d|\b(left|right)-\d|\btext-(left|right)\b|dir="rtl"/;
const html = (input: HomeTodayInput, train = true) =>
  renderToStaticMarkup(<HomeTodayCards model={resolveHomeToday(input)} onTrainNow={train ? () => {} : undefined} />).replaceAll('<!-- -->', '');
const base: HomeTodayInput = {
  todayDow: 0, dayOfMonth: 25, scheduleDays: ['א', 'ג', 'ה'], recurringTemplate: { 'א': ['FULL_BODY'] },
  trainingTime: '07:00', strengthDone: true, strengthMinutes: 32, steps: 5200, stepsGoal: 8000,
};

describe('HomeTodayCards', () => {
  it('a done strength day: board text, check, no train button', () => {
    const out = html(base);
    expect(out).toContain('היום שלך');
    expect(out).toContain('א׳ · 25');
    expect(out).toContain('1 מתוך 2');
    expect(out).toContain('כל הגוף · דחיפה');
    expect(out).toContain('בוצע · 32 דק׳');
    expect(out).toContain('8,000 צעדים');
    expect(out).toContain('5,200 עד עכשיו');
    expect(out).toContain('סוגרים אימון וצעדים: להבה גדולה.');
    expect(out).not.toContain('להתאמן עכשיו');
    expect(out).toContain('data-coach="home-today-cards"');
    expect(out).toContain('data-coach="home-today-steps"');
    expect(out).not.toMatch(PHYSICAL);
    expect(out).not.toContain('—');
  });

  it('a strength day not done yet: "להתאמן עכשיו" with its coach target and the time ltr', () => {
    const out = html({ ...base, strengthDone: false, strengthMinutes: 0 });
    expect(out).toContain('להתאמן עכשיו');
    expect(out).toContain('data-coach="home-today-train"');
    expect(out).toMatch(/dir="ltr"[^>]*>07:00/);
    expect(out).toContain('0 מתוך 2');
  });

  it('a day without a workout: steps + core tabata, out of 1', () => {
    const out = html({ ...base, todayDow: 1 });
    expect(out).toContain('בטן טבטה 8′');
    expect(out).toContain('רשות · להבה גדולה יותר');
    expect(out).toContain('0 מתוך 1');
    expect(out).not.toContain('להתאמן עכשיו');
    expect(out).not.toMatch(PHYSICAL);
  });
});
