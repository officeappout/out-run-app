/**
 * i18n wave 2 batch ab (namespace `profile`, prefix `publicProfile.*`): the public profile page
 * (src/app/profile/[userId]/page.tsx). Every key equals the old literal, copied verbatim from the source
 * before the extraction (the header's report aria-label and title share one key: same element, same text).
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/profile.json';
import { profile } from '@/messages/ns/profile';
import { makeT } from '../t';

const t = makeT('he', profile);

describe('profile publicProfile.*', () => {
  it('has the keys this batch added', () => {
    expect(Object.keys(he).filter((k) => k.startsWith('publicProfile.'))).toHaveLength(15);
  });

  it('equals the old literals', () => {
    const cases: Array<[keyof typeof he, string]> = [
      ['publicProfile.notFound.title', 'משתמש לא נמצא'],
      ['publicProfile.notFound.back', 'חזרה'],
      ['publicProfile.header.back', 'חזרה'],
      ['publicProfile.header.self', 'הפרופיל שלי'],
      ['publicProfile.header.report', 'דווח על המשתמש'],
      ['publicProfile.stats.streak', 'ימי רצף'],
      ['publicProfile.stats.partners', 'שותפים'],
      ['publicProfile.stats.workouts', 'אימונים'],
      ['publicProfile.bio.selfEmpty', 'עדיין אין תיאור אישי'],
      ['publicProfile.bio.otherEmpty', 'המשתמש לא הוסיף תיאור אישי'],
      ['publicProfile.actions.unfollow', 'מפסיק לעקוב'],
      ['publicProfile.actions.follow', 'עקוב'],
      ['publicProfile.actions.message', 'שלח הודעה'],
      ['publicProfile.actions.adultsOnly', 'הודעות לבני 18+ בלבד'],
      ['publicProfile.activity.title', 'פעילות אחרונה'],
    ];
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });
});
