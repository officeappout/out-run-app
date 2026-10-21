/**
 * Namespace `community`, keys `communityPage.*` + the group page's `groupDrawer.chips.*` / `groupDrawer.reportLink` /
 * `groupDrawer.category` / `groupDrawer.calendarDetails` (i18n wave 2 batch v: src/app/community/_components,
 * the label helpers in src/app/community/_lib, GroupDetailsDrawer + group-details/utils/group-page-view).
 * Every key returns exactly what the code rendered before the extraction: the `old` side is the original
 * literal / template, or the old helper re-declared verbatim.
 *
 * The parity snapshots (src/app/community/_components/__tests__/community-components-i18n-parity.test.tsx,
 * and the existing group-details-drawer-split-parity hashes for the drawer) cover the keys in context;
 * this test also pins every select / plural branch, counts ≥ 1000 (no thousands separator) and what a
 * static render can't reach (the invite share text behind a tap).
 */
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import he from '@/messages/he/community.json';
import { community } from '@/messages/ns/community';
import { makeT } from '../t';

const t = makeT('he', community);
type Key = keyof typeof he;

describe('community page (communityPage.*)', () => {
  it('has the expected number of keys per prefix', () => {
    const count = (prefix: string) => Object.keys(he).filter((k) => k.startsWith(prefix)).length;
    expect(count('communityPage.')).toBe(69);
    expect(count('groupDrawer.')).toBe(5);
  });

  it('plain strings', () => {
    const cases: Array<[Key, string]> = [
      ['groupDrawer.chips.muscles', 'קבוצות שרירים'],
      ['groupDrawer.chips.equipment', 'ציוד נדרש'],
      ['groupDrawer.reportLink', 'דיווח על תוכן לא ראוי'],
      ['communityPage.tabs.leagues', 'ליגות'],
      ['communityPage.tabs.label', 'קהילה'],
      ['communityPage.tabs.feed', 'פיד'],
      ['communityPage.scopePoints.title', 'איך צוברים נקודות לליגה'],
      ['communityPage.feed.empty.title', 'הפיד שלך ריק'],
      // communityPage.feed.empty.body: gendered since gender batch 3 — gender-batch3-catalogs.test.ts
      ['communityPage.feed.empty.findPartners', 'חיפוש שותפים'], // gender batch 3 (was: מצא שותפים)
      ['communityPage.feed.filterBar.label', 'סינון הפיד'],
      ['communityPage.feed.filterBar.privacy', 'מי רואה את הפוסטים שלי'],
      ['communityPage.feed.filterBar.partners', 'שותפים'],
      ['communityPage.feed.filter.all', 'הכל'],
      ['communityPage.feed.filter.partners', 'שותפים'],
      ['communityPage.feed.filter.neighborhood', 'השכונה'],
      ['communityPage.feed.filter.groups', 'קבוצות'],
      ['communityPage.feed.loading', 'טוען פיד...'],
      ['communityPage.feed.refresh', 'רענון'],
      ['communityPage.feed.emptyFiltered', 'אין כאן עדיין פוסטים'],
      ['communityPage.leagues.sheetTitle', 'הליגות שלי'],
      ['communityPage.leagues.v2.tab.people', 'אישי'],
      ['communityPage.leagues.v2.tab.neighborhoods', 'שכונות'],
      ['communityPage.leagues.v2.tab.settlements', 'יישובים'],
      ['communityPage.leagues.v2.tab.units', 'חטיבות'],
      ['communityPage.leagues.v2.pointsHowTo', 'איך צוברים נקודות?'],
      ['communityPage.leagues.v2.tabsLabel', 'ליגות'],
      ['communityPage.leagues.v2.where', 'איפה'],
      ['communityPage.leagues.v2.whereMyCity', 'בעיר שלי'],
      ['communityPage.leagues.v2.whereNational', 'בכל הארץ'],
      ['communityPage.scopeType.neighborhood', 'השכונה שלך'],
      ['communityPage.scopeType.city', 'העיר שלך'],
      // communityPage.setup.title: gendered since gender batch 3 — gender-batch3-catalogs.test.ts
      ['communityPage.setup.body', 'עדיין לא הגדרת שכונה בפרופיל שלך'],
      ['communityPage.setup.cta', 'בחירת שכונה בפרופיל'], // gender batch 3 (was: בחר שכונה בפרופיל)
      ['communityPage.invite.body', 'יותר חברים = יותר פעילות = יותר סיכוי לנצח'],
      ['communityPage.invite.cta', 'הזמנת שכנים'],
      ['communityPage.axis.hint', 'הקשה להחלפת ציר'], // gender batch 3 (was: לחץ להחלפת ציר)
      ['communityPage.axis.filters', 'פילטרים'],
      ['communityPage.reserve.scopeLabel', 'ליגת המילואים'],
      ['communityPage.city.loading', 'טוען נתוני עיר...'],
      ['communityPage.city.fallbackName', 'העיר שלך'],
      ['communityPage.city.scopeLabelFallback', 'עיר'],
      ['communityPage.global.scopeLabel', 'ארצי'],
      ['communityPage.org.scopeLabelFallback', 'הארגון שלך'],
      ['communityPage.park.empty.title', 'עוד לא התאמנת בפארק'],
      ['communityPage.park.empty.body', 'כשתתאמנו ליד פארק, הדירוג שלו יופיע כאן אוטומטית'],
      ['communityPage.park.scopeLabelFallback', 'הפארק שלך'],
      ['communityPage.cards.city', 'ליגת העיר'],
      ['communityPage.cards.national', 'ליגה ארצית'],
      ['communityPage.cards.nationalSubtitle', 'כל ישראל'],
      ['communityPage.cards.park', 'ליגת הפארק'],
      ['communityPage.cards.reserve', 'ליגת המילואים'],
    ];
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });

  it('values: counts ≥ 1000 without a separator, names', () => {
    for (const n of [1, 7, 1234]) {
      expect(t('communityPage.feed.following', { count: String(n) })).toBe(`עוקב אחרי ${n} שותפים`);
      expect(t('communityPage.cards.members', { count: String(n) })).toBe(`${n} חברים`);
    }
    const scope = 'נווה שאנן';
    // gender batch 3: share text → plural (decision 7), title → noun
    expect(t('communityPage.invite.shareText', { scope })).toBe(`בואו להצטרף אליי ב${scope} על Out! 🔥`);
    expect(t('communityPage.invite.title', { scope })).toBe(`הזמנת שכנים ל${scope}`);
    expect(t('communityPage.leagues.v2.whereCity', { city: 'חיפה' })).toBe(`ב${'חיפה'}`);
    expect(t('communityPage.axis.hintInCity', { city: 'חיפה' })).toBe(`ב${'חיפה'} · ` + 'הקשה להחלפת ציר'); // gender batch 3: noun
    expect(t('communityPage.leagues.v2.month', { month: 'אוקטובר' })).toBe(`ליגת ${'אוקטובר'}`);
    expect(t('groupDrawer.calendarDetails', { category: 'ריצה', groupName: 'רצי הירקון' })).toBe(`קבוצת ${'ריצה'} — ${'רצי הירקון'}`);
  });

  it('selects: every branch equals the old ternary / map', () => {
    const windowLabel = (w: string) => (w === 'daily' ? 'יומי' : w === 'weekly' ? 'שבועי' : 'חודשי');
    const windowPhrase = (w: string) => (w === 'daily' ? 'היום' : w === 'weekly' ? 'השבוע' : 'החודש');
    for (const w of ['daily', 'weekly', 'monthly']) {
      expect(t('communityPage.window.label', { window: w })).toBe(windowLabel(w));
      expect(t('communityPage.window.phrase', { window: w })).toBe(windowPhrase(w));
      for (const c of ['overall', 'cardio', 'strength']) {
        const cat = c === 'overall' ? 'כללי' : c === 'cardio' ? 'ריצה' : 'כוח';
        expect(t('communityPage.leagues.filterLabel', { category: c, window: windowLabel(w) })).toBe(`${cat} • ${windowLabel(w)}`);
        for (const g of ['neighborhood', 'city']) {
          expect(t('communityPage.contribution.km', { km: '12.3', granularity: g, phrase: windowPhrase(w) }))
            .toBe(`תרמת ${'12.3'} ק״מ ${g === 'neighborhood' ? 'לשכונה' : 'לעיר'} ${windowPhrase(w)}`);
        }
      }
      expect(t('communityPage.contribution.title', { phrase: windowPhrase(w), scope: 'X' })).toBe(`התרומה שלך ${windowPhrase(w)} · X`);
    }
    for (let days = 0; days <= 6; days++) {
      const old = days === 0 ? 'השבוע נסגר הלילה' : `השבוע נסגר בעוד ${days === 1 ? 'יום' : `${days} ימים`}`;
      expect(t('communityPage.leagues.v2.weekCloses', { days })).toBe(old);
    }
    const AXIS_LABEL: Record<string, string> = { city: 'ערים', neighborhood: 'שכונות', group: 'קבוצות' };
    for (const axis of ['city', 'neighborhood', 'group']) {
      expect(t('communityPage.axis.option', { axis })).toBe(AXIS_LABEL[axis]);
      expect(t('communityPage.axis.between', { axis })).toBe(`בין ${AXIS_LABEL[axis]}`);
    }
    const GROUP_CATEGORY_LABEL: Record<string, string> = { overall: 'כל הפעילות', cardio: 'ריצה', strength: 'כוח' };
    for (const category of ['overall', 'cardio', 'strength']) {
      expect(t.rich('communityPage.axis.metric', { category, b: (c: ReactNode) => `<b>${String(c)}</b>` }).join('')).toBe(`מדד: <b>${GROUP_CATEGORY_LABEL[category]}</b>`);
    }
    expect(t.rich('communityPage.reserve.metric', { b: (c: ReactNode) => `<b>${String(c)}</b>` }).join('')).toBe('מדד: <b>ממוצע צעדים יומי</b>');
    const outreach = (o: string | null) => (o === 'work' ? 'הארגון שלך' : o === 'youth_movement' ? 'התנועה שלך' : 'בית הספר');
    const cardOrg = (o: string | null) =>
      o === 'work' ? 'ליגת העבודה' : o === 'university' ? 'ליגת הקמפוס' : o === 'youth_movement' ? 'ליגת התנועה' : 'ליגת בית הספר';
    for (const o of ['work', 'university', 'youth_movement', 'school', 'military']) {
      expect(t('communityPage.org.outreachName', { orgType: o })).toBe(outreach(o));
      expect(t('communityPage.cards.org', { orgType: o })).toBe(cardOrg(o));
    }
    const CATEGORY: Record<string, string> = {
      walking: 'הליכה', running: 'ריצה', yoga: 'יוגה', calisthenics: 'קליסתניקס', cycling: 'רכיבה', other: 'אחר',
    };
    for (const c of ['walking', 'running', 'yoga', 'calisthenics', 'cycling', 'other', 'unknown', '']) {
      expect(t('groupDrawer.category', { category: c })).toBe((CATEGORY[c] ?? CATEGORY.other));
    }
  });
});
