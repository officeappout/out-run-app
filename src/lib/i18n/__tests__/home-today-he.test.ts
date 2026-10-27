/** Namespaces `schedule` (homeToday.*) and `onboarding` (tour.home.today/rest/next.*): Hebrew keys of the home today cards + tour. */
import { describe, expect, it } from 'vitest';
import { schedule } from '@/messages/ns/schedule';
import { onboarding } from '@/messages/ns/onboarding';
import { makeT } from '../t';

const t = makeT('he', schedule);
const to = makeT('he', onboarding);

describe('home today copy', () => {
  it('board text, verbatim', () => {
    expect(t('homeToday.title')).toBe('היום שלך');
    expect(t('homeToday.date', { day: 'א׳', date: '25' })).toBe('א׳ · 25');
    expect(t('homeToday.flames', { closed: '1', total: '2' })).toBe('1 מתוך 2');
    expect(t('homeToday.optionalRole')).toBe('רשות · להבה גדולה יותר');
    expect(t('homeToday.hint', { kind: 'workout' })).toBe('סוגרים אימון וצעדים: להבה גדולה.');
    expect(t('homeToday.done', { min: '32 דק׳' })).toBe('בוצע · 32 דק׳');
  });

  it('tour copy', () => {
    expect(to('tour.home.today.title')).toBe('הכרטיס הראשון שלך להיום');
    expect(to('tour.home.rest.text', { n: 8 })).toBe('היום אין אימון כוח, אבל אפשר לסגור צעדים או 8 דק׳ בטן ולהדליק להבה');
    expect(to('tour.home.next.text', { day: 'שלישי', time: '18:00' })).toBe('האימון הבא שלך: יום שלישי ב-18:00');
    expect(to('tour.home.next.text', { day: 'שלישי', time: 'none' })).toBe('האימון הבא שלך: יום שלישי');
  });
});
