/**
 * Namespace `library` (i18n wave 2, search): every Hebrew key returns exactly what the code
 * rendered before the extraction. The `old` side is the original literal / template expression,
 * copied verbatim from the component (src/features/search/**).
 *
 * The static-markup parity snapshots (src/features/search/__tests__/*-i18n-parity.test.tsx) cover
 * most keys in context; this test also pins the ones a static render can't reach (legacy שלי mode,
 * people results, the group filter chips, the suggest states, every select / plural branch).
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/library.json';
import { library } from '@/messages/ns/library';
import { makeT } from '../t';

const t = makeT('he', library);

describe('library (he) — byte-identical to the pre-extraction literals', () => {
  it('plain strings', () => {
    const cases: Array<[keyof typeof he, string]> = [
      ["search.category.all", "הכל"],
      ["search.category.exercises", "תרגילים"],
      ["search.category.parks", "גינות"],
      ["search.category.routes", "מסלולים"],
      ["search.category.social", "אנשים וקבוצות"],
      ["search.category.events", "אירועים"],
      ["search.category.articles", "מאמרים"],
      ["search.category.help", "עזרה"],
      ["search.chips.label", "סוג תוצאה"],
      ["search.placeholder.all", "תרגיל, גינה, חבר, מאמר או שאלה"],
      ["search.placeholder.exercises", "חפש תרגיל..."],
      ["search.placeholder.parks", "שם גינה או עיר"],
      ["search.placeholder.routes", "שם מסלול או עיר"],
      ["search.placeholder.social", "שם, קבוצה או שכונה"],
      ["search.placeholder.events", "מרוץ, סדנה או מפגש"],
      ["search.placeholder.articles", "חפש מאמר"],
      ["search.placeholder.help", "איך עושים...?"],
      ["search.title", "חיפוש"],
      ["search.live.searching", "מחפש…"],
      ["search.field.label", "חיפוש"],
      ["search.field.clear", "ניקוי החיפוש"],
      ["search.empty.recents", "חיפושים אחרונים"],
      ["search.empty.clearRecents", "ניקוי"],
      ["search.empty.situations", "אולי זה מה שחיפשת"],
      ["search.empty.articles", "מאמרים מומלצים"],
      ["search.empty.allArticles", "לכל המאמרים"],
      ["search.situation.park.title", "גינה קרובה"],
      ["search.situation.run.title", "ריצת ערב"],
      ["search.situation.run.sub", "מסלולים לידך"],
      ["search.situation.abs.title", "תרגילי בטן"],
      ["search.situation.abs.sub", "בלי ציוד, מכל מקום"],
      ["search.situation.help.title", "איך משתמשים"],
      ["search.situation.help.sub", "סיור קצר ושאלות נפוצות"],
      ["search.situation.events.title", "אירועים השבוע"],
      ["search.situation.groups.title", "קבוצות לידך"],
      ["search.situation.parks.title", "גינות כושר"],
      ["search.situation.parks.sub", "מצאו גינה לאימון"],
      ["search.kelly.initial", "ק"],
      ["search.kelly.notFound", "לא מוצא? שאל את קלי"],
      ["search.kelly.knowsYou", "הוא מכיר את האפליקציה ואת האימונים שלך"],
      ["search.noResults.title", "לא מצאנו בדיוק את זה"],
      ["search.noResults.near", "אולי חיפשת"],
      ["search.noResults.browseBy", "או לחפש לפי"],
      ["search.noResults.browse.exercises", "שריר"],
      ["search.noResults.browse.parks", "גינה"],
      ["search.noResults.browse.articles", "מאמר"],
      ["search.noResults.kelly.title", "קלי יודע לענות על זה"],
      ["search.noResults.kelly.cta", "לשאול את קלי"],
      ["search.noResults.suggest.cta", "חסר משהו? הצע לנו להוסיף"],
      ["search.noResults.suggest.sending", "שולח…"],
      ["search.noResults.suggest.sent", "תודה! העברנו לצוות"],
      ["search.noResults.suggest.error", "לא הצלחנו לשלוח, נסו שוב"],
      ["search.article.back", "חזרה לחיפוש"],
      ["search.article.eyebrow", "מאמר"],
      ["search.articles.categoryLabel", "קטגוריה"],
      ["search.articles.all", "הכל"],
      ["search.articles.none", "לא נמצאו מאמרים"],
      ["search.articles.soon", "מאמרים יופיעו כאן בקרוב"],
      ["search.events.filterLabel", "סינון אירועים"],
      ["search.events.filter.all", "הכל"],
      ["search.events.filter.week", "השבוע"],
      ["search.events.filter.race", "מרוצים"],
      ["search.events.filter.fitnessDay", "ימי כושר"],
      ["search.events.filter.workshop", "סדנאות"],
      ["search.events.filter.communityMeetup", "מפגשי קהילה"],
      ["search.events.none", "לא נמצאו אירועים"],
      ["search.events.noneUpcoming", "אין אירועים קרובים כרגע"],
      ["search.help.tour.title", "סיור קצר באפליקציה"],
      ["search.help.tour.sub", "2 דקות, אפשר לעצור בכל שלב"],
      ["search.help.chapters", "איך משתמשים"],
      ["search.help.faq.title", "שאלות נפוצות"],
      ["search.help.faq.sub", "אותן שאלות כמו באתר"],
      ["search.help.answers", "תשובות על האפליקציה"],
      ["search.help.none", "לא נמצאו תשובות"],
      ["search.places.typeHint.parks", "הקלידו שם של גינה או עיר"],
      ["search.places.typeHint.routes", "הקלידו שם של מסלול או עיר"],
      ["search.places.locationHint", "עם הרשאת מיקום נראה כאן את הקרובים אליך"],
      ["search.places.nearLabel.parks", "גינות קרובות"],
      ["search.places.nearLabel.routes", "מסלולים קרובים"],
      ["search.places.nearTitle.parks", "גינות קרובות אליך"],
      ["search.places.nearTitle.routes", "מסלולים קרובים אליך"],
      ["search.social.label", "אנשים וקבוצות"],
      ["search.social.sub.partners", "השותפים שלי"],
      ["search.social.sub.groups", "גלה קבוצות"],
      ["search.social.sub.people", "אנשים"],
      ["search.social.groups.none", "לא נמצאו קבוצות"],
      ["search.social.groups.emptyCity", "עוד אין קבוצות בעיר שלך"],
      ["search.social.groups.emptyNoAccess", "קבוצות יופיעו כאן כשיהיו בעיר שלך"],
      ["search.social.people.prompt", "הקלידו שם כדי למצוא אנשים"],
      ["search.social.people.none", "לא נמצאו אנשים בשם הזה"],
      ["search.social.partners.none", "עוד אין לך שותפים. אפשר למצוא אותם ב״אנשים״"],
      ["search.group.join", "הצטרפות"],
      ["search.group.joined", "בקבוצה ✓"],
      ["search.group.initialsFallback", "קב"],
      ["search.event.join", "אני בא"],
      ["search.event.joined", "נרשמת ✓"],
      ["search.person.fallback", "מתאמן/ת ב־OUT"],
      ["search.person.profile", "לפרופיל"],
      ["search.mapQuick.label", "חיפוש מהיר"],
      ["search.mapQuick.gyms", "גינות כושר"],
      ["search.mapQuick.routes", "מסלולי ריצה"],
      ["search.mapAll.withQuerySub", "קבוצות, אירועים ומאמרים"],
      ["search.mapAll.prompt", "מחפש תרגיל, קבוצה או מאמר?"],
      ["search.mapAll.promptSub", "לחיפוש בכל האפליקציה"],
      ["search.legacy.tab.exercises", "תרגילים"],
      ["search.legacy.tab.groups", "קבוצות"],
      ["search.legacy.tab.people", "אנשים"],
      ["search.legacy.tab.events", "אירועים"],
      ["search.legacy.groupChip.all", "הכל"],
      ["search.legacy.groupChip.walking", "הליכה"],
      ["search.legacy.groupChip.running", "ריצה"],
      ["search.legacy.groupChip.calisthenics", "קליסתניקס"],
      ["search.legacy.groupChip.cycling", "רכיבה"],
      ["search.legacy.groupChip.community", "קהילתי"],
      ["search.legacy.eventFilter.all", "הכל"],
      ["search.legacy.eventFilter.running", "ריצה"],
      ["search.legacy.eventFilter.walking", "הליכה"],
      ["search.legacy.eventFilter.strength", "כוח"],
      ["search.legacy.eventFilter.near", "קרוב אלי"],
      ["search.legacy.placeholder.exercises", "חפש תרגיל..."],
      ["search.legacy.placeholder.events", "חפש אירוע..."],
      ["search.legacy.placeholder.groups", "חפש קבוצה..."],
      ["search.legacy.placeholder.people", "חפש לפי שם..."],
      ["search.legacy.placeholder.default", "חיפוש..."],
      ["search.legacy.field.label", "חיפוש"],
      ["search.legacy.field.clear", "נקה חיפוש"],
      ["search.legacy.tabs.label", "חיפוש"],
      ["search.legacy.mode.label", "מצב תצוגה"],
      ["search.legacy.mode.discover", "גלה"],
      ["search.legacy.mode.my", "שלי"],
      ["search.legacy.invite", "הזמן חברים"],
      ["search.legacy.filterGroups", "סנן קבוצות"],
      ["search.legacy.myGroupsEmpty", "עוד לא הצטרפת לקבוצות — עבור ל\"גלה\" כדי למצוא קבוצות"],
      ["search.legacy.partners.loading", "טוען..."],
      ["search.legacy.partners.empty.title", "עדיין אין לך שותפים"],
      ["search.legacy.partners.empty.body", "עקוב אחרי משתמשים בלשונית \"גלה אנשים\" או הזמן חברים שעדיין לא באפליקציה"],
      ["search.legacy.partners.empty.invite", "הזמן חברים"],
      ["search.legacy.people.searching", "מחפש..."],
      ["search.legacy.people.minChars", "הקלד לפחות 2 תווים לחיפוש"],
      ["search.legacy.people.nationwide", "חיפוש משתמשים מכל הארץ — לא מוגבל לעיר שלך"],
      ["search.legacy.people.none.title", "לא נמצאו תוצאות"],
      ["search.legacy.people.none.body", "נסה שם אחר"],
      ["search.legacy.groups.none.title", "לא נמצאו קבוצות"],
      ["search.legacy.groups.none.access", "קבוצות חדשות יופיעו כאן ברגע שיתווספו לעיר שלך"],
      ["search.legacy.groups.none.noAccess", "חבר GPS כדי לגלות קבוצות באזורך"],
      ["search.legacy.events.none.title", "לא נמצאו אירועים"],
      ["search.legacy.events.none.access", "אירועים חדשים יופיעו כאן ברגע שיתווספו"],
      ["search.legacy.events.none.noAccess", "חבר GPS כדי לגלות אירועים באזורך"],
    ];
    for (const [key, old] of cases) expect(t(key), key).toBe(old);
  });

  it('values', () => {
    const query = 'פרונט ליבר';
    expect(t('search.live.results', { count: String(1234) })).toBe(`${1234} תוצאות`);
    expect(t('search.kelly.askQuery', { query })).toBe(`שאל את קלי: ״${query}״`);
    expect(t('search.noResults.body', { query })).toBe(`אין תוצאה ל״${query}״${'.'}`);
    expect(t('search.noResults.bodyNear', { query })).toBe(`אין תוצאה ל״${query}״${', אבל יש דברים קרובים.'}`);
    expect(t('search.noResults.kelly.body', { query })).toBe(`״${query}״ · הוא יבנה לך תשובה או אימון ברמה שלך.`);
    expect(t('search.mapAll.withQuery', { query })).toBe(`״${query}״ בכל האפליקציה`);
    expect(t('search.article.readMin', { min: String(4) })).toBe(`${4} דק׳ קריאה`);
    expect(t('search.results.seeAll', { count: String(12) })).toBe(`לכל ${12}`);

    // situations (core/situations.ts before: title / sub per id)
    for (const n of [1, 2, 3, 12]) {
      expect(t('search.situation.park.sub', { n })).toBe(n === 1 ? 'גינה אחת עד 1 ק״מ' : `${n} גינות עד 1 ק״מ`);
      expect(t('search.situation.events.sub', { n })).toBe(n === 1 ? 'אירוע אחד בעיר שלך' : `${n} בעיר שלך`);
      expect(t('search.situation.groups.sub', { n })).toBe(`${n} קבוצות פעילות`);
    }

    // distances (PlaceRow.formatKm) and the place row label
    const km = 0.42, far = 3.25;
    expect(t('search.distance.m', { m: String(Math.round(km * 1000)) })).toBe(`${Math.round(km * 1000)} מ׳`);
    expect(t('search.distance.km', { km: far.toFixed(1) })).toBe(`${far.toFixed(1)} ק״מ`);
    expect(t('search.place.routeLength', { km: (7.4).toFixed(1) })).toBe(`${(7.4).toFixed(1)} ק״מ`);
    for (const kind of ['park', 'route'] as const) {
      const isPark = kind === 'park';
      const title = 'גינת הירקון', dist = '400 מ׳';
      expect(t('search.place.aria', { kind, title })).toBe(`${isPark ? 'גינה' : 'מסלול'}: ${title}${''}`);
      expect(t('search.place.ariaWithDistance', { kind, title, dist })).toBe(`${isPark ? 'גינה' : 'מסלול'}: ${title}${`, ${dist} ממך`}`);
    }

    // categories: GROUP_CATEGORY_LABEL[c] ?? 'אימון', EVENT_CATEGORY_LABEL[c] ?? 'אירוע'
    const GROUP: Record<string, string> = { walking: 'הליכה', running: 'ריצה', yoga: 'יוגה', calisthenics: 'קליסטניקס', cycling: 'רכיבה', other: 'אימון' };
    const EVENT: Record<string, string> = { race: 'מרוץ', fitness_day: 'יום כושר', workshop: 'סדנה', community_meetup: 'מפגש קהילה', other: 'אירוע' };
    for (const c of [...Object.keys(GROUP), 'mystery', '']) expect(t('search.group.category', { category: c }), c).toBe(GROUP[c] ?? 'אימון');
    for (const c of [...Object.keys(EVENT), 'mystery', '']) expect(t('search.event.category', { category: c }), c).toBe(EVENT[c] ?? 'אירוע');

    const name = 'רצי פלורנטין';
    expect(t('search.group.members', { count: String(42) })).toBe(`${42} חברים`);
    expect(t('search.group.distanceFromYou', { km: '800 מ׳' })).toBe('800 מ׳' + ' ממך');
    expect(t('search.group.detailsAria', { name })).toBe(`פרטי הקבוצה ${name}`);
    expect(t('search.group.joinAria', { name })).toBe(`הצטרפות ל${name}`);
    expect(t('search.group.joinedAria', { name })).toBe(`${name}: כבר בקבוצה`);
    expect(t('search.event.distanceFromYou', { km: '2.0 ק״מ' })).toBe(`${'2.0 ק״מ'} ממך`);
    expect(t('search.event.spots', { count: String(20) })).toBe(`${20} מקומות`);
    expect(t('search.event.detailsAria', { name })).toBe(`פרטי האירוע ${name}`);
    expect(t('search.event.joinAria', { name })).toBe(`להירשם ל${name}`);
    expect(t('search.event.joinedAria', { name })).toBe(`${name}: נרשמת`);
    expect(t('search.person.level', { level: String(7) })).toBe(`רמה ${7}`);
    expect(t('search.person.profileAria', { name })).toBe(`לפרופיל של ${name}`);

    // legacy counts (`{n} שותפים` etc.)
    expect(t('search.legacy.partners.count', { count: String(3) })).toBe(`${3} שותפים`);
    expect(t('search.legacy.people.count', { count: String(3) })).toBe(`${3} תוצאות`);
    expect(t('search.legacy.groups.count', { count: String(1500) })).toBe(`${1500} קבוצות`);
    expect(t('search.legacy.events.count', { count: String(3) })).toBe(`${3} אירועים`);
  });

  it('no key is left untested', () => {
    // Keep in step with the catalog: a new key needs a case above.
    expect(Object.keys(he).length).toBe(182);
  });
});
