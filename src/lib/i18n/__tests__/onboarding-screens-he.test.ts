/**
 * i18n wave 2 (namespace `onboarding`, batch t): every key the remaining onboarding screens use
 * (BlurryBridgeOverlay, WelcomeDrawer, HealthConnectOptInStep, ResultLoading, JITSetupModal,
 * HealthDeclarationStep, IdentityProfileScreen, LifestyleWizard, ProgramResult,
 * DynamicQuestionRenderer, OnboardingWizard, OnboardingLayout, PersonaQuestionsDrawer,
 * HierarchySearchStep, SignaturePad) must render the Hebrew those components hard-coded before the
 * extraction — the old literal / template copied verbatim, every select / gender branch, rich tags.
 * Keys are counted per prefix (other batches add keys to the same namespace file).
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/onboarding.json';
import { onboarding, type OnboardingKey } from '@/messages/ns/onboarding';
import { makeT } from '../t';

const t = makeT('he', onboarding);
const GENDERS = ['male', 'female', 'other'] as const;
/** The old two-way helpers: anything but 'female' read the masculine form. */
const mf = (gender: string, male: string, female: string) => (gender === 'female' ? female : male);
/** t.rich() with every tag rendered as `[tag:chunks]`, joined to one string. */
const rich = (key: OnboardingKey, values: Record<string, unknown> = {}, tags: string[] = []) => {
  const fns: Record<string, unknown> = {};
  for (const tag of tags) fns[tag] = (chunks: unknown[]) => `[${tag}:${chunks.join('')}]`;
  return t.rich<string>(key, { ...values, ...fns } as never).join('');
};

const COUNTS: Record<string, number> = {
  bridge: 7,
  welcome: 12,
  healthConnect: 5,
  resultLoading: 4,
  jit: 10,
  health: 29,
  identity: 31,
  lifestyle: 10,
  result: 15,
  dynamic: 8,
  wizard: 1,
  layout: 2,
  personaDrawer: 7,
  hierarchy: 18,
  signaturePad: 2,
};

