/**
 * Gender copy, batch 2 (owner decisions 21.10.2026 — docs/copy/GENDER-INVENTORY.md §9,
 * src/lib/i18n/gender-copy.ts). Every string this batch changed, asserted for all three
 * genders: male (the old masculine text, kept), female, and unknown / "other" (neutral).
 */
import { describe, expect, it } from 'vitest';
import { community } from '@/messages/ns/community';
import { map } from '@/messages/ns/map';
import { player } from '@/messages/ns/player';
import { profile } from '@/messages/ns/profile';
import { home } from '@/messages/ns/home';
import { onboarding } from '@/messages/ns/onboarding';
import { makeT } from '../t';
import { pickGendered, type GenderedText } from '../gender-copy';
import { SETTINGS_COPY } from '@/features/home/components/settings/settings-gender-copy';
import { SUMMARY_COPY } from '@/features/workout-engine/summary/summary-gender-copy';
import { FREE_RUN_COPY } from '@/features/parks/core/components/free-run/free-run-gender-copy';
import { LEAGUE_COPY } from '@/features/arena/components/league-gender-copy';
import { ARENA_CREATE_COPY } from '@/app/arena/create/arena-create-copy';
import { achievementName, ACHIEVEMENT_MAP } from '@/features/user/progression/config/achievement-definitions';

const T: Record<string, (key: string, values?: Record<string, unknown>) => string> = {
  community: makeT('he', community) as never,
  map: makeT('he', map) as never,
  player: makeT('he', player) as never,
  profile: makeT('he', profile) as never,
  home: makeT('he', home) as never,
  onboarding: makeT('he', onboarding) as never,
};

