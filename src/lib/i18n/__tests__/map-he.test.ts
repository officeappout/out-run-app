/**
 * Namespace `map` (i18n wave 2 — Partner Finder, `partners.*`): every Hebrew
 * key returns exactly what the code rendered before the extraction. The `old`
 * side of each case is the original literal / template expression, copied
 * verbatim from src/features/partners/components.
 *
 * The static-markup parity snapshots (partners-i18n-parity.test.tsx) cover the
 * keys in context; this test also pins the ones a static render can't reach
 * (the "connecting…" CTA, the auto-switch hint) and every gender branch.
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/map.json';
import { map } from '@/messages/ns/map';
import { makeT } from '../t';

const t = makeT('he', map);

// The old g(gender, male, female) helper: female → feminine, anything else → masculine.
const g = (gender: string | undefined, male: string, female: string) => (gender === 'female' ? female : male);

describe('map (he) — byte-identical to the pre-extraction literals', () => {
  it('plain strings', () => {
    const cases: Array<[keyof typeof he, string]> = [
      ['partners.activity.strength', 'כוח'],
      ['partners.activity.running', 'ריצה'],
      ['partners.activity.walking', 'הליכה'],
      ['partners.activity.cycling', 'רכיבה'],
      ['partners.card.live', 'לייב'],
      ['partners.card.ownArrival', 'הגעה שלי'],
      ['partners.card.join', 'הצטרף'],
      ['partners.card.connecting', 'מתחבר...'],
      ['partners.card.openChat', "פתח צ'אט"],
      ['partners.empty.live.title', 'אין מתאמנים פעילים קרוב אליך עכשיו'],
      ['partners.empty.scheduled.title', 'אין אימונים מתוכננים באזור'],
      ['partners.empty.changeFilter', 'שינוי סינון'],
      ['partners.radar.live', 'מחפש מתאמנים קרוב אליך...'],
      ['partners.radar.scheduled', 'מחפש אימונים מתוכננים...'],
      ['partners.overlay.back', 'חזור'],
      ['partners.overlay.tab.live', 'מי בחוץ'],
      ['partners.overlay.tab.scheduled', 'מי מתכנן'],
      ['partners.overlay.live.title', 'מי מתאמן עכשיו?'],
      ['partners.overlay.live.subtitle', 'מתאמנים פעילים קרוב אליך כרגע'],
      ['partners.overlay.scheduled.title', 'מי מתכנן להתאמן?'],
      ['partners.overlay.scheduled.subtitle', 'אימונים מתוכננים היום ומחר באזורך'],
      ['partners.overlay.autoSwitchHint', 'מציג קבוצות מתוכננות'],
      ['partners.overlay.loading', 'מחפש שותפים...'],
      ['partners.filter.activity.all', 'הכל'],
      ['partners.filter.activity.strength', 'כוח'],
      ['partners.filter.activity.running', 'ריצה'],
      ['partners.filter.activity.walking', 'הליכה'],
      ['partners.filter.soloGroup.all', 'הכל'],
      ['partners.filter.soloGroup.solo', 'יחידים'],
      ['partners.filter.soloGroup.groups', 'קבוצות'],
      ['partners.filter.time.all', 'הכל'],
      ['partners.filter.time.today', 'היום'],
      ['partners.filter.time.tomorrow', 'מחר'],
      ['partners.filter.open', 'סינון'],
      ['partners.filter.type', 'סוג'],
      ['partners.filter.when', 'מתי'],
      ['partners.filter.timeRange', 'טווח שעות'],
      ['partners.filter.timeStart', 'שעת התחלה'],
      ['partners.filter.timeEnd', 'שעת סיום'],
      ['partners.filter.program', 'תוכנית'],
      ['partners.filter.program.all', 'הכל'],
      ['partners.filter.level', 'רמה'],
      ['partners.filter.levelMin', 'רמה מינימום'],
      ['partners.filter.levelMax', 'רמה מקסימום'],
      ['partners.filter.level.beginner', 'מתחיל'],
      ['partners.filter.level.advanced', 'מתקדם'],
      ['partners.filter.runDistance', 'מרחק יעד'],
      ['partners.filter.runDistanceLabel', 'מרחק יעד בקילומטרים'],
      ['partners.filter.pace', 'קצב (דקות לק״מ)'],
      ['partners.filter.paceMin', 'קצב מינימום'],
      ['partners.filter.paceMax', 'קצב מקסימום'],
      ['partners.filter.pace.slow', 'איטי'],
      ['partners.filter.pace.fast', 'מהיר'],
      ['partners.sheet.title', 'סינון'],
      ['partners.sheet.reset', 'איפוס'],
      ['partners.sheet.close', 'סגור'],
      ['partners.sheet.apply', 'החל'],
      ['partners.sheet.distance', 'מרחק'],
      ['partners.sheet.distanceLabel', 'מרחק חיפוש בקילומטרים'],
      ['partners.sheet.gender', 'מגדר'],
      ['partners.sheet.gender.all', 'הכל'],
      ['partners.sheet.gender.male', 'גברים'],
      ['partners.sheet.gender.female', 'נשים'],
      ['partners.sheet.age', 'טווח גילאים'],
      ['partners.sheet.ageMin', 'גיל מינימום'],
      ['partners.sheet.ageMax', 'גיל מקסימום'],
      ['partners.sheet.age.young', 'צעיר'],
      ['partners.sheet.age.old', 'מבוגר'],
    ];
    for (const [key, old] of cases) expect(t(key), key).toBe(old);
  });

  it('values', () => {
    for (const km of [0.05, 0.42, 3.456, 12.7]) {
      const old = km < 1 ? `${Math.round(km * 1000)} מ׳` : `${km.toFixed(km < 10 ? 1 : 0)} ק״מ`;
      const now = km < 1
        ? t('partners.distance.meters', { m: Math.round(km * 1000) })
        : t('partners.distance.km', { km: km.toFixed(km < 10 ? 1 : 0) });
      expect(now).toBe(old);
    }
    // PartnerFilterSheet's formatDistance (no toFixed) and the run-distance chip.
    for (const v of [0.5, 5, 7.5, 15]) {
      const old = v < 1 ? `${Math.round(v * 1000)} מ׳` : `${v} ק״מ`;
      const now = v < 1 ? t('partners.distance.meters', { m: Math.round(v * 1000) }) : t('partners.distance.km', { km: v });
      expect(now).toBe(old);
      expect(t('partners.sheet.distanceUpTo', { distance: now })).toBe(`עד ${old}`);
    }
    const mockPace = '5:30', n = 'פלג גוף עליון', programLevel = 5, name = 'נועה', memberCount = 7, currentStreak = 12;
    expect(t('partners.activity.runningPace', { pace: mockPace })).toBe(`ריצה · ${mockPace} לק״מ`);
    expect(t('partners.activity.walkingPace', { pace: mockPace })).toBe(`הליכה · ${mockPace} לק״מ`);
    expect(t('partners.card.programLevel', { program: n, level: programLevel })).toBe(`${n} · רמה ${programLevel}`);
    expect(t('partners.card.openProfile', { name })).toBe(`פתח פרופיל של ${name}`);
    expect(t('partners.card.members', { count: memberCount })).toBe(`${memberCount} משתתפים`);
    expect(t('partners.card.streak', { days: currentStreak })).toBe(`${currentStreak} ימים רצף`);
    const extraCount = 3;
    expect(t('partners.filter.openActive', { count: extraCount })).toBe(`סינון — ${extraCount} פעילים`);
  });

  it('gendered empty-state copy (old g() helper: female, else masculine)', () => {
    for (const gender of ['male', 'female', 'other'] as const) {
      expect(t('partners.empty.live.sub', { gender })).toBe(
        `${g(gender, 'היה הראשון', 'היי הראשונה')} — ${g(gender, 'סמן את עצמך פנוי', 'סמני את עצמך פנויה')} לפני האימון`,
      );
      expect(t('partners.empty.scheduled.sub', { gender })).toBe(
        // Owner copy fix (21.10.2026): the female form had a masculine second verb ("ושתף").
        g(gender, 'הוסף אימון ללוז ושתף אותו עם הקהילה', 'הוסיפי אימון ללוז ושתפי אותו עם הקהילה'),
      );
    }
  });

  it('no key is left untested', () => {
    // Keep this list in step with the catalog: a new key needs a case above.
    expect(Object.keys(he).length).toBe(80);
  });
});
