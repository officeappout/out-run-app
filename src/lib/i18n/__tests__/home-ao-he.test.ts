/**
 * i18n wave 2 batch ao (namespace `home`, prefix settings.*): SettingsModal. Every key equals the old literal /
 * template, copied verbatim from the component — including what a static render can't reach (toasts, window.confirm
 * texts, the gendered error lines the old SETTINGS_COPY held, the select / interpolated lines).
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/home.json';
import { home } from '@/messages/ns/home';
import { makeT } from '../t';

const t = makeT('he', home);
type Key = keyof typeof he;

describe('settings (plain strings)', () => {
  it('every plain key equals the old literal', () => {
    const cases: Array<[Key, string]> = [
      ["settings.title", "הגדרות"],
      ["settings.screen.personal", "פרטים אישיים"],
      ["settings.screen.notifications", "התראות"],
      ["settings.screen.personas", "הפרסונות שלי"],
      ["settings.screen.privacy", "פרטיות ונראות"],
      ["settings.userFallback", "משתמש"],
      ["settings.loading", "טוען…"],
      ["settings.perm.native", "נייטיב"],
      ["settings.perm.active", "פעיל"],
      ["settings.perm.blocked", "נחסם"],
      ["settings.perm.enable", "הפעל"],
      ["settings.privacy.mode.ghost.label", "רוח"],
      ["settings.privacy.mode.ghost.sub", "לא נראה לאף אחד"],
      ["settings.privacy.mode.squad.label", "חברים"],
      ["settings.privacy.mode.squad.sub", "רק מי שאני עוקב אחריו"],
      ["settings.privacy.mode.global.label", "גלובלי"],
      ["settings.privacy.mode.global.sub", "כל המאומתים בקבוצת הגיל שלי"],
      ["settings.section.account", "חשבון"],
      ["settings.account.personalSub", "עיר, משקל, תאריך לידה"],
      ["settings.account.personasSub", "פרטים פרטיים, לא מופיעים בפרופיל הציבורי"],
      ["settings.account.passwordSent", "מייל נשלח ✓"],
      ["settings.account.password", "סיסמה ואבטחה"],
      ["settings.account.passwordSubSocial", "מחובר דרך גוגל / אפל — לא נדרשת סיסמה"],
      ["settings.account.passwordSubSent", "בדוק את תיבת הדואר שלך"],
      ["settings.account.passwordSubIdle", "שלח קישור לאיפוס סיסמה"],
      ["settings.section.subscription", "מנוי"],
      ["settings.subscription.inactiveSub", "לא פעיל — הצטרף לעיר שלך"],
      ["settings.subscription.badgeActive", "פעיל"],
      ["settings.subscription.badgeInactive", "לא פעיל"],
      ["settings.subscription.couponTitle", "הזנת קוד קופון"],
      ["settings.subscription.couponVerify", "אמת קוד"],
      ["settings.section.notifPrivacy", "התראות ופרטיות"],
      ["settings.notif.push", "התראות פוש"],
      ["settings.notif.blockedOpen", "נחסם — פתח הגדרות"],
      ["settings.notif.pushEnableToReceive", "הפעל כדי לקבל התראות"],
      ["settings.notif.pushNativeAsk", "הפעלה תבקש הרשאת מערכת"],
      ["settings.notif.pushCentral", "ניהול מרכזי של כל ההתראות"],
      ["settings.notif.enableInDeviceSettings", "אפשר התראות בהגדרות המכשיר"],
      ["settings.notif.chat", "התראות צ׳אט"],
      ["settings.notif.chatEnable", "הפעל התראות כדי לקבל"],
      ["settings.notif.chatSub", "קבל הודעה כשמישהו כותב לך"],
      ["settings.notif.progression", "התקדמות"],
      ["settings.notif.progressionSub", "עלייה ברמה, שיאים אישיים"],
      ["settings.notif.social", "חברתי"],
      ["settings.notif.socialSub", "הצטרפות לקבוצה, קאדוז"],
      ["settings.notif.trainingReminder", "תזכורות אימון"],
      ["settings.notif.trainingReminderSub", "בוקר לפני אימון מתוזמן"],
      ["settings.notif.encouragement", "עידוד ומוטיבציה"],
      ["settings.notif.encouragementSub", "הודעות מהעירייה שלך"],
      ["settings.notif.retention", "חזרה לשגרה"],
      ["settings.notif.retentionSub", "תזכורת כשלא התאמנת כמה ימים"],
      ["settings.notif.kelly", "הודעות מקלי"],
      ["settings.notif.kellySub", "עד הודעה אחת ביום: האימון של היום, סיכום שבועי, ואיך היה אחרי אימון"],
      ["settings.notif.shabbat", "שמירת שבת"],
      ["settings.notif.shabbatSub", "לא נשלח התראות משישי לפני כניסת שבת ועד מוצאי שבת, וכך גם בחגים"],
      ["settings.notif.weekStart", "תחילת שבוע"],
      ["settings.notif.weekStartSub", "תזכורת קצרה במוצאי שבת לתכנן את האימון הראשון"],
      ["settings.freq.title", "כמה תזכורות?"],
      ["settings.freq.min.label", "מינימלי"],
      ["settings.freq.min.sub", "רק החשוב ביותר. עד תזכורת אחת ביום."],
      ["settings.freq.balanced.label", "מאוזן"],
      ["settings.freq.balanced.sub", "כמה תזכורות ביום שיעזרו לך להתמיד."],
      ["settings.freq.high.label", "גבוה"],
      ["settings.freq.high.sub", "דחוף אותי — כמה שיותר תזכורות שיזיזו אותי."],
      ["settings.freq.recommended", "מומלץ"],
      ["settings.reminders.title", "תזכורות אימון"],
      ["settings.reminders.loading", "טוען..."],
      ["settings.reminders.none", "לא הוגדרו תזכורות"],
      ["settings.reminders.remove", "הסר תזכורת"],
      ["settings.reminders.add", "הוסף"],
      ["settings.reminders.addReminder", "הוסף תזכורת"],
      ["settings.privacy.mapVisibility", "נראות במפה"],
      ["settings.privacy.feedPosts", "מי רואה את הפוסטים שלי"],
      ["settings.privacy.feedPostsSub", "פרסום אוטומטי, קהל ברירת מחדל, שם הפארק"],
      ["settings.privacy.discoverable", "נגישות פרופיל בחיפוש"],
      ["settings.privacy.discoverableSub", "אפשר למשתמשים אחרים למצוא אותך לפי שם"],
      ["settings.privacy.analytics", "שיתוף אנליטיקס"],
      ["settings.privacy.analyticsSub", "שיתוף נתוני שימוש אנונימיים לשיפור האפליקציה"],
      ["settings.section.tools", "כלים"],
      ["settings.tools.nativeOnly", "זמין באפליקציה הנייטיב בלבד"],
      ["settings.tools.healthConnected", "מחובר — לחץ לניהול הרשאות ב-OS"],
      ["settings.tools.healthIdle", "סנכרן צעדים, קלוריות ודקות פעילות"],
      ["settings.tools.units", "יחידות מידה"],
      ["settings.tools.calendar", "סנכרון ליומן"],
      ["settings.tools.calendarSub", "האימונים שלך ביומן של הטלפון"],
      ["settings.tools.equipment", "הציוד שלי"],
      ["settings.tools.equipmentSub", "עדכן את הציוד הזמין לך"],
      ["settings.tools.camera", "גישה למצלמה וגלריה"],
      ["settings.tools.permGranted", "מורשה — לחץ לניהול הרשאות ב-OS"],
      ["settings.tools.permDenied", "נחסם — פתח הגדרות מכשיר לשחרור"],
      ["settings.tools.cameraIdle", "אפשר גישה למצלמה ולגלריה"],
      ["settings.tools.location", "גישה למיקום"],
      ["settings.tools.locationIdle", "אפשר גישה למיקום ל-GPS"],
      ["settings.section.training", "חוויית אימון"],
      ["settings.training.stepGoal", "יעד צעדים יומי"],
      ["settings.training.stepGoalAutoNone", "מתעדכן פעם בשבוע לפי ההליכה שלך"],
      ["settings.training.stepGoalAutoOption", "אוטומטי (מומלץ)"],
      ["settings.training.guided", "ליווי צעד-אחר-צעד"],
      ["settings.training.guidedSub", "מסך פתיחה, הדרכה, 'מצא את המתקן' וסרטון לפני כל תרגיל"],
      ["settings.section.general", "כללי"],
      ["settings.general.help", "איך משתמשים ושאלות נפוצות"],
      ["settings.general.helpSub", "סיור באפליקציה לפי נושא, ותשובות לשאלות"],
      ["settings.general.a11yWidget", "הפעלת סרגל נגישות"],
      ["settings.general.a11yWidgetSub", "סרגל של צד שלישי (UserWay) להתאמת גודל טקסט, ניגודיות ותנועה. כבוי כברירת מחדל; כיבוי נכנס לתוקף בהפעלה הבאה."],
      ["settings.general.haptics", "רטט"],
      ["settings.general.hapticsSub", "רטט קל בבחירה ובכפתורים הראשיים באימון. במכשיר הזה בלבד."],
      ["settings.general.terms", "תנאי שימוש ופרטיות"],
      ["settings.general.privacyPolicy", "מדיניות פרטיות"],
      ["settings.general.accessibility", "הצהרת נגישות"],
      ["settings.general.sources", "מקורות מידע"],
      ["settings.general.sourcesSub", "מפות ושבילים: © OpenStreetMap contributors · גובה: Copernicus WorldDEM-30 © DLR/Airbus"],
      ["settings.general.contact", "יצירת קשר"],
      ["settings.logout", "התנתק"],
      ["settings.danger.title", "אזור מסוכן"],
      ["settings.danger.desc", "פעולות בלתי הפיכות שימחקו את כל הנתונים שלך."],
      ["settings.danger.deleteAccount", "מחק חשבון"],
      ["settings.version", "גרסה 1.0.0"],
      ["settings.personal.intro", "הנתונים שמזהים את מנוע האימון"],
      ["settings.personal.edit", "ערוך"],
      ["settings.personal.city", "עיר"],
      ["settings.personal.notSet", "לא הוגדרה"],
      ["settings.personal.weight", "משקל"],
      ["settings.personal.birthDate", "תאריך לידה"],
      ["settings.personal.birthDateLocked", "תאריך לידה לא ניתן לעריכה כאן"],
      ["settings.personal.neighborhoodEdit", "עריכה"],
      ["settings.personal.neighborhoodChoose", "בחירה"],
      ["settings.personal.chooseCityFirst", "קודם בחר עיר"],
      ["settings.personal.neighborhood", "שכונה"],
      ["settings.personal.footnote", "הנתונים האלה לא מופיעים בכרטיס הציבורי שלך. שינוי תאריך לידה עובר דרך זיהוי."],
      ["settings.delete.title", "מחיקת חשבון לצמיתות"],
      ["settings.delete.deleting", "מוחק..."],
      ["settings.delete.confirm", "מחק לצמיתות"],
      ["settings.toast.couponOk", "הקוד אומת בהצלחה!"],
      ["settings.toast.resetSent", "לינק לאיפוס סיסמה נשלח לאימייל שלך"],
      ["settings.toast.resetFailed", "שגיאה בשליחת מייל האיפוס"],
      ["settings.toast.pushDenied", "לא ניתן לאפשר התראות. אפשר גישה בהגדרות המכשיר."],
      ["settings.toast.saveFailed", "שגיאה בשמירת ההגדרה"],
      ["settings.toast.locationNativeOnly", "הרשאות מיקום זמינות באפליקציה הנייטיב בלבד"],
      ["settings.toast.locationFailed", "לא ניתן לקבל גישה למיקום"],
      ["settings.toast.cameraNativeOnly", "הרשאות מצלמה זמינות באפליקציה הנייטיב בלבד"],
      ["settings.toast.cameraFailed", "לא ניתן לקבל גישה למצלמה"],
      ["settings.toast.healthNativeOnly", "הרשאות בריאות זמינות באפליקציה הנייטיב בלבד"],
      ["settings.toast.healthFailed", "לא ניתן לקבל גישה לנתוני הבריאות"],
      ["settings.toast.reminderSaveFailed", "שגיאה בשמירת התזכורת"],
      ["settings.toast.reminderRemoveFailed", "שגיאה בהסרת התזכורת"],
      ["settings.confirm.openLocationSettings", "לפתוח את הגדרות המכשיר לניהול הרשאת המיקום?"],
      ["settings.confirm.openCameraSettings", "לפתוח את הגדרות המכשיר לניהול הרשאת המצלמה?"],
      ["settings.confirm.cameraDenied", "הרשאת המצלמה נדחתה. לפתוח את הגדרות המכשיר?"],
      ["settings.confirm.openHealthSettings", "לפתוח את הגדרות המכשיר לניהול הרשאות הבריאות?"],
      ["settings.error.noUser", "לא נמצא משתמש מחובר."],
      ["settings.error.couponExpired", "הקוד פג תוקף."],
      ["settings.error.couponMax", "הקוד הגיע למכסה המקסימלית."],
    ];
    for (const [key, old] of cases) expect(t(key), key).toBe(old);
  });
});

describe('settings (values and branches)', () => {
  const g = (gender: string, m: string, f: string, o: string) => (gender === 'female' ? f : gender === 'male' ? m : o);

  it('gendered error lines — male / female / neutral (old SETTINGS_COPY)', () => {
    const copy = {
      'settings.error.couponNotFound': ['קוד לא נמצא. בדוק ונסה שוב.', 'קוד לא נמצא. בדקי ונסי שוב.', 'קוד לא נמצא. בדקו ונסו שוב.'],
      'settings.error.couponFailed': ['שגיאה בבדיקת הקוד. נסה שוב.', 'שגיאה בבדיקת הקוד. נסי שוב.', 'שגיאה בבדיקת הקוד. נסו שוב.'],
      'settings.error.signOut': ['שגיאה בהתנתקות. נסה שוב.', 'שגיאה בהתנתקות. נסי שוב.', 'שגיאה בהתנתקות. נסו שוב.'],
      'settings.error.deleteSessionExpired': ['תוקף החיבור פג. התחבר מחדש ונסה שוב.', 'תוקף החיבור פג. התחברי מחדש ונסי שוב.', 'תוקף החיבור פג. התחברו מחדש ונסו שוב.'],
      'settings.error.deleteNetwork': ['בעיית חיבור - נסה שוב', 'בעיית חיבור - נסי שוב', 'בעיית חיבור - נסו שוב'],
      'settings.error.deleteFailed': ['שגיאה במחיקת החשבון. הנתונים לא נמחקו. נסה שוב.', 'שגיאה במחיקת החשבון. הנתונים לא נמחקו. נסי שוב.', 'שגיאה במחיקת החשבון. הנתונים לא נמחקו. נסו שוב.'],
    } as const;
    for (const [key, [m, f, o]] of Object.entries(copy)) {
      for (const gender of ['male', 'female', 'other'] as const) {
        expect(t(key as Key, { gender }), `${key} ${gender}`).toBe(g(gender, m, f, o));
      }
    }
  });

  it('interpolated lines', () => {
    expect(t('settings.subscription.activeSub', { name: 'תל אביב' })).toBe(`פעיל — ${'תל אביב'}`);
    expect(t('settings.reminders.count', { count: String(1234) })).toBe(`${1234} תזכורות מוגדרות`);
    const steps = (9000).toLocaleString('en-US');
    expect(t('settings.training.stepGoalManual', { steps })).toBe(`${steps} צעדים ביום, לפי הבחירה שלך`);
    expect(t('settings.training.stepGoalAuto', { steps })).toBe(`${steps} צעדים · מתעדכן פעם בשבוע לפי ההליכה שלך`);
  });

  it('units select: km → קילומטרים, anything else → מיילים', () => {
    const old = (u: string) => (u === 'km' ? 'קילומטרים' : 'מיילים');
    for (const unit of ['km', 'miles']) expect(t('settings.tools.unitName', { unit })).toBe(old(unit));
  });

  it('delete overlay lines (rich)', () => {
    const join = (key: Key, values: Record<string, unknown>) =>
      t.rich<string>(key, { ...values, b: (chunks: unknown) => `<<${(chunks as string[]).join('')}>>` }).join('');
    expect(join('settings.delete.warning', {})).toBe('הפעולה הזו <<לא ניתנת לביטול>>. כל המידע שלך יימחק לצמיתות.');
    expect(join('settings.delete.typeToConfirm', { word: 'מחק' })).toBe('הקלד <<מחק>> לאישור');
  });
});
