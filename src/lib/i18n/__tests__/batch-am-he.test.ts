/**
 * i18n wave 2 batch am: every new key equals the old literal / template, copied verbatim —
 * pages globalError.*, social chatPage.*, profile activityLog.*, onboarding healthPage.*, legal help.*.
 * Includes what a render can't reach (the chat page's first "opening" line) and the activity log's
 * month heading for all 12 months (old HEBREW_MONTH_NAMES array vs monthLabel + the new key).
 */
import { describe, expect, it } from 'vitest';
import { makeT } from '../t';
import { monthLabel } from '../fmt-display';
import { pages } from '@/messages/ns/pages';
import { social } from '@/messages/ns/social';
import { profile } from '@/messages/ns/profile';
import { onboarding } from '@/messages/ns/onboarding';
import { legal } from '@/messages/ns/legal';
import { common } from '@/messages/ns/common';
import { unitLabel } from '../units';

describe('batch am keys', () => {
  it('pages / social / onboarding plain strings', () => {
    const tp = makeT('he', pages);
    expect(tp('globalError.title')).toBe('משהו השתבש');
    expect(tp('globalError.chunkBody')).toBe('גרסה חדשה של האפליקציה זמינה. רענן את הדף כדי להמשיך.');
    expect(tp('globalError.reload')).toBe('רענן עמוד');
    expect(tp('globalError.retry')).toBe('נסו שוב');
    const ts = makeT('he', social);
    expect(ts('chatPage.opening')).toBe('פותח את הצ׳אט שלך…');
    expect(ts('chatPage.redirecting')).toBe('מעביר אותך לשיחה…');
    expect(ts('chatPage.notFound')).toBe('השיחה לא נמצאה');
    expect(ts('chatPage.error')).toBe('תקלה זמנית בטעינת השיחה');
    expect(ts('chatPage.home')).toBe('חזרה לדף הבית');
    const to = makeT('he', onboarding);
    expect(to('healthPage.loading')).toBe('טוען...');
    expect(to('healthPage.skipFailed')).toBe('לא הצלחנו לשמור את ההמשך. בדקו את החיבור ונסו שוב.');
    expect(to('healthPage.title')).toBe('הצהרת בריאות');
    expect(to('healthPage.description')).toBe('כדי להתאים לך אימון בטוח, נשמח לדעת על מצבך הרפואי');
  });

  it('activity log (profile activityLog.*)', () => {
    const t = makeT('he', profile);
    const cases: Array<[Parameters<typeof t>[0], string]> = [
      ['activityLog.loading', 'טוען...'],
      ['activityLog.noProfile', 'לא נמצא פרופיל'],
      ['activityLog.title', 'יומן פעילות'],
      ['activityLog.add', 'הוסף אימון'],
      ['activityLog.segment.all', 'הכל'],
      ['activityLog.segment.strength', 'כוח'],
      ['activityLog.segment.running', 'ריצה'],
      ['activityLog.empty', 'אין אימונים בקטגוריה זו'],
    ];
    for (const [key, old] of cases) expect(t(key)).toBe(old);
    expect(t('activityLog.days', { n: String(1234) })).toBe(`${1234} ימים`);
    const HEBREW_MONTH_NAMES = [
      'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
      'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
    ];
    for (let m = 0; m < 12; m++) {
      for (const year of [2026, 2027]) {
        expect(t('activityLog.month', { month: monthLabel(m, 'he'), year: String(year) })).toBe(`${HEBREW_MONTH_NAMES[m]} ${year}`);
      }
    }
  });

  it('help hub + tour previews (legal help.*)', () => {
    const t = makeT('he', legal);
    const cases: Array<[Parameters<typeof t>[0], string]> = [
      ['help.hub.back', 'חזור'],
      ['help.hub.title', 'איך משתמשים ושאלות נפוצות'],
      ['help.hub.searchPlaceholder', 'חיפוש: לו״ז, צעדים, פארק...'],
      ['help.hub.searchLabel', 'חיפוש בשאלות'],
      ['help.hub.chaptersTitle', 'סיור באפליקציה'],
      ['help.hub.toursTitle', 'סיורים באפליקציה'],
      ['help.hub.results', 'תוצאות'],
      ['help.hub.faq', 'שאלות נפוצות'],
      ['help.hub.noAnswer', 'לא מצאנו תשובה. אפשר לשאול את קלי.'],
      ['help.hub.askKelly', 'לשאול את קלי'],
      ['help.chapter.showTour', 'תראה לי'],
      ['help.chapter.open', 'פתח'],
      ['help.preview.player.progress', 'תרגיל 2 מתוך 5'],
      ['help.preview.player.exercise', 'שכיבות סמיכה'],
      ['help.preview.player.reps', '12 חזרות'],
      ['help.preview.player.done', 'סיימתי'],
      ['help.preview.player.howTo', 'איך מבצעים'],
      ['help.preview.player.cue1', 'כפות הידיים מתחת לכתפיים'],
      ['help.preview.player.cue2', 'הגוף בקו ישר מהראש לעקבים'],
      ['help.preview.player.cue3', 'יורדים לאט ודוחפים חזרה'],
      ['help.preview.route.stop', 'גינת הכושר'],
      ['help.preview.route.title', 'מסלול בפארק · 3.2 ק״מ'],
      ['help.preview.route.meta', 'כ־35 דקות · 2 עצירות כוח'],
      ['help.preview.route.start', 'יוצאים לדרך'],
      ['help.preview.routePlayer.time', 'זמן'],
      ['help.preview.routePlayer.pace', 'קצב'],
      ['help.preview.station.skip', 'דלג על התחנה'],
      ['help.preview.station.progress', 'תחנה 1 מתוך 3'],
      ['help.preview.station.title', 'גינת הכושר בפארק'],
      ['help.preview.station.duration', 'כ־8 דקות'],
      ['help.preview.station.pullUp', 'מתח'],
      ['help.preview.station.plank', 'פלאנק'],
      ['help.preview.station.dips', 'מקבילים'],
      ['help.preview.station.reps', 'חזרות'],
      ['help.preview.station.time', 'זמן'],
      ['help.preview.station.start', 'מתחילים'],
    ];
    for (const [key, old] of cases) expect(t(key)).toBe(old);
    for (const name of ['', 'מסלול עם עצירות כוח']) expect(t('help.preview.label', { name })).toBe(`תצוגה לדוגמה · ${name}`);
    expect(unitLabel('km', makeT('he', common))).toBe('ק״מ');
  });
});