/** [ns:key, male, female, other] */
const CATALOG_CASES: Array<[string, string, string, string]> = [
  ["community:group.dropIn.join", "כן, הצטרף לקבוצה", "כן, הצטרפי לקבוצה", "כן, מצטרפים לקבוצה"],
  ["community:banner.late.toggle", "מאחר?", "מאחרת?", "מאחרים?"],
  ["community:banner.register", "הירשם", "הירשמי", "הרשמה"],
  ["community:banner.onMyWay.done", "בדרך! 🏃", "בדרך! 🏃‍♀️", "בדרך! 🏃"],
  ["community:banner.joinWorkout", "הצטרף לאימון", "הצטרפי לאימון", "מצטרפים לאימון"],
  ["community:banner.ended", "סיימתם! 💪", "סיימתן! 💪", "סיימתם! 💪"],
  ["community:pressure.cta", "📢 שלח הודעה לעירייה", "📢 שלחי הודעה לעירייה", "📢 שליחת הודעה לעירייה"],
  ["community:outreach.school.subtitle", "דבר עם הנהלת בית הספר! שלח הודעה בוואטסאפ וכל הצוות ישמע על Out.", "דברי עם הנהלת בית הספר! שלחי הודעה בוואטסאפ וכל הצוות ישמע על Out.", "דברו עם הנהלת בית הספר! שלחו הודעה בוואטסאפ וכל הצוות ישמע על Out."],
  ["community:outreach.school.cta", "🏫 שלח הודעה להנהלת בית הספר", "🏫 שלחי הודעה להנהלת בית הספר", "🏫 שליחת הודעה להנהלת בית הספר"],
  ["community:outreach.company.subtitle", "דבר עם מחלקת הרווחה / HR ושתפו את הצוות בוואטסאפ.", "דברי עם מחלקת הרווחה / HR ושתפו את הצוות בוואטסאפ.", "דברו עם מחלקת הרווחה / HR ושתפו את הצוות בוואטסאפ."],
  ["community:outreach.company.cta", "🏢 שלח הודעה ל-HR", "🏢 שלחי הודעה ל-HR", "🏢 שליחת הודעה ל-HR"],
  ["community:outreach.youth.subtitle", "דבר עם צוות התנועה ושתפו את החניכים בוואטסאפ.", "דברי עם צוות התנועה ושתפו את החניכים בוואטסאפ.", "דברו עם צוות התנועה ושתפו את החניכים בוואטסאפ."],
  ["community:outreach.youth.cta", "⛺ שלח הודעה לצוות התנועה", "⛺ שלחי הודעה לצוות התנועה", "⛺ שליחת הודעה לצוות התנועה"],
  ["map:partners.empty.live.sub", "היה הראשון — סמן את עצמך פנוי לפני האימון", "היי הראשונה — סמני את עצמך פנויה לפני האימון", "היו הראשונים — סמנו שאתם פנויים לפני האימון"],
  ["map:partners.empty.scheduled.sub", "הוסף אימון ללוז ושתף אותו עם הקהילה", "הוסיפי אימון ללוז ושתפי אותו עם הקהילה", "הוסיפו אימון ללוז ושתפו אותו עם הקהילה"],
  ["player:run.controls.resume", "המשך אימון", "המשיכי אימון", "ממשיכים באימון"],
  ["player:run.free.dock.resume", "המשך אימון", "המשיכי אימון", "ממשיכים באימון"],
  ["player:run.preview.start", "התחל אימון", "התחילי אימון", "יוצאים לאימון"],
  ["player:run.overview.cta.start", "התחל אימון", "התחילי אימון", "יוצאים לאימון"],
  ["player:run.overview.cta.startOnRoute", "התחל אימון במסלול", "התחילי אימון במסלול", "יוצאים לאימון במסלול"],
  ["player:run.missed.doIt", "בוא נעשה את זה", "בואי נעשה את זה", "בואו נעשה את זה"],
  ["player:run.missed.continue", "המשך כרגיל", "המשיכי כרגיל", "ממשיכים כרגיל"],
  ["player:run.vs.pickRival", "בחר רץ במפה להשוואה", "בחרי רץ במפה להשוואה", "בחירת רץ במפה להשוואה"],
  ["map:routePreview.cta.start", "התחל אימון", "התחילי אימון", "יוצאים לאימון"],
  ["map:overview.route.card.choose", "בחר את המסלול הזה", "בחרי את המסלול הזה", "בוחרים את המסלול הזה"],
  ["map:journey.cta.go", "צא לדרך", "צאי לדרך", "יוצאים לדרך"],
  ["map:legPlan.startNowLabel", "התחל ריצה עכשיו", "התחילי ריצה עכשיו", "יוצאים לריצה עכשיו"],
  ["map:legPlan.cta", "התחל עכשיו", "התחילי עכשיו", "מתחילים עכשיו"],
  ["map:carousel.empty.commuteHint", "נסה יעד אחר או החלף סוג פעילות.", "נסי יעד אחר או החליפי סוג פעילות.", "אפשר לנסות יעד אחר או סוג פעילות אחר."],
  ["map:carousel.empty.loopHint", "נסה לשנות את המרחק או את סוג הפעילות.", "נסי לשנות את המרחק או את סוג הפעילות.", "אפשר לשנות את המרחק או את סוג הפעילות."],
  ["profile:steps.error.retry", "נסה שוב מאוחר יותר", "נסי שוב מאוחר יותר", "נסו שוב מאוחר יותר"],
  ["profile:skillTree.node.youAreHere", "אתה כאן", "את כאן", "הרמה שלך"],
  ["profile:skillTree.unassessed.banner", "עדיין לא יודעים את הרמה שלך — בצע מבדק כדי לסמן איפה אתה", "עדיין לא יודעים את הרמה שלך — בצעי מבדק כדי לסמן איפה את", "עדיין לא יודעים את הרמה שלך — מבדק קצר יסמן איפה הרמה שלך"],
  ["profile:steps.connect.cta", "התחבר לאפליקציית הבריאות", "התחברי לאפליקציית הבריאות", "חיבור לאפליקציית הבריאות"],
  ["home:loadAdvisor.onTrack", "אתה בדרך הנכונה! איזון מעולה בין קבוצות השרירים.", "את בדרך הנכונה! איזון מעולה בין קבוצות השרירים.", "בדרך הנכונה! איזון מעולה בין קבוצות השרירים."],
  ["home:programStart.title", "בוא נבנה לך תוכנית", "בואי נבנה לך תוכנית", "בואו נבנה לך תוכנית"],
  ["home:runCard.skip", "אין לי כוח היום — דלג לעוד", "אין לי כוח היום — דלגי לעוד", "אין לי כוח היום — דילוג לעוד"],
  ["home:walkCard.start.today", "צא להליכה", "צאי להליכה", "יוצאים להליכה"],
  ["community:group.next.joinWaitlist", "הצטרף לרשימת המתנה", "הצטרפי לרשימת המתנה", "הצטרפות לרשימת המתנה"],
  ["community:group.next.book", "הירשם למפגש", "הירשמי למפגש", "הרשמה למפגש"],
  ["community:group.join.enterCode", "הזן קוד הצטרפות", "הזיני קוד הצטרפות", "קוד הצטרפות"],
  ["community:group.join.wrongCode", "קוד שגוי, אנא נסה שנית", "קוד שגוי, אנא נסי שנית", "קוד שגוי, אנא נסו שנית"],
  ["community:group.join.join", "הצטרף לקבוצה", "הצטרפי לקבוצה", "הצטרפות לקבוצה"],
  ["community:circles.createOrJoin", "צור / הצטרף", "צרי / הצטרפי", "יצירה / הצטרפות"],
  ["community:groupCard.updateLocation", "עדכן מיקום למיקומי הנוכחי", "עדכני מיקום למיקומי הנוכחי", "עדכון למיקום הנוכחי שלי"],
  ["community:groupCard.code.wrong", "קוד שגוי, אנא נסה שנית", "קוד שגוי, אנא נסי שנית", "קוד שגוי, אנא נסו שנית"],
  ["community:groupCard.enterCode", "הזן קוד", "הזיני קוד", "הזנת קוד"],
  ["community:banner.confirmArrival", "אשר הגעה", "אשרי הגעה", "אישור הגעה"],
  ["community:leagues.selector.placeholder", "בחר ליגה", "בחרי ליגה", "בחירת ליגה"],
  ["community:leagues.opponent.title", "בחר יריבה לקרב", "בחרי יריבה לקרב", "בחירת יריבה לקרב"],
  ["profile:profile.grid.empty.line2", "תתחיל לזוז!", "תתחילי לזוז!", "בואו נזוז!"],
  ["onboarding:bridge.title", "בוא נכניס הכל ללו״ז", "בואי נכניס הכל ללו״ז", "בואו נכניס הכל ללו״ז"],
  ["onboarding:hierarchy.add.submitted", "ההצעה שלך נשלחה וממתינה לאישור. אתה כבר משויך אליה.", "ההצעה שלך נשלחה וממתינה לאישור. את כבר משויכת אליה.", "ההצעה שלך נשלחה וממתינה לאישור. השיוך שלך אליה כבר נשמר."],
  ["onboarding:personaDrawer.staleUnit", "היחידה שבחרת בעבר כבר לא קיימת — בחר מחדש", "היחידה שבחרת בעבר כבר לא קיימת — בחרי מחדש", "היחידה שנבחרה בעבר כבר לא קיימת — צריך לבחור מחדש"],
  ["onboarding:signaturePad.hint", "חתום כאן עם האצבע", "חתמי כאן עם האצבע", "חתימה כאן עם האצבע"],
  ["onboarding:identity.alert.noUser", "לא נמצא משתמש מחובר. נסה לרענן את הדף.", "לא נמצא משתמש מחובר. נסי לרענן את הדף.", "לא נמצא משתמש מחובר. נסו לרענן את הדף."],
  ["onboarding:identity.alert.authError", "שגיאה באימות המשתמש. נסה לרענן את הדף.", "שגיאה באימות המשתמש. נסי לרענן את הדף.", "שגיאה באימות המשתמש. נסו לרענן את הדף."],
];

