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
    // Counted per prefix: other batches add keys to the same namespace file.
    expect(Object.keys(he).filter((k) => k.startsWith('search.')).length).toBe(182);
  });
});

/**
 * `exercises.*` (i18n wave 2): the exercise library's UI frame copy
 * (src/features/content/exercises/client/**). The `old` side is the original literal / template,
 * copied verbatim. The jsdom parity snapshots (content/exercises/client/__tests__/library-i18n-parity)
 * cover the keys in context; this pins every select / helper branch too.
 */
describe('library (he) — exercises.* byte-identical to the pre-extraction literals', () => {
  it('plain strings', () => {
    const cases: Array<[keyof typeof he, string]> = [
      ['exercises.count.loading', 'טוען תרגילים...'],
      ['exercises.count.error', 'שגיאה בטעינה'],
      ['exercises.error.title', 'שגיאה בטעינת התרגילים'],
      ['exercises.error.hint', 'בדוק חיבור לאינטרנט והרשאות Firestore. הפרטים המלאים מודפסים ב-Console.'],
      ['exercises.emptyCorpus.title', 'לא נטענו תרגילים מהשרת'],
      ['exercises.emptyCorpus.hint', 'ייתכן שאין חיבור ל-Firestore או שהאוסף ריק. בדוק את ה-Console.'],
      ['exercises.noResults.title', 'לא נמצאו תרגילים'],
      ['exercises.noResults.hint', 'נסה להסיר חלק מהמסננים'],
      ['exercises.chips.trackFallback', 'מסלול'],
      ['exercises.chips.bodyweight', 'משקל גוף'],
      ['exercises.chips.clearAll', 'נקה הכל'],
      ['exercises.filters.open', 'סינון מתקדם'],
      ['exercises.filters.title', 'פילטרים'],
      ['exercises.filters.muscles', 'שרירים'],
      ['exercises.filters.associatedHint', 'מסומן בכתום — שרירים שקשורים למסלול שנבחר (מידע בלבד, לא משפיע על התוצאות)'],
      ['exercises.filters.tracks', 'מסלול'],
      ['exercises.filters.tracksLoading', 'טוען מסלולים...'],
      ['exercises.filters.subTracksHide', 'הסתר תת-מסלולים'],
      ['exercises.filters.subTracksShow', 'הצג תת-מסלולים'],
      ['exercises.filters.masterIncludesAll', 'כולל את כל הרמות של כל תת-המסלולים'],
      ['exercises.filters.location', 'מיקום'],
      ['exercises.filters.gear', 'ציוד'],
      ['exercises.filters.bodyweight', 'משקל גוף'],
      ['exercises.filters.gearLoading', 'טוען ציוד...'],
      ['exercises.filters.gearPark', 'ציוד פארק'],
      ['exercises.filters.gearImprovised', 'ציוד מאולתר / ביתי'],
      ['exercises.filters.gearPersonal', 'ציוד אישי'],
      ['exercises.filterSheet.close', 'סגור'],
      ['exercises.filterSheet.clear', 'נקה'],
      ['exercises.filterSheet.apply', 'החל'],
      ['exercises.detail.label', 'פרטי תרגיל'],
      ['exercises.detail.close', 'סגור'],
      ['exercises.detail.facts.muscle', 'שריר'],
      ['exercises.detail.facts.gear', 'ציוד'],
      ['exercises.detail.facts.level', 'רמה'],
      ['exercises.detail.facts.bodyweight', 'משקל גוף'],
      ['exercises.detail.programs', 'תוכניות'],
      ['exercises.detail.gear', 'ציוד'],
      ['exercises.detail.bodyweight', 'משקל גוף'],
      ['exercises.detail.chain.title', 'מסלול ההתקדמות'],
      ['exercises.detail.chain.fullMap', 'מפה מלאה'],
      ['exercises.detail.perf.open', 'לצפייה בהתקדמות המלאה'],
      ['exercises.detail.perf.best', 'שיא חזרות ברצף'],
      ['exercises.detail.muscles', 'שרירים'],
      ['exercises.detail.musclePrimary', 'ראשי'],
      ['exercises.detail.muscleSecondary', 'משני'],
      ['exercises.detail.instructions', 'הוראות ביצוע'],
      ['exercises.detail.cues', 'דגשים'],
      ['exercises.detail.description', 'תיאור'],
      ['exercises.detail.goals', 'מטרות'],
      ['exercises.detail.tips', 'טיפים'],
      ['exercises.programSwitcher.close', 'סגור'],
      ['exercises.locationSwitcher.bodyweight', 'משקל גוף'],
      ['exercises.locationSwitcher.close', 'סגור'],
    ];
    for (const [key, old] of cases) expect(t(key), key).toBe(old);
  });

  it('muscle chips (muscle-bar.utils MUSCLE_LABELS_HE, verbatim)', () => {
    const MUSCLE_LABELS_HE: Record<string, string> = {
      chest: 'חזה', back: 'גב', middle_back: 'אמצע גב', shoulders: 'כתפיים', rear_delt: 'כתף אחורית',
      abs: 'בטן', obliques: 'אלכסונים', forearms: 'אמות', biceps: 'דו-ראשי', triceps: 'תלת-ראשי',
      quads: 'ארבע-ראשי', hamstrings: 'המסטרינג', glutes: 'ישבן', calves: 'שוקיים', traps: 'טרפז',
      cardio: 'קרדיו', full_body: 'כל הגוף', core: 'ליבה', legs: 'רגליים', serratus: 'המסור',
      adductors: 'מקרבי הירך', hip_flexors: 'כופפי הירך',
    };
    for (const [m, old] of Object.entries(MUSCLE_LABELS_HE)) expect(t(`exercises.muscle.${m}` as keyof typeof he), m).toBe(old);
  });

  it('values, selects and helper branches', () => {
    // body counter: `נמצאו{' '}<span>{visibleCount}</span>{' '}תרגילים` (text content)
    expect(t('exercises.count.found', { count: String(1234) }).replace(/<\/?b>/g, '')).toBe(`נמצאו ${1234} תרגילים`);
    expect(t.rich('exercises.count.found', { count: String(1234), b: (c: unknown) => `[${c}]` }).join('')).toBe('נמצאו [1234] תרגילים');

    const track = 'קליסטניקס עליון';
    expect(t('exercises.chips.trackLevel', { track, level: String(3) })).toBe(`${track} · רמה ${3}`);
    expect(t('exercises.chips.remove', { label: track })).toBe(`הסר ${track}`);
    for (const location of ['park', 'home']) {
      expect(t('exercises.chips.location', { location })).toBe(location === 'park' ? 'פארק' : 'בית');
      expect(t('exercises.filters.locationOption', { location })).toBe(location === 'park' ? 'פארק' : 'בית');
    }
    expect(t('exercises.filters.show', { count: String(1200) })).toBe(`הצג ${1200} תרגילים`);
    expect(t('exercises.card.level', { level: String(7) })).toBe(`רמה ${7}`);
    expect(t('exercises.detail.facts.levelValue', { level: String(7) })).toBe(`רמה ${7}`);
    expect(t('exercises.programSwitcher.option', { label: 'דחיפה', level: String(4) })).toBe(`${'דחיפה'} · רמה ${4}`);

    // ChainNode v2: caption = lower ? 'קודם' : same ? 'עכשיו' : 'הבא'; `{caption} · רמה {level}`
    for (const variant of ['lower', 'same', 'higher'] as const) {
      const caption = variant === 'lower' ? 'קודם' : variant === 'same' ? 'עכשיו' : 'הבא';
      expect(t('exercises.detail.chain.node', { variant, level: String(9) })).toBe(`${caption} · רמה ${9}`);
    }

    // performance card
    expect(t('exercises.detail.perf.sessions', { count: String(1200) })).toBe(`${1200} אימונים`);
    for (const days of [0, 1, 4, 15, 95, 4000]) {
      const old = (d: number) => {
        if (d <= 0) return 'היום';
        if (d === 1) return 'אתמול';
        if (d < 7) return `לפני ${d} ימים`;
        if (d < 30) return `לפני ${Math.floor(d / 7)} שבועות`;
        return `לפני ${Math.floor(d / 30)} חודשים`;
      };
      const now =
        days <= 0 ? t('exercises.detail.perf.when.today')
        : days === 1 ? t('exercises.detail.perf.when.yesterday')
        : days < 7 ? t('exercises.detail.perf.when.days', { n: String(days) })
        : days < 30 ? t('exercises.detail.perf.when.weeks', { n: String(Math.floor(days / 7)) })
        : t('exercises.detail.perf.when.months', { n: String(Math.floor(days / 30)) });
      expect(now, String(days)).toBe(old(days));
      expect(t('exercises.detail.perf.lastSets', { sets: String(3), when: now })).toBe(`ביצעת ${3} סטים ${old(days)}`);
      expect(t('exercises.detail.perf.last', { when: now })).toBe(`אימון אחרון ${old(days)}`);
    }

    // LocationVariantSwitcher: LOCATION_META[loc]?.label ?? loc (verbatim)
    const LOCATION_META: Record<string, string> = {
      home: 'בית', park: 'פארק', gym: 'חדר כושר', street: 'רחוב', office: 'משרד', school: 'בית ספר',
      airport: 'שדה תעופה', library: 'ספרייה', desk: 'שולחן', service: 'צבא/שירות',
    };
    for (const location of [...Object.keys(LOCATION_META), 'beach', '']) {
      expect(t('exercises.locationSwitcher.location', { location }), location).toBe(LOCATION_META[location] ?? location);
    }
  });

  it('no exercises.* key is left untested', () => {
    expect(Object.keys(he).filter((k) => k.startsWith('exercises.')).length).toBe(95);
  });
});
