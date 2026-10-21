/**
 * i18n wave 2 (namespace `onboarding`, keys `steps.*` + `location.*`): every key the onboarding
 * steps / location sheets extraction added must equal the OLD literal or template, copied verbatim
 * from origin/main — including what a render can't reach (a rule-engine error title, a count
 * >= 1000, every select / gender branch, unknown ids). Keys are counted per prefix (other batches
 * add keys to the same namespace file).
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/onboarding.json';
import { onboarding } from '@/messages/ns/onboarding';
import { makeT } from '../t';

const t = makeT('he', onboarding);
type Key = Parameters<typeof t>[0];
const GENDERS = ['female', 'male', 'other', undefined, 'weird'] as const;
/** The old two-way pick: female → f, anything else → m. */
const g = (gender: string | undefined, m: string, f: string) => (gender === 'female' ? f : m);
/** A rich-text tag that keeps its chunks as they are (the test compares the joined text). */
const keep = (chunks: unknown[]) => chunks;

describe('onboarding steps + location keys (he)', () => {
  it('key counts per prefix', () => {
    const keys = Object.keys(he);
    expect(keys.filter((k) => k.startsWith('steps.')).length).toBe(130);
    expect(keys.filter((k) => k.startsWith('location.')).length).toBe(53);
  });

  it('plain strings = the old literals', () => {
    const cases: Array<[Key, string]> = [
    ["location.initial.headline.default", "להכיר את השכונה, מקרוב"],
    ["location.initial.subtitle.running", "נמצא לך מסלול ריצה וגם גינות כושר בדרך"],
    ["location.initial.subtitle.default", "כדי שנוכל להציג את מסלולי ההליכה, גינות הכושר והמקומות הכי בטוחים וקרובים אליכם, יש לאשר גישה למיקום."],
    ["location.initial.gps", "מציאת מיקום אוטומטית (GPS)"],
    ["location.initial.manual", "בחירת עיר ושכונה באופן ידני"],
    ["location.locating.title", "מאתרים את המיקום שלך..."],
    ["location.locating.manual", "לוקח זמן? חיפוש ידני"],
    ["location.search.back", "חזרה"],
    ["location.search.placeholder", "חפשו עיר או שכונה"],
    ["location.search.clear", "נקה חיפוש"],
    ["location.search.noResultsHint", "נסו לחפש עיר או שכונה אחרת"],
    ["location.confirm.updating", "מעדכן מיקום..."],
    ["location.confirm.explorer.body", "מצוין! כאן יוצגו מסלולי ההליכה, הגינות ומתקני הכושר הקרובים המומלצים ביותר אליכם. הכל בחינם וללא ציוד."],
    ["location.confirm.nearest.body", "מצוין! כאן יוצגו מסלולי ההליכה, הגינות ומתקני הכושר הקרובים המומלצים ביותר אליכם. ניתן לגרור את המפה לדיוק המיקום."],
    ["location.confirm.dragHint", "גררו את המפה כדי לדייק את המיקום"],
    ["location.confirm.loadingData", "טוען נתונים..."],
    ["location.confirm.bestAlternative", "האלטרנטיבה הכי טובה בסביבה"],
    ["location.confirm.cta", "כן, זה הבית שלי!"],
    ["location.confirm.searchOther", "זה לא אזור המגורים שלי, חפשו אזור אחר"],
    ["location.entry.initial.title", "בואו נמצא גינה לידך"],
    ["location.entry.initial.body", "כדי להראות לך את מסלולי ההליכה, גינות הכושר והמקומות הכי קרובים אליך, נבקש גישה למיקום."],
    ["location.entry.initial.cta", "הראו לי מה יש לידי"],
    ["location.entry.initial.manual", "בחירת עיר ושכונה באופן ידני"],
    ["location.entry.dive.pill", "מחפשים גינות ומסלולים לידך…"],
    ["location.entry.dive.manual", "לוקח זמן? חיפוש ידני"],
    ["location.entry.dragHint", "גוררים את המפה כדי לדייק"],
    ["location.entry.confirm.eyebrow", "מצאנו אותך 👋"],
    ["location.entry.confirm.body", "לפי הבית נציג לך גינות, מסלולים ואנשים בשכונה. בחינם, ובלי ציוד."],
    ["location.entry.confirm.nearestPark", "הגינה הכי קרובה לבית"],
    ["location.entry.confirm.parkEquipment.one", "מתקן אחד"],
    ["location.entry.confirm.dragLine", "לא בדיוק? גוררים את המפה עד שהלמור על הבית"],
    ["location.entry.confirm.cta", "כן, זה הבית שלי"],
    ["location.entry.confirm.notHome", "אני לא בבית עכשיו, אחפש את האזור שלי"],
    ["location.entry.search.placeholder", "חפשו עיר או שכונה"],
    ["location.entry.search.cancel", "ביטול"],
    ["location.entry.search.clear", "נקה חיפוש"],
    ["location.entry.search.section.neighborhoods", "שכונות"],
    ["location.entry.search.section.cities", "ערים"],
    ["location.entry.search.noResultsHint", "נסו לחפש עיר או שכונה אחרת"],
    ["steps.stats.cta.save", "שמירת שינויים"],
    ["steps.stats.cta.start", "בואו נתחיל!"],
    ["steps.stats.cta.continue", "המשך"],
    ["steps.stats.cta.saved", "הפרופיל עודכן!"],
    ["steps.stats.title", "מה המשקל שלך?"],
    ["steps.stats.subtitle", "נשתמש בזה כדי לחשב את צריכת הקלוריות ולהתאים תוכנית אישית"],
    ["steps.stats.unitKg", "ק״ג"],
    ["steps.processing.msg.analyzing", "מנתח העדפות אימון..."],
    ["steps.processing.msg.loads", "מחשב עומסים אופטימליים..."],
    ["steps.processing.msg.health", "מייצר הצהרת בריאות חתומה..."],
    ["steps.processing.msg.dashboard", "מכין את לוח הבקרה האישי שלך..."],
    ["steps.account.error.googleTimeout", "חלון Google לא נפתח. אנא נסה שוב או בחר שיטת התחברות אחרת."],
    ["steps.account.error.googleExists", "חשבון Google זה כבר בשימוש. אנא השתמש בחשבון אחר."],
    ["steps.account.error.popupClosed", "החלון נסגר. אנא נסה שוב."],
    ["steps.account.error.google", "שגיאה בחיבור ל-Google. אנא נסה שוב."],
    ["steps.account.error.appleTimeout", "חלון Apple לא נפתח. אנא נסה שוב או בחר שיטת התחברות אחרת."],
    ["steps.account.error.appleExists", "חשבון Apple זה כבר בשימוש. אנא השתמש בחשבון אחר."],
    ["steps.account.error.apple", "שגיאה בחיבור ל-Apple. אנא נסה שוב."],
    ["steps.account.error.unexpected", "שגיאה בלתי צפויה. אנא נסה שוב."],
    ["steps.account.connecting", "מתחבר..."],
    ["steps.account.continueGoogle", "המשך עם Google"],
    ["steps.account.continueApple", "המשך עם Apple"],
    ["steps.account.skip", "המשך עם פרופיל מקומי (ללא גיבוי)"],
    ["steps.account.warning.title", "המשך ללא גיבוי?"],
    ["steps.account.warning.back", "חזור לאחור"],
    ["steps.account.warning.skip", "המשך בלי גיבוי"],
    ["steps.persona.title", "שנכיר?"],
    ["steps.persona.goalsTitle", "מה המטרות שלך? (עד 2)"],
    ["steps.persona.code.verified", "הקוד אומת!"],
    ["steps.persona.code.title", "יש לך קוד גישה מהארגון?"],
    ["steps.planLength.calendar.prevMonth", "החודש הקודם"],
    ["steps.planLength.calendar.nextMonth", "החודש הבא"],
    ["steps.planLength.title", "לכמה שבועות התוכנית?"],
    ["steps.planLength.subtitle.plain", "אפשר לשנות אחר כך"],
    ["steps.planLength.options.aria", "משך התוכנית"],
    ["steps.planLength.preset.recommended", "מומלץ"],
    ["steps.planLength.race.title", "יש לי מרוץ"],
    ["steps.planLength.race.hint", "בחרו תאריך — נחשב את מספר השבועות"],
    ["steps.planLength.race.pickEnd", "בחרו תאריך סיום"],
    ["steps.planLength.custom.title", "אחר"],
    ["steps.planLength.custom.hint", "4–52 שבועות"],
    ["steps.planLength.custom.aria", "מספר שבועות"],
    ["steps.planLength.cta", "המשך"],
    ["steps.runSchedule.loading", "טוען..."],
    ["steps.runSchedule.time.morning", "בוקר"],
    ["steps.runSchedule.time.noon", "צהריים"],
    ["steps.runSchedule.time.evening", "ערב"],
    ["steps.runSchedule.time.other", "אחר"],
    ["steps.runSchedule.title", "מתי נרוץ?"],
    ["steps.runSchedule.subtitle", "נבנה תוכנית שמתאימה לשבוע שלך"],
    ["steps.runSchedule.loadNotice.line1", "בחרת יותר ימים מהתוכנית הנוכחית שלך."],
    ["steps.runSchedule.loadNotice.line2", "נעדכן אותה בהתאם — ההתקדמות שלך תישמר."],
    ["steps.runSchedule.frequency.title", "כמה ריצות בשבוע?"],
    ["steps.runSchedule.days.title", "באילו ימים?"],
    ["steps.runSchedule.legend.run", "ריצה"],
    ["steps.runSchedule.legend.strength", "כוח"],
    ["steps.runSchedule.legend.rest", "יום מנוחה בין ריצות קשות"],
    ["steps.runSchedule.time.title", "באיזו שעה?"],
    ["steps.schedule.history.freq.none", "לא התאמנתי"],
    ["steps.schedule.history.freq.low", "1-2 פעמים בשבוע"],
    ["steps.schedule.history.freq.high", "3+ פעמים בשבוע"],
    ["steps.schedule.history.loc.studio", "סטודיו/חוגים"],
    ["steps.schedule.history.loc.park", "גינת כושר"],
    ["steps.schedule.history.loc.home", "בית"],
    ["steps.schedule.history.loc.gym", "חדר כושר"],
    ["steps.schedule.history.sport.running", "ריצה"],
    ["steps.schedule.history.sport.swimming", "שחייה"],
    ["steps.schedule.history.sport.yoga", "יוגה/פילאטיס"],
    ["steps.schedule.history.sport.cycling", "רכיבה"],
    ["steps.schedule.history.sport.strength", "כוח"],
    ["steps.schedule.history.sport.cardio", "קרדיו"],
    ["steps.schedule.history.sport.crossfit", "קרוספיט"],
    ["steps.schedule.title", "מתי נתאמן?"],
    ["steps.schedule.subtitle", "נתאים את התוכנית לזמינות שלך"],
    ["steps.schedule.recommendation.title", "המלצה שלנו"],
    ["steps.schedule.recommendation.startSlow", "היי, שמנו לב שלא התאמנת הרבה זמן. אנחנו ממליצים להתחיל מ-1-2 פעמים בשבוע כדי לבנות בסיס חזק."],
    ["steps.schedule.history.title", "איך נראתה שגרת האימונים שלך בחודש האחרון?"],
    ["steps.schedule.history.whereTitle", "איפה התאמנת בדרך כלל?"],
    ["steps.schedule.history.sportsTitle", "באילו ענפי ספורט?"],
    ["steps.schedule.frequency.title", "כמה פעמים בשבוע?"],
    ["steps.schedule.frequency.recommended", "מומלץ עבורך"],
    ["steps.schedule.days.title", "באילו ימים?"],
    ["steps.schedule.days.calendarSync", "סנכרון ליומן"],
    ["steps.schedule.popover.rest", "יום מנוחה"],
    ["steps.schedule.popover.done", "סיימתי"],
    ["steps.schedule.warnings.errorsTitle", "שגיאות חובה לתקן"],
    ["steps.schedule.warnings.warnsTitle", "אזהרות מהמנוע החכם"],
    ["steps.schedule.cta.save", "שמירת שינויים"],
    ["steps.schedule.cta.start", "בואו נתחיל!"],
    ["steps.schedule.cta.saved", "הלו״ז עודכן!"],
    ];
    for (const [key, old] of cases) expect(t(key), key).toBe(old);
  });

  it('location: values and gender branches', () => {
    for (const gender of ['male', 'female'] as const) {
      const isFemale = gender === 'female';
      expect(t('location.initial.headline.running', { gender })).toBe(
        `${isFemale ? 'בואי' : 'בוא'} נאשר מיקום כדי שנטען את אימון הריצה שלך`,
      );
    }
    const place = 'הצפון הישן';
    expect(t('location.initial.headline.nearest', { place })).toBe(`הגינה הכי קרובה ל${place}`);
    expect(t('location.search.noResults', { query: 'זז{x}' })).toBe(`לא נמצאו תוצאות עבור "זז{x}"`);
    expect(t('location.confirm.explorer.title', { place })).toBe(`מצאנו את הסביבה הקרובה ביותר ל${place}`);
    expect(t('location.confirm.nearest.title', { place })).toBe(`הגינה הכי קרובה ל${place}`);
    expect(t('location.confirm.cityRating', { rating: (4.25).toFixed(1) })).toBe(`${(4.25).toFixed(1)} דירוג עירוני`);
    // the greeting is a rich message: its text equals the old two spans + ", "
    expect(t.rich('location.confirm.greeting', { name: 'דנה', intro: 'X', hi: keep, hook: keep }).flat().join('')).toBe(
      'היי דנה, X',
    );
    for (const gender of ['male', 'female', 'other', 'weird']) {
      const old = gender === 'female'
        ? 'את הולכת להיות החלוצה הראשונה שתמפה את השכונה!'
        : 'אתה הולך להיות החלוץ הראשון שימפה את השכונה!';
      expect(t('location.confirm.pioneerLine', { gender })).toBe(old);
      expect(t('location.entry.confirm.pioneerLine', { gender })).toBe(old);
    }
    expect(t('location.entry.confirm.title', { place })).toBe(`גרים ב${place}?`);
    for (const n of [2, 6, 1234]) expect(t('location.entry.confirm.parkEquipment.many', { n: String(n) })).toBe(`${n} מתקנים`);
    const CHIP: Record<string, string> = { all: 'הכל', neighborhoods: 'שכונות', cities: 'ערים' };
    for (const filter of ['all', 'neighborhoods', 'cities'])
      for (const count of [0, 7, 1234])
        expect(t('location.entry.search.chip', { filter, count: String(count) })).toBe(`${CHIP[filter]} · ${count}`);
    const placeType = (type: string | undefined) => {
      switch (type) {
        case 'city': return 'עיר';
        case 'regional_council': return 'מועצה אזורית';
        case 'local_council': return 'מועצה מקומית';
        default: return 'יישוב';
      }
    };
    for (const type of ['city', 'regional_council', 'local_council', 'neighborhood', 'settlement', 'kibbutz', '', undefined])
      expect(t('location.entry.search.placeType', { type: type ?? '' })).toBe(placeType(type));
    expect(t('location.entry.search.noResults', { query: 'רמ' })).toBe(`לא נמצאו תוצאות עבור "רמ"`);
  });

  it('processing: every persona × gender (verbatim copy of the old maps)', () => {
    const PERSONA_LABELS: Record<string, string> = {
      parent: 'הורה', student: 'סטודנט/ית', pupil: 'תלמיד/ה', office_worker: 'עובד/ת משרד',
      military: 'חייל/ת', vatikim: 'גיל הזהב', pro_athlete: 'ספורטאי/ת קצה',
    };
    const PERSONA_LABELS_V2: Record<string, { m: string; f: string }> = {
      parent: { m: 'הורה', f: 'הורה' }, student: { m: 'סטודנט', f: 'סטודנטית' }, pupil: { m: 'תלמיד', f: 'תלמידה' },
      office_worker: { m: 'עובד משרד', f: 'עובדת משרד' }, military: { m: 'חייל', f: 'חיילת' },
      vatikim: { m: 'גיל הזהב', f: 'גיל הזהב' }, pro_athlete: { m: 'ספורטאי קצה', f: 'ספורטאית קצה' },
    };
    for (const persona of [...Object.keys(PERSONA_LABELS), 'reservist', 'soldier', '']) {
      expect(t('steps.processing.persona', { persona })).toBe(PERSONA_LABELS[persona] || 'המשתמש');
      for (const gender of ['male', 'female'] as const)
        expect(t('steps.processing.personaGendered', { persona, gender })).toBe(
          PERSONA_LABELS_V2[persona]?.[gender === 'female' ? 'f' : 'm'] ?? '',
        );
    }
    expect(t('steps.processing.msg.building', { persona: 'סטודנטית' })).toBe(`בונה תוכנית מותאמת לפרסונת ${'סטודנטית'}...`);
  });

  it('running summary: every distance (verbatim copy of the old map)', () => {
    const DIST: Record<string, string> = { '2k': '2 ק״מ', '3k': '3 ק״מ', '5k': '5 ק״מ', '10k': '10 ק״מ', maintenance: 'שמירה על כושר' };
    for (const dist of Object.keys(DIST)) expect(t('steps.runSummary.dist', { dist })).toBe(DIST[dist]);
  });

  it('account: name, gender branches, rich warning text', () => {
    expect(t('steps.account.title', { name: 'OUTer' })).toBe(`${'OUTer'}, התוכנית שלך מוכנה!`);
    const join = (parts: unknown[]) => parts.flat().join('');
    expect(join(t.rich('steps.account.warning.localOnly', { b: keep }))).toBe(
      'הצהרת הבריאות החתומה שלך והיסטוריית האימונים שלך מאוחסנים כרגע רק במכשיר זה.',
    );
    for (const gender of GENDERS) {
      const isFemale = gender === 'female';
      expect(t('steps.account.subtitle', { gender })).toBe(
        isFemale ? 'בואי נבטיח שהיא לא תלך לאיבוד.' : 'בוא נבטיח שהיא לא תלך לאיבוד.',
      );
      expect(join(t.rich('steps.account.warning.loss', { gender, b: keep }))).toBe(
        (isFemale ? 'אם תמחקי את האפליקציה, תחליפי מכשיר, או תנקי נתונים — ' : 'אם תמחק את האפליקציה, תחליף מכשיר, או תנקה נתונים — ') +
          (isFemale ? 'תאבדי את כל ההתקדמות שלך' : 'תאבד את כל ההתקדמות שלך') + '.',
      );
      expect(t('steps.account.warning.secureLater', { gender })).toBe(
        isFemale ? 'תוכלי לאבטח את החשבון שלך בכל עת מהדאשבורד הראשי.' : 'תוכל לאבטח את החשבון שלך בכל עת מהדאשבורד הראשי.',
      );
    }
  });

  it('persona: labels, mad-libs, hints, gendered copy', () => {
    const LABELS: Record<string, [string, string]> = {
      parent: ['אבא', 'אמא'], student: ['סטודנט', 'סטודנטית'], pupil: ['תלמיד', 'תלמידה'],
      office_worker: ['עובד משרד', 'עובדת משרד'], military: ['צה"ל', 'צה"ל'], vatikim: ['גיל הזהב', 'גיל הזהב'],
      pro_athlete: ['ספורטאי קצה', 'ספורטאית קצה'],
    };
    for (const gender of GENDERS) {
      for (const [persona, [m, f]] of Object.entries(LABELS))
        expect(t('steps.persona.label', { persona, gender })).toBe(gender === 'female' ? f : m);
      expect(t('steps.persona.madlib.many', { gender })).toBe(gender === 'female' ? 'פעילה במגוון תחומים' : 'פעיל במגוון תחומים');
      expect(t('steps.persona.hint.persona', { gender })).toBe(g(gender, 'בחר לפחות פרסונה אחת', 'בחרי לפחות פרסונה אחת'));
      expect(t('steps.persona.hint.personaGoal', { gender })).toBe(
        g(gender, 'בחר לפחות פרסונה אחת ומטרה אחת', 'בחרי לפחות פרסונה אחת ומטרה אחת'),
      );
      expect(t('steps.persona.intro', { gender })).toBe(
        g(
          gender,
          'כדי שנבנה לך את לו״ז האימונים המדויק ביותר עבור הסגנון והמטרות שלך – בחר את התפקיד שמקשר ומאפיין אותך הכי טוב.',
          'כדי שנבנה לך את לו״ז האימונים המדויק ביותר עבור הסגנון והמטרות שלך – בחרי את התפקיד שמקשר ומאפיין אותך הכי טוב.',
        ),
      );
      expect(t('steps.persona.continue', { gender })).toBe(g(gender, 'המשך', 'המשיכי'));
      expect(t('steps.persona.code.continue', { gender })).toBe(g(gender, 'המשך', 'המשיכי'));
    }
    expect(t('steps.persona.label', { persona: 'nobody', gender: 'male' })).toBe('');
    const [a, b, c] = ['אבא', 'סטודנט', 'צה"ל'];
    expect(t('steps.persona.madlib.two', { a, b })).toBe(`${a} ו${b}`);
    expect(t('steps.persona.madlib.three', { a, b, c })).toBe(`${a}, ${b} ו${c}`);
    expect(t('steps.persona.madlib.goalsTwo', { a: String(undefined), b: 'להיות בכושר' })).toBe(`${undefined} ו${'להיות בכושר'}`);
    expect(t('steps.persona.greeting', { name: 'דנה' })).toBe(`היי ${'דנה'}, `);
    const join = (parts: unknown[]) => parts.flat().join('');
    expect(join(t.rich('steps.persona.madlib.sentence', { persona: '___', who: keep }))).toBe('אני ___');
    expect(join(t.rich('steps.persona.madlib.sentenceGoals', { persona: 'אבא', goals: '___', who: keep, what: keep }))).toBe(
      'אני אבא שרוצה ___',
    );
  });

  it('plan length: distances, weeks, dates', () => {
    const PLAN_DIST: Record<string, string> = { '2k': '2 ק״מ', '3k': '3 ק״מ', '5k': '5 ק״מ', '10k': '10 ק״מ' };
    for (const dist of Object.keys(PLAN_DIST)) {
      expect(t('steps.planLength.dist', { dist })).toBe(PLAN_DIST[dist]);
      expect(t('steps.planLength.subtitle.withDist', { dist: PLAN_DIST[dist] })).toBe(
        `בונים עד ל-${PLAN_DIST[dist]} · אפשר לשנות אחר כך`,
      );
    }
    const V2_PRESET_LABELS: Record<number, string> = { 8: 'מהיר', 10: 'מאוזן', 12: 'מדורג ובטוח' };
    const date = '13 בדצמבר';
    for (const weeks of [8, 10, 12]) {
      expect(t('steps.planLength.preset.weeks', { weeks: String(weeks) })).toBe(`${weeks} שבועות`);
      expect(t('steps.planLength.preset.line', { weeks: String(weeks), date })).toBe(`${V2_PRESET_LABELS[weeks]} · עד ${date}`);
    }
    for (const weeks of [4, 52, 1234]) {
      expect(t('steps.planLength.race.chosen', { date, weeks: String(weeks) })).toBe(`${date} · ${weeks} שבועות`);
      expect(t('steps.planLength.custom.chosen', { weeks: String(weeks), date })).toBe(`${weeks} שבועות · עד ${date}`);
      expect(t('steps.planLength.custom.value', { weeks: String(weeks) })).toBe(`${weeks} שבועות`);
    }
  });

  it('running schedule: counts, meanings, aria labels', () => {
    const V2_FREQUENCY_MEANING: Record<number, string> = { 2: 'התחלה רכה', 3: 'מומלץ עבורך', 4: 'למתקדמים' };
    for (const n of [1, 2, 3, 4, 5]) {
      expect(t('steps.runSchedule.frequencyMeaning', { n: String(n) })).toBe(V2_FREQUENCY_MEANING[n] ?? '');
      expect(t('steps.runSchedule.frequency.aria', { n: String(n) })).toBe(`${n} ימים בשבוע`);
    }
    const days = ['ב', 'ד'].join(', ');
    expect(t('steps.runSchedule.hybridNotice', { days })).toBe(
      `ימי הכוח שלך (${days}) מסומנים במשקולת. אפשר לבחור בהם גם ריצה — שני האימונים יופיעו באותו יום בלוז.`,
    );
    expect(t('steps.runSchedule.days.count', { selected: '2', total: '3' })).toBe(`${2} מתוך ${3} נבחרו`);
    for (const isStrength of [true, false])
      expect(t('steps.runSchedule.days.aria', { day: 'שני', strength: isStrength ? 'yes' : 'no' })).toBe(
        `${'שני'}${isStrength ? ' (יום כוח)' : ''}`,
      );
  });

  it('schedule: counts, aria, popover, gendered copy', () => {
    for (const gender of GENDERS) {
      expect(t('steps.schedule.recommendation.atLeastTwo', { gender })).toBe(
        g(
          gender,
          'שים לב, ראינו שיש לך רקע קודם. אנחנו ממליצים לשלב לפחות 2 אימונים בשבוע. אל תדאג, אנחנו נעזור לך!',
          'שימי לב, ראינו שיש לך רקע קודם. אנחנו ממליצים לשלב לפחות 2 אימונים בשבוע. אל תדאגי, אנחנו נעזור לך!',
        ),
      );
      expect(t('steps.schedule.time.title', { gender })).toBe(g(gender, 'באיזו שעה אתה מתאמן?', 'באיזו שעה את מתאמנת?'));
      expect(t('steps.schedule.cta.continue', { gender })).toBe(g(gender, 'המשך', 'המשיכי'));
    }
    expect(t('steps.schedule.days.count', { selected: '3', total: '7' })).toBe(`נבחרו ${3} מתוך ${7} ימים`);
    for (const [isRest, n] of [[true, 0], [false, 1], [false, 2], [false, 1234]] as const)
      expect(t('steps.schedule.days.aria', { day: 'א', rest: isRest ? 'yes' : 'no', n: String(n) })).toBe(
        `${'א'} — ${isRest ? 'יום מנוחה' : `${n} סשנים`}`,
      );
    expect(t('steps.schedule.popover.title', { day: 'ג' })).toBe(`מה מתאמנים ביום ${'ג'}׳?`);
  });
});