function tr(id: string, values?: Record<string, unknown>): string {
  const i = id.indexOf(':');
  const ns = id.slice(0, i);
  const key = id.slice(i + 1);
  return T[ns](key, values);
}

function expectThree(name: string, text: GenderedText, m: string, f: string, n: string): void {
  expect(pickGendered('male', text), name).toBe(m);
  expect(pickGendered('female', text), name).toBe(f);
  expect(pickGendered('other', text), name).toBe(n);
  expect(pickGendered(undefined, text), `${name} (unset)`).toBe(n);
  expect(n, `${name}: neutral has no slash`).not.toMatch(/[א-ת]\/[א-ת]/);
}

describe('gender batch 2 — catalog keys, three outputs', () => {
  it.each(CATALOG_CASES)('%s', (id, m, f, n) => {
    expect(tr(id, { gender: 'male' })).toBe(m);
    expect(tr(id, { gender: 'female' })).toBe(f);
    expect(tr(id, { gender: 'other' })).toBe(n);
    expect(tr(id), 'no gender passed → neutral').toBe(n);
    expect(n).not.toMatch(/[א-ת]\/[א-ת]/);
  });

  it('keys with values', () => {
    const p = { active: '3', max: '10' };
    expect(tr('community:banner.participants', { ...p, gender: 'male' })).toBe('3 / 10 משתתפים');
    expect(tr('community:banner.participants', { ...p, gender: 'female' })).toBe('3 / 10 משתתפות');
    expect(tr('community:banner.participants', { ...p, gender: 'other' })).toBe('3 / 10 משתתפים');
    const c = { count: '4' };
    expect(tr('community:leagues.units.belowFloor.body', { ...c, gender: 'male' })).toBe('4 משתתפים פעילים כרגע — שלח לחברים שלך ליחידה!');
    expect(tr('community:leagues.units.belowFloor.body', { ...c, gender: 'female' })).toBe('4 משתתפים פעילים כרגע — שלחי לחברים שלך ליחידה!');
    expect(tr('community:leagues.units.belowFloor.body', { ...c, gender: 'other' })).toBe('4 משתתפים פעילים כרגע — שלחו לחברים ביחידה!');
  });

  it('texts sent to friends → "בואו" for everyone (decision 7)', () => {
    for (const gender of ['male', 'female', 'other']) {
      expect(tr('player:run.invite.shareRun', { url: 'U', gender })).toBe('בואו לרוץ איתי עכשיו 🏃 U');
      expect(tr('player:run.invite.shareWalk', { url: 'U', gender })).toBe('בואו ללכת איתי עכשיו 🚶 U');
      expect(tr('community:inviteBonus.shareText.plain', { link: 'L', gender })).toBe('בואו להתאמן איתי ב-OUT 💪 L');
      expect(tr('community:inviteBonus.shareText.scoped', { scope: 'יפו', link: 'L', gender })).toBe('בואו להתאמן איתי ביפו ב-OUT 💪 L');
      expect(tr('community:postJoin.shareText', { name: 'N', url: 'U', gender })).toBe('היי, הצטרפתי ל-N ב-OutRun! בואו להתאמן איתי: U');
    }
  });
});

