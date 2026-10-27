/**
 * i18n wave 2 batch aq: key tests for what the static / jsdom parity snapshots cannot reach — branches behind a tap or a
 * data state, every select id, counts >= 1000 (passed as String(n): no thousands separator, as the old `${n}`).
 * Each expectation is the old literal / template copied verbatim.
 */
import { describe, expect, it } from 'vitest';
import { home } from '@/messages/ns/home';
import { profile } from '@/messages/ns/profile';
import { community } from '@/messages/ns/community';
import { social } from '@/messages/ns/social';
import { makeT } from '../t';

const th = makeT('he', home);
const tp = makeT('he', profile);
const tc = makeT('he', community);
const ts = makeT('he', social);

describe('home — addWorkout / runForecast / strengthVolume', () => {
  it('plain strings', () => {
    expect(th('addWorkout.save.saving')).toBe('שומר...');
    expect(th('addWorkout.save.update')).toBe('עדכן');
    expect(th('addWorkout.save.save')).toBe('שמור');
    expect(th('addWorkout.heading.edit')).toBe('ערוך אימון');
    expect(th('addWorkout.heading.add')).toBe('הוסף אימון');
    expect(th('addWorkout.buildCustom')).toBe('בנה אימון מותאם ←');
    expect(th('addWorkout.rangeMarker', { n: '120' })).toBe('120׳');
    expect(th('addWorkout.targetDate', { day: 'שבת', date: '24/10' })).toBe(`יום ${'שבת'}, ${'24/10'}`);
    expect(th('runForecast.race.half')).toBe('חצי מרתון');
  });
  it('gendered share rows (old g(gender, male, female); unknown reads the male form)', () => {
    const g = (gender: string | undefined, m: string, f: string) => (gender === 'female' ? f : m);
    for (const gender of ['female', 'male', 'other'] as const) {
      expect(th('addWorkout.share.title', { gender })).toBe(`${g(gender, 'שתף עם הקהילה', 'שתפי עם הקהילה')} — חפש שותף לאימון`);
      expect(th('addWorkout.share.sub', { gender })).toBe(g(gender, 'תופיע לאחרים שמחפשים שותף', 'תופיעי לאחרים שמחפשים שותפה'));
    }
  });
});

describe('profile — modeWidgets / goal cards / analytics v1 / hub v1', () => {
  it('every domain id, and the raw fallback', () => {
    const MAP: Record<string, string> = {
      push: 'דחיפה', pushing: 'דחיפה', pull: 'משיכה', pulling: 'משיכה', legs: 'רגליים', lower_body: 'רגליים',
      core: 'בטן', abs: 'בטן', upper_body: 'פלג עליון', full_body: 'כל הגוף',
    };
    for (const [id, he] of Object.entries(MAP)) expect(tp('modeWidgets.domain', { domain: id, raw: id.toUpperCase() })).toBe(he);
    expect(tp('modeWidgets.domain', { domain: 'weird_thing', raw: 'Weird_Thing' })).toBe('Weird_Thing');
  });
  it('minutes / record / steps', () => {
    expect(tp('modeWidgets.week.minutesOf', { n: '1500' })).toBe(`מתוך ${1500}'`);
    expect(tp('modeWidgets.record.v2', { name: 'שליטה', level: '4' })).toBe('שיא · שליטה · רמה 4');
    expect(tp('modeWidgets.record.v1', { name: 'שליטה', level: '4' })).toBe('🏅 שיא · שליטה · רמה 4');
    expect(tp('modeWidgets.run.stepsOf', { n: '12,000' })).toBe('מתוך 12,000');
  });
  it('goal hints per gender', () => {
    const L1 = { male: 'התחל אימון', female: 'התחילי אימון', other: 'אחרי האימון' };
    const L2 = { male: 'לראות גרף', female: 'לראות גרף', other: 'יופיע כאן גרף' };
    const E = { male: 'התחל אימון כדי לראות יעדים כאן.', female: 'התחילי אימון כדי לראות יעדים כאן.', other: 'אחרי האימון הראשון, היעדים יופיעו כאן.' };
    for (const gender of ['male', 'female', 'other'] as const) {
      expect(tp('goalCard.hint.line1', { gender })).toBe(L1[gender]);
      expect(tp('goalCard.hint.line2', { gender })).toBe(L2[gender]);
      expect(tp('goalCarousel.emptyHint', { gender })).toBe(E[gender]);
    }
  });
  it('exercise analytics v1 values', () => {
    expect(tp('exerciseAnalyticsV1.goal.pill', { n: '10' })).toBe(`יעד: ${10} חז׳`);
    expect(tp('exerciseAnalyticsV1.chart.target', { n: '10' })).toBe(`יעד ${10}`);
    expect(tp('exerciseAnalyticsV1.chart.legendTarget', { n: '10' })).toBe(`יעד (${10} חז׳)`);
    expect(tp('exerciseAnalyticsV1.history.count', { n: String(1234) })).toBe(`${1234} אימונים`);
    expect(tp('exerciseAnalyticsV1.picker.current', { n: '12' })).toBe(`יעד נוכחי: ${12} חזרות`);
    expect(tp('exerciseAnalyticsV1.first.body', { name: 'מתח' })).toBe('הנתון הראשון שלך במתח נשמר. סיים עוד אימון כדי לראות את הגרף מתחיל לחיות.');
    expect(tp('exerciseAnalyticsV1.metricUnit.volume')).toBe('חז׳ (נפח)');
  });
});

