/**
 * i18n wave 2 batch ag (namespace `profile`): dashboard.* / favorites.* / editProfile.* / personalInfo.* /
 * records.* / parentProgram.* — byte-identical to the literals they replaced (copied verbatim from the
 * components / hook as they were), including what a static render cannot reach (the save toasts).
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/profile.json';
import { profile } from '@/messages/ns/profile';
import { makeT } from '../t';

const t = makeT('he', profile);

describe('profile (he) — batch ag screens byte-identical to the pre-extraction literals', () => {
  it('plain strings', () => {
    const cases: Array<[keyof typeof he, string]> = [
      ['dashboard.tab.workouts', 'אימונים'],
      ['dashboard.tab.skills', 'סקילים'],
      ['dashboard.tab.badges', 'הישגים'],
      ['dashboard.tab.programs', 'תוכניות'],
      ['dashboard.tablist.aria', 'תצוגת פרופיל'],
      ['dashboard.settings.aria', 'הגדרות'],
      ['dashboard.saved.aria', 'אימונים שמורים'],
      ['dashboard.stat.workouts', 'אימונים'],
      ['dashboard.stat.partners', 'שותפים'],
      ['dashboard.stat.streak', 'ימי רצף'],
      ['dashboard.bio.placeholder', 'עדיין אין תיאור אישי'],
      ['dashboard.edit', 'עריכת פרופיל'],
      ['dashboard.xp.max', 'הגעת לשיא!'],
      ['dashboard.workouts.title', 'האימונים שלי'],
      ['dashboard.workouts.all', 'הכל'],
      ['dashboard.badges.title', 'הישגים'],
      ['dashboard.badges.all', 'כל ההישגים'],
      ['favorites.title', 'שמורים'],
      ['favorites.close', 'סגור'],
      ['editProfile.title', 'עריכת פרופיל'],
      ['editProfile.close', 'סגירה'],
      ['editProfile.defaultName', 'משתמש'],
      ['editProfile.name.label', 'שם'],
      ['editProfile.name.placeholder', 'שמך'],
      ['editProfile.bio.label', 'תיאור אישי'],
      ['editProfile.bio.placeholder', 'ספר/י קצת על עצמך...'],
      ['editProfile.tags.title', 'תגיות אימון'],
      ['editProfile.tags.hint', 'אלה התגיות שיופיעו עליך בכרטיס השותף'],
      ['editProfile.settingsNote', 'פרטים אישיים (עיר, משקל, תאריך לידה) נערכים בהגדרות'],
      ['editProfile.save', 'שמור שינויים'],
      ['editProfile.saveShort', 'שמירה'],
      ['personalInfo.saved', 'הפרטים עודכנו בהצלחה'],
      ['personalInfo.saveFailed', 'שגיאה בשמירת הפרטים'],
      ['records.title', 'השיאים שלך'],
      ['records.banner', 'שברת שיא השבוע'],
      ['records.empty', 'השיאים שלך יתחילו להופיע מהאימון הבא.'],
      ['records.new', 'שיא חדש'],
      ['parentProgram.explainer', 'לתוכנית אב אין מפת התקדמות משלה. ההתקדמות נמדדת בכל תוכנית בת, והרמה כאן היא הממוצע שלהן.'],
      ['parentProgram.children.title', 'תוכניות בנות'],
      ['parentProgram.unassessed.title', 'עוד לא בדקת רמה'],
      ['parentProgram.unassessed.note', 'האימונים לא יכללו את התוכנית עד שתבדקו רמה'],
      ['parentProgram.unassessed.cta', 'בדקו רמה'],
      ['parentProgram.close', 'סגירה'],
    ];
    for (const [key, old] of cases) expect(t(key), key).toBe(old);
  });

  it('next-level strip', () => {
    for (const globalLevel of [0, 1, 9, 10]) {
      expect(t('dashboard.xp.nextLevel', { level: String(globalLevel + 1) })).toBe(`שלב ${globalLevel + 1} →`);
    }
  });

  it('parent program level line — every max / excluded combination', () => {
    const old = (r: { level: number; maxLevel: number | null; excludedFromAverage: boolean }) =>
      `רמה ${r.level}${r.maxLevel ? `/${r.maxLevel}` : ''}${r.excludedFromAverage ? ' · לא נכלל בממוצע' : ''}`;
    for (const level of [1, 4, 15]) {
      for (const maxLevel of [null, 10, 25]) {
        for (const excludedFromAverage of [false, true]) {
          const r = { level, maxLevel, excludedFromAverage };
          expect(
            t('parentProgram.children.level', {
              level: String(r.level),
              max: r.maxLevel ? String(r.maxLevel) : 'none',
              excluded: r.excludedFromAverage ? 'yes' : 'no',
            }),
          ).toBe(old(r));
        }
      }
    }
  });

  it('parent program sub line — average / none', () => {
    const old = (avg: number | null) => (avg != null ? `רמה ${avg} (ממוצע)` : 'עוד אין רמה');
    for (const avg of [null, 1, 3, 15]) {
      expect(t('parentProgram.sub', { avg: avg != null ? String(avg) : 'none' })).toBe(old(avg));
    }
  });
});
