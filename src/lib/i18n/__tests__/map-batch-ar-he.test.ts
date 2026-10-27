/**
 * Namespace `map`, batch ar (wizard.* / safecity.* / plannedActivity.* / plus.* / navHub.* / bottomNav.* / slotCard.* /
 * mapLayers.* / freeRun.*): the states the static parity snapshots can't reach (taps, fetches, sheets that open on a
 * tap, async errors, share texts) return exactly what the components rendered before the extraction. Old literals /
 * templates copied verbatim from origin/main. Own file so parallel map batches don't conflict.
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/map.json';
import { map } from '@/messages/ns/map';
import { makeT } from '../t';

const t = makeT('he', map);
type Key = keyof typeof he;
const g = (gender: string | undefined, male: string, female: string, other: string) =>
  (gender === 'female' ? female : gender === 'male' ? male : other);

describe('map (he) — batch ar, byte-identical to the pre-extraction literals', () => {
  it('wizard: states behind a tap / fetch', () => {
    const cases: Array<[Key, string]> = [
      ['wizard.duplicate.title', 'מיקום קרוב כבר קיים'],
      ['wizard.equipment.selected', 'נבחרו: '],
      ['wizard.equipment.emptyCatalog', 'אין מתקני-פארק בקטלוג'],
      ['wizard.equipment.noMatch', 'לא נמצאו מתקנים'],
      ['wizard.skip', 'דלג'],
      ['wizard.checking', 'בודק...'],
      ['wizard.sending', 'שולח...'],
      ['wizard.photo.permissionDenied', 'לא ניתן לקבל הרשאות מצלמה/גלריה.'],
      ['wizard.facility.route', 'מסלול'],
      ['wizard.suggest.changes', 'שינויים:'],
      ['wizard.suggest.submit', 'שלח עדכון ✏️'],
      ['wizard.report.submitClassic', 'שלח דיווח ⚡'],
      ['wizard.photo.submitClassic', 'שלח לאישור 🚀'],
      ['wizard.summary.titleClassic', 'סיכום:'],
    ];
    for (const [key, old] of cases) expect(t(key), key).toBe(old);
    const name = 'פארק הירקון';
    expect(t('wizard.duplicate.body', { name })).toBe(`"${name}" נמצא פחות מ-50 מטר. נסו מיקום אחר.`);
    expect(t('wizard.summary.equipment', { names: ['מקבילים', 'מתח'].join(', ') })).toBe(`מתקנים: ${['מקבילים', 'מתח'].join(', ')}`);
    expect(t('wizard.summary.features', { count: String(3) })).toBe(`${3} תכונות`);
    expect(t('wizard.suggest.title', { name })).toBe(`עדכן פרטים — ${name}`);
    for (const gender of ['female', 'male', 'other'])
      expect(t('wizard.photo.uploadError', { gender })).toBe(g(gender, 'שגיאה בהעלאת התמונה. נסה שוב.', 'שגיאה בהעלאת התמונה. נסי שוב.', 'שגיאה בהעלאת התמונה. נסו שוב.'));
  });

  it('safecity: invite message, copy state, privacy dropdown', () => {
    // generateInviteMessage(location, inviteLink, senderGender) before the extraction
    const old = (location: string, inviteLink: string, gender: string) => {
      const me = g(gender, `אני מתאמן ב${location} עם Out`, `אני מתאמנת ב${location} עם Out`, `אני ב-Out ב${location}`);
      return `היי! ${me} — בואו להצטרף אליי ונפתח ביחד את מפת השותפים ודירוגי הליגה! 🤘 ${inviteLink}`;
    };
    for (const gender of ['female', 'male', 'other'])
      expect(t('safecity.viral.invite', { location: 'תל אביב', link: 'https://x.test/?ref=u1', gender })).toBe(old('תל אביב', 'https://x.test/?ref=u1', gender));
    const cases: Array<[Key, string]> = [
      ['safecity.viral.fallbackLocation', 'השכונה שלך'],
      ['safecity.viral.shareTitle', 'Out — בואו להתאמן איתי!'],
      ['safecity.viral.copied', 'הקישור הועתק!'],
      ['safecity.viral.copy', 'העתק קישור'],
      ['safecity.viral.qrHint', 'תן לשותף לסרוק — ייכנס ישירות לאפליקציה'],
      ['safecity.privacy.aria', 'הגדרות פרטיות'],
      ['safecity.privacy.title', 'מצב נראות'],
      ['safecity.privacy.ghost.label', 'רוח'],
      ['safecity.privacy.ghost.sublabel', 'לא נראה לאף אחד'],
      ['safecity.privacy.squad.label', 'חברים'],
      ['safecity.privacy.squad.sublabel', 'רק מי שאני עוקב אחריו'],
      ['safecity.privacy.verified_global.label', 'גלובלי'],
      ['safecity.privacy.verified_global.sublabel', 'כל המאומתים בקבוצת הגיל שלי'],
    ];
    for (const [key, o] of cases) expect(t(key), key).toBe(o);
    expect(t('safecity.viral.progress', { count: String(1), goal: String(1) })).toBe(`(${1}/${1}) שותפים הצטרפו`);
    expect(t('safecity.overlay.squad', { count: String(4) })).toBe(`חברים — ${4} סביבך`);
    expect(t('safecity.overlay.global', { count: String(1234) })).toBe(`גלובלי — ${1234} מאומתים`);
    expect(t('safecity.overlay.active', { count: String(1234) })).toBe(`${1234} פעילים באזור`);
    expect(t('safecity.kudo.title', { name: 'נועה' })).toBe('נועה שלח/ה לך High Five!');
  });

  it('plannedActivity + plus drawer', () => {
    const cases: Array<[Key, string]> = [
      ['plannedActivity.label.where', 'איפה '],
      ['plannedActivity.where.route', 'מסלול'],
      ['plannedActivity.where.park', 'פארק'],
      ['plannedActivity.parks.loading', 'טוען פארקים...'],
      ['plannedActivity.routes.loading', 'טוען מסלולים...'],
      ['plannedActivity.routes.empty', 'לא נמצאו מסלולים בקרבתך'],
      ['plannedActivity.day.today', 'היום'],
      ['plannedActivity.day.tomorrow', 'מחר'],
      ['plannedActivity.saving', 'שומר...'],
      ['plannedActivity.noLevel', 'עדיין לא הגדרת תוכנית/רמת כוח'],
      ['plus.row.addWorkout.label', 'הוספת אימון ללו״ז'],
      ['plus.row.invite.sublabel', '+50 נק׳ לשכונה ולעיר שלך כשהוא מצטרף'],
    ];
    for (const [key, o] of cases) expect(t(key), key).toBe(o);
    const program = 'כל הגוף'; const level = 7;
    expect(t('plannedActivity.level', { program, level: String(level) })).toBe(`${program} · רמה ${level}`);
    expect(t('plannedActivity.level', { program: '', level: String(level) })).toBe(` · רמה ${level}`);
    const link = 'https://x.test/?ref=u1';
    expect(t('plus.invite.text', { link })).toBe(`בוא/י להתאמן איתי ב-OUT 💪 ${link}`);
  });

  it('map layers: builder card, planned preview, free run', () => {
    const cases: Array<[Key, string]> = [
      ['mapLayers.builder.title', 'בחר מסלול'],
      ['mapLayers.builder.generating', 'מייצר מסלולים...'],
      ['mapLayers.builder.routeFallback', 'מסלול'],
      ['mapLayers.builder.error', 'לא הצלחנו לייצר מסלולים כרגע.'],
      ['mapLayers.builder.empty', 'אין מסלולים זמינים. נסה להגדיר מחדש.'],
      ['mapLayers.builder.start', 'התחל מסלול'],
      ['mapLayers.builder.changeSettings', 'שנה הגדרות'],
      ['mapLayers.planned.preparing', 'מכין את האימון...'],
      ['mapLayers.planned.loading', 'טוען אימון מתוכנן...'],
      ['mapLayers.planned.details', 'פרטי האימון'],
      ['mapLayers.planned.cancel', 'ביטול'],
      ['mapLayers.freeRun.discover', 'גלה'],
      ['mapLayers.freeRun.free', 'חופשי'],
      ['mapLayers.freeRun.start', 'התחל ריצה חופשית'],
      ['mapLayers.activity.cycling', 'אופניים'],
    ];
    for (const [key, o] of cases) expect(t(key), key).toBe(o);
    expect(t('mapLayers.planned.blocks', { count: String(5) })).toBe(`${5} בלוקים`);
    expect(t('mapLayers.planned.blockN', { n: String(3) })).toBe(`בלוק ${3}`);
    expect(t('mapLayers.freeRun.together', { count: String(3) })).toBe(`${3} רצים יחד`);
    expect(t('mapLayers.navigate.destination', { address: 'הרצל 5' })).toBe('יעד: הרצל 5');
    for (const gender of ['female', 'male', 'other']) {
      expect(t('mapLayers.builder.retry', { gender })).toBe(g(gender, 'נסה שוב', 'נסי שוב', 'נסו שוב'));
      expect(t('mapLayers.planned.start', { gender })).toBe(g(gender, 'התחל אימון', 'התחילי אימון', 'יוצאים לאימון'));
    }
  });

  it('navHub', () => {
    expect(t('navHub.recents.remove', { text: 'פארק הירקון' })).toBe('הסר את פארק הירקון מההיסטוריה');
    const cases: Array<[Key, string]> = [
      ['navHub.activity.walking', 'הליכה'], ['navHub.activity.running', 'ריצה'], ['navHub.activity.cycling', 'רכיבה'],
    ];
    for (const [key, o] of cases) expect(t(key), key).toBe(o);
  });

  it('freeRun: sheets, extras, weight row, scheduled mode, share text', () => {
    const cases: Array<[Key, string]> = [
      ['freeRun.close', 'סגור'],
      ['freeRun.title', 'אירובי חופשי'],
      ['freeRun.extras.title', 'הגדרות נוספות'],
      ['freeRun.extras.gymParks', 'עבור דרך גינות כושר'],
      ['freeRun.extras.trail', 'שבילי עפר'],
      ['freeRun.extras.shade', 'המסלול המוצל ביותר'],
      ['freeRun.extras.circularClassic', 'מעגלי'],
      ['freeRun.extras.benchesClassic', 'עבור דרך ספסלים'],
      ['freeRun.extras.stairsClassic', 'עבור דרך מדרגות'],
      ['freeRun.extras.trailClassic', 'שבילי עפר (Trail)'],
      ['freeRun.extras.done', 'סיום'],
      ['freeRun.extras.close', 'סגור'],
      ['freeRun.weight.title', 'משקלך לחישוב מדויק'],
      ['freeRun.weight.titleClassic', '⚖️ משקלך לחישוב מדויק'],
      ['freeRun.weight.hint', 'עדיין לא הזנת משקל — הערך הנוכחי הוא ברירת מחדל. כדי שחישוב הקלוריות יהיה מדויק, שווה לעדכן.'],
      ['freeRun.weight.decrease', 'הפחתת ק״ג'],
      ['freeRun.weight.increase', 'הוספת ק״ג'],
      ['freeRun.weight.inputAria', 'משקל בקילוגרם'],
      ['freeRun.weight.save', 'שמירה'],
      ['freeRun.goalSheet.calories', 'קלוריות'],
      ['freeRun.goalSheet.caloriesClassic', '🔥 קלוריות'],
      ['freeRun.goalSheet.timeClassic', '⏱ זמן'],
      ['freeRun.goalSheet.distanceClassic', '📏 מרחק'],
      ['freeRun.goalSheet.moreSettingsNote', 'חלות על "עם מסלול"'],
      ['freeRun.legPlan.compiling', 'מרכיב מסלול...'],
      ['freeRun.legPlan.startClassic', '🏁 התחל ריצה'],
      ['freeRun.saving', 'שומר...'],
      ['freeRun.saveToWorkouts', 'שמור לאימונים'],
      ['freeRun.saveToWorkoutsClassic', '✓ שמור לאימונים'],
      ['freeRun.hybrid.startAria', 'התחל אימון משולב'],
      ['freeRun.hybrid.start', 'התחל משולב'],
      ['freeRun.hybrid.startClassic', '💪🏃 התחל משולב'],
    ];
    for (const [key, o] of cases) expect(t(key), key).toBe(o);
    expect(t('freeRun.units.calories', { n: String(350) })).toBe(`${350} קק״ל`);
    expect(t('freeRun.legPlan.max', { max: String(8) })).toBe(`מקסימום ${8} עצירות`);
    expect(t('freeRun.legPlan.maxReachedClassic', { max: String(8) })).toBe(`הגעת למספר המרבי של עצירות (${8})`);
    expect(t('freeRun.legPlan.stopN', { n: String(2) })).toBe(`עצירה ${2}`);
    expect(t('freeRun.goalSheet.pendingChange', { label: 'דיזנגוף 10' })).toBe(`📍 ${'דיזנגוף 10'} · שינוי`);
    expect(t('freeRun.goalSheet.addStopsClassic', { suffix: '' })).toBe('🧭 הוספת עצירות בדרך');
    expect(t('freeRun.goalSheet.addStopsClassic', { suffix: ` (${2})` })).toBe(`🧭 הוספת עצירות בדרך (${2})`);
    expect(t('freeRun.entry.cityNote', { city: 'חיפה' })).toBe('מסלולים יוצרו בחיפה');
    const dateLabel = '28.10'; const schedTime = '18:00'; const shareUrl = 'https://x.test/r/1';
    expect(t('freeRun.share.walking', { date: dateLabel, time: schedTime, url: shareUrl }))
      .toBe(`קבעתי הליכה ב-${dateLabel} בשעה ${schedTime} 🚶 בוא/י להצטרף! ${shareUrl}`);
    expect(t('freeRun.share.running', { date: dateLabel, time: schedTime, url: shareUrl }))
      .toBe(`קבעתי ריצה ב-${dateLabel} בשעה ${schedTime} 🏃 בוא/י להצטרף! ${shareUrl}`);
  });
});

describe('map (he) — batch ar, map shell / discover layer / live user sheet', () => {
  it('plain strings', () => {
    const cases: Array<[Key, string]> = [
      ['mapLayers.referralToast', `שותף חדש הצטרף לנבחרת! עכשיו אווטיר ב-Out 🤘`],
      ['mapLayers.discover.speedDial.report', 'דיווח מהיר'],
      ['mapLayers.discover.speedDial.add', 'הוסף מיקום'],
      ['mapLayers.discover.plusAria', 'הוסף'],
      ['mapLayers.discover.hybridTitle', 'אימון משולב'],
      ['mapLayers.discover.searchArea', 'חפש באזור זה'],
      ['mapLayers.discover.suggestions', 'הצעות מסלולים'],
      ['mapLayers.discover.composing', 'מכין אימון משולב…'],
      ['mapLayers.mockLocation.label', 'מיקום מדומה'],
      ['parkCard.navigateClassic', 'נווט לפארק'],
      ['liveUser.activity.running', 'רץ/ה עכשיו'],
      ['liveUser.activity.walking', 'הולך/ת עכשיו'],
      ['liveUser.activity.cycling', 'רוכב/ת עכשיו'],
      ['liveUser.activity.strength', 'מתאמן/ת עכשיו'],
      ['liveUser.viewProfile', 'צפה בפרופיל'],
      ['liveUser.sendMessage', 'שלח הודעה'],
      ['liveUser.minorLock', 'הודעות ישירות זמינות רק לבני 18+'],
    ];
    for (const [key, old] of cases) expect(t(key), key).toBe(old);
  });
  it('values', () => {
    const label = 'תל אביב';
    expect(t('mapLayers.mockLocation.confirm', { label }))
      .toBe(`מיקום מדומה פעיל (${label}) — האימון יעקוב אחרי המיקום המדומה, לא GPS אמיתי. להמשיך?`);
    expect(t('liveUser.stageFallback', { stage: String(7) })).toBe(`שלב ${7}`);
    // legacy (flag-off) park card used `${machineCount} מתקנים`, now the shared parkCard.machines
    expect(t('parkCard.machines', { count: String(1234) })).toBe(`${1234} מתקנים`);
  });
});