describe('gender batch 2 — code copy (not extracted yet), three outputs', () => {
  it('SettingsModal errors (the coupon lines were feminine for everyone)', () => {
    expectThree('couponNotFound', SETTINGS_COPY.couponNotFound, 'קוד לא נמצא. בדוק ונסה שוב.', 'קוד לא נמצא. בדקי ונסי שוב.', 'קוד לא נמצא. בדקו ונסו שוב.');
    expectThree('couponError', SETTINGS_COPY.couponError, 'שגיאה בבדיקת הקוד. נסה שוב.', 'שגיאה בבדיקת הקוד. נסי שוב.', 'שגיאה בבדיקת הקוד. נסו שוב.');
    expectThree('signOutError', SETTINGS_COPY.signOutError, 'שגיאה בהתנתקות. נסה שוב.', 'שגיאה בהתנתקות. נסי שוב.', 'שגיאה בהתנתקות. נסו שוב.');
    expectThree('deleteSessionExpired', SETTINGS_COPY.deleteSessionExpired, 'תוקף החיבור פג. התחבר מחדש ונסה שוב.', 'תוקף החיבור פג. התחברי מחדש ונסי שוב.', 'תוקף החיבור פג. התחברו מחדש ונסו שוב.');
    expectThree('deleteNetwork', SETTINGS_COPY.deleteNetwork, 'בעיית חיבור - נסה שוב', 'בעיית חיבור - נסי שוב', 'בעיית חיבור - נסו שוב');
    expectThree('deleteFailed', SETTINGS_COPY.deleteFailed, 'שגיאה במחיקת החשבון. הנתונים לא נמחקו. נסה שוב.', 'שגיאה במחיקת החשבון. הנתונים לא נמחקו. נסי שוב.', 'שגיאה במחיקת החשבון. הנתונים לא נמחקו. נסו שוב.');
  });
});