describe('onboarding — remaining screens (batch t)', () => {
  it('owns exactly the expected keys per prefix', () => {
    const keys = Object.keys(he);
    for (const [prefix, n] of Object.entries(COUNTS)) {
      expect(keys.filter((k) => k.startsWith(`${prefix}.`)), prefix).toHaveLength(n);
    }
  });

  it('plain strings', () => {
    const cases: Array<[OnboardingKey, string]> = [
      // BlurryBridgeOverlay
      ['bridge.title', 'בואו נכניס הכל ללו״ז'],
      ['bridge.subtitle', 'נבנה לך תוכנית אישית שמתאימה בדיוק לשגרה שלך'],
      ['bridge.badge.personal', 'מותאם אישית'],
      ['bridge.badge.minutes', '3 דקות'],
      ['bridge.cta.start', 'בואו נתחיל'],
      ['bridge.cta.workoutNow', 'אתחיל אימון עכשיו'],
      ['bridge.note', 'תמיד אפשר לדלג ולמלא אחר כך'],
      // WelcomeDrawer
      ['welcome.title', 'מה הדבר הראשון שבא לך לעשות?'],
      ['welcome.skipToMap', 'דילוג למפה'],
      ['welcome.strength.title', 'אימון כוח מותאם'],
      ['welcome.strength.subtitle', 'תוכנית בנויה בשבילך, לפי הרמה שלך'],
      ['welcome.secondary.gardens.title', 'אימון היברידי בגינת כושר קרובה'],
      ['welcome.secondary.gardens.subtitle', 'מצאנו לך מתחם עם מתקנים באזור שלך'],
      ['welcome.secondary.routes.title', 'מסלול ריצה מוכן באזור שלך'],
      ['welcome.secondary.routes.subtitle', 'מסלול מתוכנן ומוכן להתחלה'],
      ['welcome.secondary.none.title', 'ריצה או הליכה חופשית'],
      ['welcome.secondary.none.subtitle', 'נתחיל במיקום שלך, בלי צורך בציוד'],
      ['welcome.justLook', 'סתם בא לי להסתכל באפליקציה'],
      // HealthConnectOptInStep
      ['healthConnect.title', 'רוצה שנעקוב אחרי הצעדים שלך?'],
      [
        'healthConnect.body',
        `חיבור ל-${'Apple Health / Google Health Connect'} מציג לך את הצעדים והקלוריות היומיים ישירות באפליקציה. אפשר לחבר גם מאוחר יותר מהפרופיל.`,
      ],
      ['healthConnect.connecting', 'מתחבר...'],
      ['healthConnect.later', 'אולי מאוחר יותר'],
      // ResultLoading
      ['resultLoading.phrase.pullups', 'מנתח את מספר המתחים...'],
      ['resultLoading.phrase.volume', 'מחשב את נפח האימון האופטימלי...'],
      ['resultLoading.phrase.profile', 'בונה את פרופיל האתלט שלך...'],
      ['resultLoading.phrase.program', 'מתאים תוכנית אישית...'],
      // JITSetupModal
      ['jit.title.hardBlock', 'עוד צעד אחד קטן!'],
      ['jit.title.soft', 'רגע לפני שמתחילים...'],
      ['jit.desc.health', 'יש להשלים הצהרת בריאות לפני תחילת האימון הראשון'],
      ['jit.desc.fallback', 'צריך להשלים כמה דברים לפני האימון'],
      ['jit.required', '(חובה)'],
      ['jit.cta.equipment', 'בואו נעדכן ציוד'],
      ['jit.skip', 'דילוג בינתיים'],
      // HealthDeclarationStep (+ the title / description its hosts pass)
      ['health.title', 'הצהרת בריאות'],
      ['health.description', 'חשוב לנו לשמור על הבריאות שלך. אנא אשר/י את ההצהרה הבאה כדי להמשיך.'],
      ['health.intro.sub', 'נשאר לנו רק לעבור על שאלון הבריאות הקצר ולחתום למטה.'],
      ['health.privacyInfo', 'מידע על פרטיות ובטיחות'],
      ['health.answer.no', 'לא'],
      ['health.answer.yes', 'כן'],
      ['health.signature.title', 'הצהרת בריאות ואישור תוכנית 📋'],
      ['health.signature.placeholder', 'חתום/י כאן עם האצבע'],
      ['health.signature.clear', 'ניקוי חתימה'],
      ['health.signature.received', '✓ החתימה התקבלה'],
      ['health.signature.missing', 'יש לחתום בתיבה למעלה'],
      ['health.submitting', 'מכין מסמך חתום...'],
      ['health.cta.blocked', 'לא ניתן להמשיך'],
      ['health.cta.submit', 'אישור והמשך'],
      ['health.hint.sign', 'נא לחתום בתיבת החתימה למעלה כדי להמשיך'],
      ['health.hint.terms', 'נא לאשר את תנאי השימוש ומדיניות הפרטיות'],
      ['health.safety.title', 'פרטיות ובטיחות'],
      ['health.safety.private', 'כל המידע שתמלא נשמר באופן פרטי ומאובטח, ומשמש רק לצורך התאמת התוכנית האישית עבורך.'],
      ['health.safety.medical', 'אם התשובה לאחת השאלות תצביע על בעיה רפואית, מומלץ להתייעץ עם רופא לפני תחילת פעילות גופנית.'],
      ['health.safety.ok', 'הבנתי'],
      // IdentityProfileScreen
      ['identity.gender.male', 'גבר'],
      ['identity.gender.female', 'אישה'],
      ['identity.gender.other', 'אחר'],
      ['identity.intro.workout', 'אני קלי. לפני שיוצאים למסלול אני צריך רק 3 דברים קטנים, ואחריהם הצהרת בריאות קצרה.'],
      ['identity.intro.program', 'אני קלי. כדי לשמור את התוכנית שבנינו אני צריך רק 3 דברים קטנים.'],
      ['identity.intro.profileOnly', 'היי, אני קלי — המאמן האישי שלך! נשאר רק להגדיר כמה פרטים בפרופיל וזהו.'],
      ['identity.intro.default', 'אני קלי, המאמן האישי שלך. כדי שאבנה לך תוכנית שבאמת מתאימה — אני צריך רק 3 דברים קטנים.'],
      ['identity.alert.noUser', 'לא נמצא משתמש מחובר. נסו לרענן את הדף.'],
      ['identity.alert.authError', 'שגיאה באימות המשתמש. נסו לרענן את הדף.'],
      ['identity.alert.saveError', 'שגיאה בשמירת הפרופיל'],
      ['identity.verifying', 'מאמת זהות...'],
      ['identity.back', 'חזרה'],
      ['identity.heading', 'נעים להכיר!'],
      ['identity.join.sub', 'היי, אני קלי. עוד כמה פרטים קטנים ומצטרפים.'],
      ['identity.gender.label', 'איך היית רוצה שנפנה אלייך?'],
      ['identity.gender.hintJoin', 'רק כדי לדעת איך לפנות.'],
      [
        'identity.gender.hint',
        'רק כדי שנדע מתי לפרגן לך ב\'כל הכבוד מלך!\' ומתי ב\'אלופה, שברת את המסך!\' (ובשביל דיוק המדדים הפיזיולוגיים שלך, כמובן).',
      ],
      ['identity.birthday.label', 'מתי חוגגים לך יום הולדת?'],
      ['identity.birthday.hintJoin', 'כדי שנתאים את החוויה לגיל.'],
      ['identity.birthday.hint', 'עוזר לנו להתאים את עצימות האימון לגילך.'],
      ['identity.birthday.day', 'יום'],
      ['identity.birthday.month', 'חודש'],
      ['identity.birthday.year', 'שנה'],
      ['identity.birthday.under14', 'השימוש באפליקציה מותר מגיל 14 ומעלה'],
      ['identity.birthday.invalid', 'תאריך לא תקין'],
      ['identity.name.label', 'איך קוראים לך?'],
      ['identity.name.placeholder', 'השם שלך כאן...'],
      ['identity.saving', 'שומר...'],
      ['identity.cta.profileOnly', 'שמור וחזור ליצירת הקהילה'],
      // LifestyleWizard
      ['lifestyle.saveError', 'שגיאה בשמירה'],
      ['lifestyle.ios.title', 'לקבלת התראות באייפון'],
      // JSX joined the two source lines with one space.
      ['lifestyle.ios.body', 'Apple מאפשרת התראות רק לאפליקציות שמותקנות על מסך הבית. זה לוקח פחות מדקה'],
      ['lifestyle.ios.shareAria', 'שיתוף'],
      ['lifestyle.ios.ok', 'הבנתי, אוסיף למסך הבית'],
      // ProgramResult
      ['result.gauge.startLine', '1% — קו ההתחלה שלך'],
      ['result.program.skills', 'תוכנית מיומנויות מותאמת'],
      ['result.program.fullBody', 'תוכנית כל הגוף'],
      ['result.program.custom', 'תוכנית אימונים מותאמת אישית'],
      ['result.analyzing', 'מנתח את הביצועים שלך...'],
      ['result.skipSave', 'המשך בלי לשמור עכשיו'],
      // DynamicQuestionRenderer
      ['dynamic.pace.elite', 'המערכת אינה מותאמת כרגע לאתלטים ברמה הזו... אנו עובדים על עדכון בקרוב.'],
      ['dynamic.pace.continue', 'המשך'],
      // OnboardingWizard / OnboardingLayout
      ['wizard.loading', 'טוען...'],
      ['layout.back', 'חזרה'],
      ['layout.continue', 'המשך'],
      // PersonaQuestionsDrawer
      ['personaDrawer.title', 'עוד קצת עלייך'],
      ['personaDrawer.close', 'סגירה'],
      ['personaDrawer.saveFailed.title', 'לא הצלחנו לשמור את התשובות שלך כרגע.'],
      [
        'personaDrawer.saveFailed.body',
        'מה שכבר מילאת נשמר אצלך — אפשר לנסות שוב, או לסגור ולנסות מאוחר יותר; שום דבר לא הולך לאיבוד.',
      ],
      ['personaDrawer.privacy', 'הפרטים כאן פרטיים ולא מופיעים בפרופיל הציבורי שלך.'],
      ['personaDrawer.staleUnit', 'היחידה שנבחרה בעבר כבר לא קיימת — צריך לבחור מחדש'],
      ['personaDrawer.skip', 'דילוג'],
      // HierarchySearchStep
      ['hierarchy.searchPlaceholder', 'חיפוש לפי שם או מספר...'],
      ['hierarchy.loading', 'טוען...'],
      ['hierarchy.noResults', 'אין תוצאות'],
      ['hierarchy.add.open', 'היחידה שלי לא ברשימה — הוסף'],
      ['hierarchy.add.namePlaceholder', 'שם היחידה'],
      ['hierarchy.add.sending', 'שולח...'],
      ['hierarchy.add.send', 'שליחה'],
      ['hierarchy.add.cancel', 'ביטול'],
      ['hierarchy.add.matchYes', 'כן, זו היחידה שלי'],
      ['hierarchy.add.matchNo', 'לא, זו לא'],
      ['hierarchy.add.submitted', 'ההצעה שלך נשלחה וממתינה לאישור. השיוך שלך אליה כבר נשמר.'],
      ['hierarchy.saving', 'שומר...'],
      ['hierarchy.finish', 'סיום'],
      // SignaturePad
      ['signaturePad.hint', 'חתימה כאן עם האצבע'],
      ['signaturePad.clear', 'נקה חתימה'],
    ];
    for (const [key, old] of cases) expect(t(key), key).toBe(old);
  });

  it('values', () => {
    const name = 'דנה';
    expect(t('health.intro.name', { name })).toBe(`${name},`);
    const answered = 1234;
    const total = 1250;
    expect(t('health.progress', { answered: String(answered), total: String(total) })).toBe(
      `${answered}/${total} שאלות נענו`,
    );
    const group = 'הרצים של חולון';
    expect(t('identity.join.title', { group })).toBe(`מצטרפים לקבוצת ${group}`);
    expect(t('identity.join.title', { group: '' })).toBe('מצטרפים לקבוצת ');
    for (const [step, total2] of [[1, 3], [3, 3], [1000, 1200]]) {
      expect(t('lifestyle.progress', { step: String(step), total: String(total2) })).toBe(`${step} מתוך ${total2}`);
    }
    for (const [level, max] of [[4, 25], [1000, 1200]]) {
      expect(t('result.gauge.level', { level: String(level), max: String(max) })).toBe(`רמה ${level} מתוך ${max}`);
      expect(t('result.card.level', { level: String(level) })).toBe(`רמה ${level}`);
    }
    expect(t('dynamic.unknownType', { type: 'mystery' })).toBe(`סוג שאלה לא מוכר: ${'mystery'}`);
    for (const pace of ['5:00', '--:--', '12:34']) {
      expect(t('dynamic.pace.pace', { pace })).toBe(`קצב: ${pace} דק׳/ק״מ`);
    }
    const unit = 'גדוד 11';
    expect(t('hierarchy.noSubunits', { name: unit })).toBe(`אין תת-יחידות נוספות תחת ${unit}`);
    for (const query of ['xyz', "צ'ק", '{x}']) {
      expect(t('hierarchy.noMatch', { query })).toBe(`אין תוצאות עבור "${query}"`);
    }
  });

  it('gender selects — the old two-way picks (and the three-way ones) for every gender', () => {
    for (const gender of GENDERS) {
      // WelcomeDrawer's g(gender, male, female, neutral)
      expect(t('welcome.greeting', { gender })).toBe(
        gender === 'female' ? 'ברוכה הבאה ל-OUT' : gender === 'other' ? 'ברוכים הבאים ל-OUT' : 'ברוך הבא ל-OUT',
      );
      expect(t('healthConnect.cta', { gender })).toBe(mf(gender, 'חבר את הצעדים שלי', 'חברי את הצעדים שלי'));
      // JITSetupModal's requirementDescriptionV2 / CTA
      expect(t('jit.desc.account', { gender })).toBe(
        mf(gender, 'גבה את החשבון שלך כדי לא לאבד את ההתקדמות', 'גבי את החשבון שלך כדי לא לאבד את ההתקדמות'),
      );
      expect(t('jit.desc.equipment', { gender })).toBe(
        mf(gender, 'ספר לנו על הציוד שלך כדי שנתאים אימון מדויק', 'ספרי לנו על הציוד שלך כדי שנתאים אימון מדויק'),
      );
      expect(t('jit.cta.complete', { gender })).toBe(mf(gender, 'השלם עכשיו', 'השלימי עכשיו'));
      // HealthDeclarationStep
      expect(t('health.intro.sentence', { gender })).toBe(
        mf(
          gender,
          'רגע לפני שיוצאים לדרך, חשוב לנו לוודא שאנחנו שומרים עליך ב100%.',
          'רגע לפני שיוצאים לדרך, חשוב לנו לוודא שאנחנו שומרות עלייך ב100%.',
        ),
      );
      expect(t('health.fastTrack.cta', { gender })).toBe(
        mf(gender, 'אני מצהיר שכל התשובות הן "לא"', 'אני מצהירה שכל התשובות הן "לא"'),
      );
      expect(t('health.answer.yesWarning', { gender })).toBe(
        mf(
          gender,
          'שים לב: עקב תשובתך, מומלץ להתייעץ עם רופא לפני תחילת פעילות גופנית.',
          'שימי לב: עקב תשובתך, מומלץ להתייעץ עם רופא לפני תחילת פעילות גופנית.',
        ),
      );
      expect(t('health.signature.subtitle', { gender })).toBe(
        mf(
          gender,
          'אנא קרא ואשר את הצהרת הבריאות כדי שנוכל להנפיק את התוכנית',
          'אנא קראי ואשרי את הצהרת הבריאות כדי שנוכל להנפיק את התוכנית',
        ),
      );
      expect(t('health.blocked', { gender })).toBe(
        mf(
          gender,
          'עקב תשובותיך, לא ניתן להמשיך בתהליך ההרשמה. מומלץ להתייעץ עם רופא ומאמן מקצועי לפני תחילת פעילות גופנית.',
          'עקב תשובותייך, לא ניתן להמשיך בתהליך ההרשמה. מומלץ להתייעץ עם רופא ומאמן מקצועי לפני תחילת פעילות גופנית.',
        ),
      );
      expect(rich('health.terms', { gender }, ['terms', 'privacy'])).toBe(
        `${mf(gender, 'אני מצהיר', 'אני מצהירה')} כי כל הנתונים נכונים ${mf(gender, 'ומסכים', 'ומסכימה')} ל[terms:תנאי השימוש]ול[privacy:מדיניות הפרטיות]`,
      );
      // IdentityProfileScreen
      expect(t('identity.cta.continue', { gender })).toBe(mf(gender, 'המשך', 'המשיכי'));
      // LifestyleWizard's t(male, female)
      expect(t('lifestyle.skip', { gender })).toBe(mf(gender, 'דלג בשלב זה', 'דלגי בשלב זה'));
      expect(rich('lifestyle.ios.step1', { gender }, ['icon'])).toBe(
        `${mf(gender, 'פתח', 'פתחי')} את ספארי ${mf(gender, 'ולחץ', 'ולחצי')} על סמל השיתוף${' '}[icon:]${' '}בסרגל התחתון`,
      );
      expect(rich('lifestyle.ios.step2', { gender }, ['b'])).toBe(
        `${mf(gender, 'גלול מטה ובחר', 'גללי מטה ובחרי')}${' '}[b:"הוסף למסך הבית"]`,
      );
      expect(rich('lifestyle.ios.step3', { gender }, ['b'])).toBe(
        `${mf(gender, 'פתח', 'פתחי')} את${' '}[b:Out]${' '}מהסמל החדש על מסך הבית ${mf(gender, 'ואשר', 'ואשרי')} את ההתראות`,
      );
      // ProgramResult
      for (const [nextLevel, sessions] of [[5, 13], [1000, 1234]]) {
        expect(t('result.achievement', { gender, level: String(nextLevel), sessions: String(sessions) })).toBe(
          gender === 'female'
            ? `כ-1,280 משתמשות התחילו ב-1% בדיוק כמוך — רובן הגיעו לרמה ${nextLevel} תוך כ-${sessions} אימונים.`
            : `כ-1,280 משתמשים התחילו ב-1% בדיוק כמוך — רובם הגיעו לרמה ${nextLevel} תוך כ-${sessions} אימונים.`,
        );
      }
      expect(t('result.continue', { gender })).toBe(mf(gender, 'בוא נמשיך', 'בואי נמשיך'));
      expect(t('result.journey', { gender })).toBe(
        gender === 'female'
          ? `המסע שלך מתחיל עכשיו! כל אימון בתוכנית יעלה אותך באחוזים, עד שתגיעי לרמה הבאה.`
          : `המסע שלך מתחיל עכשיו! כל אימון בתוכנית יעלה אותך באחוזים, עד שתגיע לרמה הבאה.`,
      );
      // DynamicQuestionRenderer's PaceTimeInput (isFemale)
      expect(t('dynamic.pace.hint', { gender })).toBe(
        mf(gender, 'הכוונה לתוצאה שאתה יכול לבצע היום, לא לשיא היסטורי!', 'הכוונה לתוצאה שאת יכולה לבצע היום, לא לשיא היסטורי!'),
      );
    }
    // HierarchySearchStep's pickGendered(currentUiGender(), { male, female, other })
    const declare = { male: 'שמירת ההצהרה נכשלה. נסה שוב.', female: 'שמירת ההצהרה נכשלה. נסי שוב.', other: 'שמירת ההצהרה נכשלה. נסו שוב.' };
    const add = {
      male: 'השמירה נכשלה. בדוק חיבור לאינטרנט ונסה שוב.',
      female: 'השמירה נכשלה. בדקי חיבור לאינטרנט ונסי שוב.',
      other: 'השמירה נכשלה. בדקו חיבור לאינטרנט ונסו שוב.',
    };
    for (const gender of GENDERS) {
      expect(t('hierarchy.declareFailed', { gender })).toBe(declare[gender]);
      expect(t('hierarchy.addFailed', { gender })).toBe(add[gender]);
    }
  });

  it('label maps → selects', () => {
    // ProgramResult's CATEGORY_DISPLAY / HE_LABELS
    const CATEGORY_HE: Record<string, string> = { push: 'דחיפה', pull: 'משיכה', legs: 'פלג גוף תחתון', core: 'ליבה' };
    for (const [category, label] of Object.entries(CATEGORY_HE)) {
      expect(t('result.category', { category })).toBe(label);
      expect(t('result.program.one', { category: label })).toBe(`תוכנית ${label}`);
    }
    const labels = ['דחיפה', 'משיכה', 'ליבה'];
    const last = labels[labels.length - 1];
    const rest = labels.slice(0, -1);
    expect(t('result.program.many', { rest: rest.join(', '), last })).toBe(`תוכנית ${rest.join(', ')} ו${last}`);
    // ProgramResult's SKILL_META[id].he, fallback id with spaces
    const SKILL_HE: Record<string, string> = {
      front_lever: 'פרונט ליבר',
      muscle_up: 'עליית כוח',
      planche: "פלאנץ'",
      handstand: 'עמידת ידיים',
      hspu: 'שכיבות סמיכה בעמידת ידיים',
      one_arm_pullup: 'מתח יד אחת',
      calisthenics_upper: 'קליסטניקס עליון',
    };
    for (const skill of [...Object.keys(SKILL_HE), 'back_lever_x', 'other']) {
      const name = skill.replace(/_/g, ' ');
      expect(t('result.skill', { skill, name }), skill).toBe(SKILL_HE[skill] ?? name);
    }
    // DynamicQuestionRenderer's DIST_OPTIONS labels
    const DIST: Record<string, string> = { '3k': '3 ק״מ', '5k': '5 ק״מ', '10k': '10 ק״מ' };
    for (const [dist, label] of Object.entries(DIST)) {
      expect(t('dynamic.pace.dist', { dist })).toBe(label);
      expect(t('dynamic.pace.title', { dist: label })).toBe(`מעולה! ומה התוצאה הכי טובה שלך כרגע ל-${label}?`);
      expect(t('dynamic.pace.record', { dist: label })).toBe(`השיא שלי ב-${label} הוא:`);
    }
  });

  it('rich messages', () => {
    expect(rich('health.fastTrack.note', {}, ['b'])).toBe(
      '[b:שימו לב:] לחיצה על כפתור זה מצהירה שאתם בריאים ולא סובלים מאף אחת מהבעיות הרפואיות המפורטות בשאלון. אם יש לכם ספק, אנא ענו על כל שאלה בנפרד.',
    );
    const sibling = "גדוד 11 (חי\"ר)";
    expect(rich('hierarchy.add.match', { name: sibling }, ['b'])).toBe(`מצאנו את [b:${sibling}] — זו שלך?`);
  });
});