describe('community — hub / competition toggle / arena create', () => {
  it('hub', () => {
    expect(tc('communityHub.members', { n: String(1234) })).toBe(`${1234} חברים`);
    expect(tc('communityHub.groupMembers', { n: String(1234) })).toBe(`חברי הקבוצה (${1234})`);
    expect(tc('communityHub.slot', { day: 'שבת', time: '18:00' })).toBe(`יום ${'שבת'} · ${'18:00'}`);
    for (const [cat, he] of [['walking', 'הליכה'], ['running', 'ריצה'], ['yoga', 'יוגה'], ['calisthenics', 'קליסטניקס'], ['cycling', 'אופניים'], ['other', 'אחר']] as const)
      expect(tc('communityHub.category', { cat: `c_${cat}`, raw: cat })).toBe(he);
    expect(tc('communityHub.category', { cat: 'c_swim', raw: 'swim' })).toBe('swim');
    for (const [f, he] of [['weekly', 'שבועי'], ['biweekly', 'דו-שבועי'], ['monthly', 'חודשי']] as const)
      expect(tc('communityHub.frequency', { frequency: f, raw: f })).toBe(he);
    expect(tc('communityHub.frequency', { frequency: 'custom', raw: 'custom' })).toBe('custom');
  });
  it('arena create: gendered copy composed with a kind', () => {
    const SEND = { male: 'שלח', female: 'שלחי', other: 'שליחת' };
    const INTRO = { male: 'אני מתאמן עם Out ורוצה', female: 'אני מתאמנת עם Out ורוצה', other: 'אני באפליקציית Out ורוצה' };
    const SKIP = { male: 'דלג', female: 'דלגי', other: 'דילוג' };
    for (const gender of ['male', 'female', 'other'] as const) {
      expect(tc('arenaCreate.invite.skipPrivate', { gender })).toBe(`${SKIP[gender]} — קבוצה פרטית`);
      expect(tc('arenaCreate.code.sendToContact', { gender, kind: 'military' })).toBe(`📲 ${SEND[gender]} הודעה למפקד כושר`);
      expect(tc('arenaCreate.code.sendToContact', { gender, kind: 'school' })).toBe(`📲 ${SEND[gender]} הודעה למורה לחנ"ג`);
      for (const [kind, label] of [['work', 'מקום העבודה'], ['university', 'הקמפוס']] as const) {
        expect(tc('arenaCreate.outreach.shareText', { gender, kind })).toBe(
          `היי, ${INTRO[gender]} להביא את הפלטפורמה ל${label} שלנו! Out זו ליגת כושר עירונית שמחברת אנשים לאימונים חכמים בחוץ. בואו נדבר!\n\nhttps://appout.co.il/`,
        );
      }
      expect(tc('arenaCreate.outreach.send', { gender, kind: 'work' })).toBe(`📩 ${SEND[gender]} הודעה ל${'HR / מנהל ישיר'}`);
      expect(tc('arenaCreate.outreach.send', { gender, kind: 'university' })).toBe(`📩 ${SEND[gender]} הודעה ל${'אגודת הסטודנטים'}`);
    }
    expect(tc('arenaCreate.outreach.body', { kind: 'work' })).toBe('כדי לפתוח קבוצת עבודה רשמית, פנו לHR / מנהל ישיר ובקשו שישתפו פעולה עם Out!');
    expect(tc('arenaCreate.outreach.body', { kind: 'university' })).toBe('כדי לפתוח קבוצת קמפוס רשמית, פנו לאגודת הסטודנטים ובקשו שישתפו פעולה עם Out!');
    expect(tc('arenaCreate.outreach.step3', { kind: 'work' })).toBe('הליגה הרשמית של החברה נפתחת!');
    expect(tc('arenaCreate.outreach.step3', { kind: 'university' })).toBe('הליגה הרשמית של הקמפוס נפתחת!');
    expect(tc('arenaCreate.share.message', { name: 'N', link: 'L' })).toBe('הצטרפו לקבוצה שלי ב-Out! N\nL');
    expect(tc('arenaCreate.share.title', { name: 'N' })).toBe('הצטרפו לN');
    expect(tc('arenaCreate.outreach.sent', { icon: '🏢' })).toBe('נשלח! תודה 🏢');
  });
});

describe('social — chat', () => {
  it('relative time and high five', () => {
    expect(ts('chatInbox.days', { n: String(1234) })).toBe(`${1234} ימים`);
    expect(ts('chatThread.highFive.theirs', { name: 'יוסי' })).toBe('יוסי הרים ידיים');
    expect(ts('chatThread.report.titleUser', { name: 'יוסי' })).toBe('דיווח על יוסי');
    expect(ts('chatInbox.emptyHint.filtered')).toBe('נסה לסנן לפי "הכל"');
  });
});
