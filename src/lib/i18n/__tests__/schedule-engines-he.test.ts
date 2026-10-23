/**
 * i18n wave 2B — namespace `schedule`, keys `engine.*` (reasonsV2.ts, diff.ts, scheduleRules.ts).
 * Each key renders the OLD literal / template verbatim (re-declared here), including counts >= 1000
 * (passed as String() so ICU adds no thousands separator) and every select branch.
 */
import { describe, expect, it } from 'vitest';
import { schedule } from '@/messages/ns/schedule';
import { makeT } from '../t';

const t = makeT('he', schedule);

describe('schedule engines — catalog parity with the old template literals', () => {
  it('plural / values / selects', () => {
    for (const days of [0, 1, 2, 7]) {
      const old = `בימים הפנויים נכנסים רק ${days === 1 ? 'יום כוח אחד' : `${days} ימי כוח`}. המומלץ הוא ${3} — אם אפשר, הוסיפו יום.`;
      expect(t('engine.reason.STRENGTH_FLOOR_UNMET_AVAILABILITY', { days, floor: String(3) })).toBe(old);
    }
    for (const n of [0, 1, 6, 1000, 123456]) {
      expect(t('engine.reason.LONG_TRAINING_STREAK', { days: String(n) })).toBe(`${n} ימי אימון ברצף. אפשר, אבל שימו לב להתאוששות.`);
      expect(t('engine.rules.ERR_03', { count: String(n) })).toBe(`${n} סקילים קשים — האימון מתפזר וההתקדמות בכולם תואט.`);
      expect(t('engine.rules.ERR_DAYS_MIN', { days: String(n), count: String(n + 1), required: String(n + 2) })).toBe(
        `${n} ימים ל-${n + 1} סקילים קשים — מומלץ ${n + 2} לפחות.`,
      );
      expect(t('engine.reason.DAYS_BELOW_SKILL_MIN', { skills: String(n), required: String(n), available: String(n) })).toBe(
        `ל-${n} מיומנויות מומלצים ${n} ימי אימון, ויש ${n}.`,
      );
    }
    const slot = 'אימון איכות';
    expect(t('engine.reason.GROUP_RUN_FILLS_SLOT', { hasTime: 'yes', time: '19:00', slot })).toBe(`ריצת הקבוצה ב-19:00 היא ה${slot} של השבוע.`);
    expect(t('engine.reason.GROUP_RUN_FILLS_SLOT', { hasTime: 'no', time: '', slot })).toBe(`ריצת הקבוצה היא ה${slot} של השבוע.`);
    expect(t('engine.reason.STEPS_DAILY', { goal: (12345).toLocaleString('en-US') })).toBe('יעד צעדים יומי: 12,345.');
    for (const run of ['long', 'quality'] as const) expect(t('engine.keyRun', { run })).toBe(run === 'long' ? 'הריצה הארוכה' : 'אימון האיכות');
    expect(t('engine.diff.moved', { name: 'רגליים', from: 'מחמישי', to: 'לשני', because: 'x' })).toBe('הוזז: רגליים מחמישי לשני · כי x');
  });

  it('drawer.* (ScheduleBuilderDrawer)', () => {
    const CATEGORY_LABEL_HE: Record<string, string> = {
      quality_primary: 'איכות', tempo: 'איכות', short_intervals: 'איכות', long_intervals: 'איכות', hill_sprints: 'איכות',
      hill_short: 'איכות', hill_long: 'ריצת גבעות', fartlek_structured: 'איכות', long_run: 'ריצה ארוכה', easy_run: 'ריצה קלה',
      fartlek_easy: 'ריצה קלה', strides: 'סטרייידס',
    };
    for (const c of [...Object.keys(CATEGORY_LABEL_HE), 'unknown', '']) {
      expect(t('drawer.runCategory', { category: c })).toBe(CATEGORY_LABEL_HE[c] ?? 'אימון ריצה');
    }
    for (const order of ['running-first', 'strength-first']) {
      expect(t('drawer.sharedDay', { day: 'ג', order: order === 'running-first' ? 'running' : 'strength' })).toBe(
        `ג — יום כפול: ${order === 'running-first' ? 'ריצה קודם' : 'כוח קודם'}`,
      );
    }
    expect(t('drawer.runningNote.thisWeekScope')).toBe('הריצות זזות רק ב"מכאן והלאה" — השבוע נשארו במקומן.');
    expect(t('drawer.noData')).toBe('אין עדיין מספיק נתונים כדי להציע לוז — פתח תוכנית כוח או ריצה קודם.');
  });
});