describe('gender batch 2 — code copy modules: every entry', () => {
  const modules: Record<string, Record<string, GenderedText>> = {
    SETTINGS_COPY, SUMMARY_COPY, FREE_RUN_COPY, LEAGUE_COPY, ARENA_CREATE_COPY,
  };
  for (const [mod, entries] of Object.entries(modules)) {
    for (const [id, text] of Object.entries(entries)) {
      it(`${mod}.${id}`, () => {
        expectThree(`${mod}.${id}`, text, text.male, text.female, text.other);
        expect(text.female, 'female differs from male').not.toBe(text.male);
        expect(text.other, 'neutral differs from male').not.toBe(text.male);
      });
    }
  }

  it('pins: summary, free run, league, arena create', () => {
    expectThree('keepGoing', SUMMARY_COPY.keepGoing, 'כל הכבוד! המשך כך!', 'כל הכבוד! המשיכי כך!', 'כל הכבוד! ככה ממשיכים!');
    expectThree('claimBonus', SUMMARY_COPY.claimBonus, 'השלם פרופיל וקבל בונוס', 'השלימי פרופיל וקבלי בונוס', 'משלימים פרופיל ומקבלים בונוס');
    expectThree('startFree', FREE_RUN_COPY.startFree, 'התחל חופשי', 'התחילי חופשי', 'בלי מסלול');
    expectThree('startToAddress', FREE_RUN_COPY.startToAddress, 'התחל לכתובת הזו', 'התחילי לכתובת הזו', 'יוצאים לכתובת הזו');
    expectThree('compileError', FREE_RUN_COPY.compileError, 'משהו השתבש בהרכבת המסלול. נסה שוב.', 'משהו השתבש בהרכבת המסלול. נסי שוב.', 'משהו השתבש בהרכבת המסלול. נסו שוב.');
    expectThree('lockedCity', LEAGUE_COPY.lockedCity, 'לחץ על העירייה כדי לפתוח את הליגה הרשמית', 'לחצי על העירייה כדי לפתוח את הליגה הרשמית', 'לוחצים על העירייה כדי לפתוח את הליגה הרשמית');
    expectThree('welcomeToLeague', ARENA_CREATE_COPY.welcomeToLeague, 'ברוך הבא לליגת:', 'ברוכה הבאה לליגת:', 'ברוכים הבאים לליגת:');
    expectThree('outreachIntro', ARENA_CREATE_COPY.outreachIntro, 'אני מתאמן עם Out ורוצה', 'אני מתאמנת עם Out ורוצה', 'אני באפליקציית Out ורוצה');
  });
});

describe('gender batch 2 — badges stay gendered and personal (decision 9)', () => {
  const cases: Array<[string, string, string]> = [
    ['pull_up_king', 'מלך המתח', 'מלכת המתח'],
    ['squat_champion', 'אלוף הסקוואט', 'אלופת הסקוואט'],
    ['distance_runner', 'רץ מרחקים', 'רצת מרחקים'],
  ];
  it.each(cases)('%s', (id, m, f) => {
    const def = ACHIEVEMENT_MAP[id];
    expect(def, id).toBeDefined();
    expect(achievementName(def, 'male')).toBe(m);
    expect(achievementName(def, 'female')).toBe(f);
    // A badge is a title, not an instruction — unknown gender keeps the base title.
    expect(achievementName(def, 'other')).toBe(m);
    // A definition read from Firestore without name_he_female still gets the bundled feminine name.
    expect(achievementName({ id, name_he: m }, 'female')).toBe(f);
  });

  it('no "לוחם" in general badge names (decision 6)', () => {
    for (const def of Object.values(ACHIEVEMENT_MAP)) {
      expect(def.name_he, def.id).not.toMatch(/לוחם/);
      expect(def.name_he_female ?? '', def.id).not.toMatch(/לוחמת/);
    }
  });
});
