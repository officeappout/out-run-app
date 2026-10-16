/** Fixture data for the home design lab — demo values, not real users. */

export type TodayState = 'planned' | 'done' | 'rest';
export type WorkoutLocation = 'park' | 'home' | 'gym';

export const USER = { firstName: 'דני', streakDays: 5 };

export const TODAY_LABEL = 'יום שישי · 16 באוקטובר';

export const WORKOUT = {
  title: 'כוח · פלג גוף עליון',
  program: 'גוף מלא · שבוע 3',
  minutes: 35,
  sets: 24,
  difficulty: 2 as 1 | 2 | 3,
  weekDone: 2,
  weekTarget: 4,
  photo: '/images/gateway/card-strength.png',
  muscles: ['גב', 'חזה', 'כתפיים', 'יד אחורית'],
};

export const DIFFICULTY_LABEL: Record<1 | 2 | 3, string> = { 1: 'קל', 2: 'בינוני', 3: 'מאתגר' };

export const LOCATIONS: { id: WorkoutLocation; label: string }[] = [
  { id: 'park', label: 'גינת כושר' },
  { id: 'home', label: 'בבית' },
  { id: 'gym', label: 'חדר כושר' },
];

export const EQUIPMENT: Record<WorkoutLocation, string[]> = {
  park: ['מתח', 'מקבילים'],
  home: ['כיסא', 'גומיית התנגדות'],
  gym: ['מוט', 'משקולות יד', 'כבלים'],
};

export interface LabExercise {
  name: string;
  detail: string;
}

export const EXERCISES: Record<WorkoutLocation, { warmup: LabExercise[]; main: LabExercise[]; cooldown: LabExercise[] }> = {
  park: {
    warmup: [
      { name: 'סיבובי כתפיים', detail: '45 שניות' },
      { name: 'תלייה פסיבית', detail: '2 × 20 שניות' },
    ],
    main: [
      { name: 'מתח אוסטרלי', detail: '3 סטים × 8–10' },
      { name: 'שכיבות סמיכה', detail: '3 סטים × 10–12' },
      { name: 'מקבילים', detail: '3 סטים × 6–8' },
      { name: 'מתח בתפיסה רחבה', detail: '3 סטים × 4–6' },
      { name: 'פייק פוש־אפ', detail: '3 סטים × 8' },
    ],
    cooldown: [{ name: 'מתיחת חזה וכתפיים', detail: '2 דק׳' }],
  },
  home: {
    warmup: [
      { name: 'סיבובי כתפיים', detail: '45 שניות' },
      { name: 'חתירה עם גומייה', detail: '15 חזרות' },
    ],
    main: [
      { name: 'חתירה בגומייה', detail: '3 סטים × 12' },
      { name: 'שכיבות סמיכה', detail: '3 סטים × 10–12' },
      { name: 'מקבילים על כיסא', detail: '3 סטים × 10' },
      { name: 'משיכת גומייה מעל הראש', detail: '3 סטים × 12' },
      { name: 'פייק פוש־אפ', detail: '3 סטים × 8' },
    ],
    cooldown: [{ name: 'מתיחת חזה וכתפיים', detail: '2 דק׳' }],
  },
  gym: {
    warmup: [
      { name: 'חתירה במכונה', detail: '3 דק׳' },
      { name: 'סיבובי כתפיים', detail: '45 שניות' },
    ],
    main: [
      { name: 'פולי עליון', detail: '3 סטים × 10' },
      { name: 'לחיצת חזה במשקולות', detail: '3 סטים × 8–10' },
      { name: 'חתירה בכבל', detail: '3 סטים × 10' },
      { name: 'לחיצת כתפיים', detail: '3 סטים × 8' },
      { name: 'פשיטת מרפק בכבל', detail: '3 סטים × 12' },
    ],
    cooldown: [{ name: 'מתיחת חזה וכתפיים', detail: '2 דק׳' }],
  },
};

export const PARKS = [
  { name: 'גינת כושר דבורה הנביאה', distance: '350 מ׳', gear: 'מתח · מקבילים', people: 3 },
  { name: 'פארק הירקון — שער 7', distance: '1.2 ק״מ', gear: 'מתח · ספסלים', people: 5 },
  { name: 'גן העצמאות', distance: '1.8 ק״מ', gear: 'מקבילים', people: 1 },
];

export type DayStatus = 'done' | 'today' | 'planned' | 'rest' | 'missed';

/** Sunday → Saturday; the RTL row draws Sunday on the right. */
export const WEEK: { short: string; date: number; status: DayStatus; kind?: 'strength' | 'walk' | 'run' }[] = [
  { short: 'א׳', date: 11, status: 'done', kind: 'strength' },
  { short: 'ב׳', date: 12, status: 'rest' },
  { short: 'ג׳', date: 13, status: 'done', kind: 'run' },
  { short: 'ד׳', date: 14, status: 'missed', kind: 'strength' },
  { short: 'ה׳', date: 15, status: 'rest' },
  { short: 'ו׳', date: 16, status: 'today', kind: 'strength' },
  { short: 'ש׳', date: 17, status: 'planned', kind: 'walk' },
];

export const AGENDA = [
  { time: '07:00', title: 'אימון כוח · פלג גוף עליון', meta: '35 דק׳ · גינת כושר', kind: 'strength' as const, now: true },
  { time: '12:30', title: '2,000 צעדים בהפסקה', meta: 'נשארו 1,760 ליעד היומי', kind: 'steps' as const },
  { time: '18:30', title: 'הליכה קבוצתית בשכונה', meta: 'פארק הירקון · 6 נרשמו', kind: 'group' as const },
];

export const STEPS = {
  today: 6240,
  goal: 8000,
  week: [
    { key: 'su', label: 'א׳', value: 8420 },
    { key: 'mo', label: 'ב׳', value: 5310 },
    { key: 'tu', label: 'ג׳', value: 9120 },
    { key: 'we', label: 'ד׳', value: 4870 },
    { key: 'th', label: 'ה׳', value: 8050 },
    { key: 'fr', label: 'ו׳', value: 6240 },
    { key: 'sa', label: 'ש׳', value: 0 },
  ],
};

export const PROGRAM = { name: 'גוף מלא', level: 4, pct: 68, toNext: 3 };

/** Weekly active minutes vs the WHO's 150-minute recommendation. */
export const ACTIVE_MINUTES = { done: 95, goal: 150 };

export const SUGGESTIONS = [
  { title: 'ריצה קלה', meta: '25 דק׳ · 3.5 ק״מ', tone: 'run' as const },
  { title: 'הליכה מהירה', meta: '30 דק׳ · כ־3,500 צעדים', tone: 'steps' as const },
  { title: 'מתיחות ושחרור', meta: '12 דק׳ · בבית', tone: 'accent' as const },
];
