/**
 * Entry flow v2 — the landing + the 5-barrier intro stories (enable_entry_intro_v1).
 * All copy, verbatim from the owner's design canvas (intro-S1/SB/S2–S6/G1, brief E),
 * plus the per-story data the screens are driven by. Plain data, no React.
 */

/** The deck's five tones, top segment first, clockwise (website BarrierRing TONES). */
export const RING_TONES = ['#4fb3ea', '#52c3e0', '#55cfd9', '#5ddcd4', '#67e6d3'] as const;
/** An un-lit ring segment. */
export const RING_GREY = '#e2e8f0';

export const INTRO_IMG = '/images/intro';

export const LANDING_COPY = {
  titlePre: 'ברוכים הבאים ל-',
  sub: 'יחד הופכים את כל העיר לחדר כושר.',
  cityAlt: 'איור של העיר: מגדלים, שדרה, שביל אופניים, עגלות, רצים וגינת כושר',
  cta: 'הרשמה מהירה',
  login: 'התחברות',
} as const;

export const BRIDGE_COPY = {
  eyebrow: 'למה קשה להתמיד?',
  titleLines: ['זו לא אשמתכם', 'שקשה להתמיד.'],
  lead: 'יש לזה חמש סיבות עיקריות.',
  closingLines: ['וכל אחד מהם אפשר להסיר.', 'בואו נראה איך OUT עושה את זה.'],
  cta: 'בואו נראה',
} as const;

export const INTRO_UI = {
  next: 'הבא',
  skip: 'דלג',
  of: (i: number, total: number) => `${i} מתוך ${total}`,
  pushApp: 'OUT',
  pushNow: 'עכשיו',
} as const;

export type StorySide = 'left' | 'right';

export interface BarrierStory {
  /** Stable id — also the asset suffix (sad-{id}.jpg, happy-{id}.png). */
  id: 'alon' | 'michal' | 'dani' | 'omer' | 'ruti';
  /** The barrier's name — the ring label and the header badge. */
  barrier: string;
  /** The in-phone app screen asset (phone-{phone}.jpg). */
  phone: 'time' | 'community' | 'access' | 'money' | 'knowledge';
  /** Name + age line under the character. */
  person: string;
  side: StorySide;
  thought: string;
  push: string;
  /** The lock-screen clock (24h). */
  clock: string;
  titleLines: readonly [string, string];
  sub: string;
}

/** The five stories, in ring order (clockwise from the top). */
export const BARRIER_STORIES: readonly BarrierStory[] = [
  {
    id: 'alon',
    barrier: 'זמן',
    phone: 'time',
    person: 'אלון, 30',
    side: 'left',
    thought: '„אין לי זמן להתאמן. אני בעבודה כל היום.”',
    push: 'בנינו לך מסלול של 20 דקות בדרך לעבודה, והוא משלים את היעד השבועי שלך.',
    clock: '07:40',
    titleLines: ['אין זמן?', 'בדרך לעבודה'],
    sub: 'מסלול של 20 דקות שמשתלב ביום שלך, באופניים, ברגל או בריצה.',
  },
  {
    id: 'michal',
    barrier: 'קהילה',
    phone: 'community',
    person: 'מיכל, 35',
    side: 'right',
    thought: '„חדשה בשכונה, ומחפשת חברות להתאמן איתן.”',
    push: 'קבוצת ההליכה של האמהות בשכונה יוצאת ב-19:00, ו-3 כבר אישרו.',
    clock: '18:20',
    titleLines: ['מתאמנות יחד,', 'בשכונה'],
    sub: 'קבוצות הליכה וריצה לידך. רואים מי יוצאת היום, ומצטרפים בלחיצה.',
  },
  {
    id: 'dani',
    barrier: 'נגישות',
    phone: 'access',
    person: 'דני, 42',
    side: 'left',
    thought: '„אין לי מקום נוח להתאמן ליד הבית, ומישהו צריך להישאר עם הילדים.”',
    push: 'בדרך חזרה מהגן, עצירה קצרה בפארק לאימון עם הילדים.',
    clock: '16:40',
    titleLines: ['גינה ליד הבית,', 'גם עם הילדים'],
    sub: 'OUT מוצאת לך גינה קרובה, ובונה אימון קצר בזמן שהילדים משחקים.',
  },
  {
    id: 'omer',
    barrier: 'כסף',
    phone: 'money',
    person: 'עומר, 22 · סטודנט',
    side: 'left',
    thought: '„אני סטודנט, אין לי כסף לחדר כושר. מתי אני כבר אצליח לעשות מתח?”',
    push: 'עוד אימון אחד ואתה עולה לרמה 8. בפעם הבאה: מתח מלא!',
    clock: '17:30',
    titleLines: ['נגיש לכל כיס,', 'מפת התקדמות בקליסטניקס'],
    sub: 'בלי מנוי לחדר כושר ובלי ציוד, במחיר שמתאים גם לסטודנטים. כל אימון מקדם אותך באחוזים.',
  },
  {
    id: 'ruti',
    barrier: 'ידע',
    phone: 'knowledge',
    person: 'רותי, 68',
    side: 'right',
    thought: '„אני לא יודעת איך להתאמן, ואני מפחדת להיפצע.”',
    push: 'הכנו לך מסלול עם תרגילים קלים ובטוחים. אל דאגה, נלווה אותך צעד-צעד.',
    clock: '08:15',
    titleLines: ['כל כך פשוט,', 'שגם ההורים שלך יסתדרו'],
    sub: 'סרטון לכל תרגיל, מספר חזרות וכפתור אחד גדול. בלי מושגים, בלי לחץ.',
  },
] as const;

export const BARRIER_LABELS: readonly string[] = BARRIER_STORIES.map((s) => s.barrier);

/** Every image a story screen shows — preloaded one screen ahead. */
export function storyImages(story: BarrierStory): string[] {
  return [
    `${INTRO_IMG}/sad-${story.id}.jpg`,
    `${INTRO_IMG}/happy-${story.id}.png`,
    `${INTRO_IMG}/phone-${story.phone}.jpg`,
  ];
}
