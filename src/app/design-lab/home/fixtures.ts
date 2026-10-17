/** Fixture data for the home design lab — demo values, not real users. */

export type TodayState = 'planned' | 'done' | 'rest';
export type WorkoutLocation = 'park' | 'home' | 'gym';

export const USER = { firstName: 'דני', streakDays: 5, bestStreak: 12 };

export const TODAY_LABEL = 'שישי, 16 באוקטובר';

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
  /** Bunny Stream video id (public exercise library) — for the thumbnail. */
  video: string;
}

export const EXERCISES: Record<WorkoutLocation, { warmup: LabExercise[]; main: LabExercise[]; cooldown: LabExercise[] }> = {
  park: {
    warmup: [
      { name: 'סיבובי כתפיים', detail: '45 שניות', video: 'f82f157e-511a-402e-a2db-a7d348ac233a' },
      { name: 'תלייה פסיבית', detail: '2 × 20 שניות', video: 'a5367716-ecd2-4764-ab32-409506623fe7' },
    ],
    main: [
      { name: 'מתח אוסטרלי', detail: '3 סטים × 8–10', video: '4c084207-943c-4de8-a52b-b820db1c0ad9' },
      { name: 'שכיבות סמיכה', detail: '3 סטים × 10–12', video: '704d0e9a-a2ea-4e29-b8ed-b4dcef8c6384' },
      { name: 'מקבילים', detail: '3 סטים × 6–8', video: '912c9beb-a881-4593-980b-38189b5db773' },
      { name: 'מתח בתפיסה רחבה', detail: '3 סטים × 4–6', video: 'a5367716-ecd2-4764-ab32-409506623fe7' },
      { name: 'פייק פוש־אפ', detail: '3 סטים × 8', video: 'a4325b8a-be75-455b-a793-ca4286ab0176' },
    ],
    cooldown: [{ name: 'מתיחת חזה וכתפיים', detail: '2 דק׳', video: '1bded9a1-b3ca-4263-99c8-e75800a76d99' }],
  },
  home: {
    warmup: [
      { name: 'סיבובי כתפיים', detail: '45 שניות', video: 'f82f157e-511a-402e-a2db-a7d348ac233a' },
      { name: 'חתירה עם גומייה', detail: '15 חזרות', video: 'c5304f9e-26e4-4aaf-b5d9-29bda9673ba3' },
    ],
    main: [
      { name: 'חתירה בגומייה', detail: '3 סטים × 12', video: 'c5304f9e-26e4-4aaf-b5d9-29bda9673ba3' },
      { name: 'שכיבות סמיכה', detail: '3 סטים × 10–12', video: '704d0e9a-a2ea-4e29-b8ed-b4dcef8c6384' },
      { name: 'מקבילים על כיסא', detail: '3 סטים × 10', video: '912c9beb-a881-4593-980b-38189b5db773' },
      { name: 'משיכת גומייה מעל הראש', detail: '3 סטים × 12', video: '93b57964-278c-4c96-b2bb-8af3fa20b43b' },
      { name: 'פייק פוש־אפ', detail: '3 סטים × 8', video: 'a4325b8a-be75-455b-a793-ca4286ab0176' },
    ],
    cooldown: [{ name: 'מתיחת חזה וכתפיים', detail: '2 דק׳', video: '1bded9a1-b3ca-4263-99c8-e75800a76d99' }],
  },
  gym: {
    warmup: [
      { name: 'חתירה במכונה', detail: '3 דק׳', video: 'f82f157e-511a-402e-a2db-a7d348ac233a' },
      { name: 'סיבובי כתפיים', detail: '45 שניות', video: 'f82f157e-511a-402e-a2db-a7d348ac233a' },
    ],
    main: [
      { name: 'פולי עליון', detail: '3 סטים × 10', video: 'a5367716-ecd2-4764-ab32-409506623fe7' },
      { name: 'לחיצת חזה במשקולות', detail: '3 סטים × 8–10', video: '704d0e9a-a2ea-4e29-b8ed-b4dcef8c6384' },
      { name: 'חתירה בכבל', detail: '3 סטים × 10', video: '4c084207-943c-4de8-a52b-b820db1c0ad9' },
      { name: 'לחיצת כתפיים', detail: '3 סטים × 8', video: 'a4325b8a-be75-455b-a793-ca4286ab0176' },
      { name: 'פשיטת מרפק בכבל', detail: '3 סטים × 12', video: 'b3fb2cec-0daf-4337-892f-839acffb5bb9' },
    ],
    cooldown: [{ name: 'מתיחת חזה וכתפיים', detail: '2 דק׳', video: '1bded9a1-b3ca-4263-99c8-e75800a76d99' }],
  },
};

export const PARKS = [
  { name: 'גינת כושר דבורה הנביאה', distance: '350 מ׳', gear: 'מתח · מקבילים', people: 3 },
  { name: 'פארק הירקון — שער 7', distance: '1.2 ק״מ', gear: 'מתח · ספסלים', people: 5 },
  { name: 'גן העצמאות', distance: '1.8 ק״מ', gear: 'מקבילים', people: 1 },
];

export type DayStatus = 'done' | 'today' | 'planned' | 'rest' | 'missed';

/** Sunday → Saturday; the RTL row draws Sunday on the right. */
export const WEEK: {
  short: string;
  date: number;
  status: DayStatus;
  kind?: 'strength' | 'walk' | 'run' | 'steps';
  kinds?: ('strength' | 'walk' | 'run' | 'steps')[];
}[] = [
  { short: 'א׳', date: 11, status: 'done', kind: 'strength' },
  { short: 'ב׳', date: 12, status: 'done', kind: 'steps' },
  { short: 'ג׳', date: 13, status: 'done', kind: 'run' },
  { short: 'ד׳', date: 14, status: 'done', kind: 'strength', kinds: ['strength', 'steps'] },
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

/** Today's carousel — the first card is the planned workout. */
export const TODAY_CARDS = [
  { id: 'balanced', label: 'מאוזן', title: 'אימון בפארק', minutes: 30, level: 2 as 1 | 2 | 3, photo: '/images/gateway/card-strength.png', gear: 'pullBar' as const },
  { id: 'intense', label: 'עצים ומהיר', title: 'אימון כוח עצים בפארק', minutes: 20, level: 3 as 1 | 2 | 3, photo: 'thumb:a5367716-ecd2-4764-ab32-409506623fe7', gear: 'bars' as const },
  { id: 'light', label: 'אימון פארק קליל', title: 'אימון התאוששות בפארק', minutes: 15, level: 1 as 1 | 2 | 3, photo: 'thumb:1bded9a1-b3ca-4263-99c8-e75800a76d99', gear: 'bench' as const },
];

export const NEARBY_PARKS = [
  { id: 'devora', name: 'גינת כושר דבורה הנביאה', distance: '350 מ׳', photo: 'thumb:a5367716-ecd2-4764-ab32-409506623fe7', active: 3 },
  { id: 'yarkon', name: 'פארק הירקון — שער 7', distance: '1.2 ק״מ', photo: 'thumb:704d0e9a-a2ea-4e29-b8ed-b4dcef8c6384', active: 5 },
  { id: 'atzmaut', name: 'גן העצמאות', distance: '1.8 ק״מ', photo: 'thumb:912c9beb-a881-4593-980b-38189b5db773', active: 1 },
];

/** Steps detail — last 7 days, and hourly today. */
export const STEPS_DETAIL = {
  today: 16554,
  goal: 8000,
  vsLastWeek: 32,
  best: 16554,
  dailyAvg: 9558,
  streak: 94,
  daysOnGoal: 5,
  distanceKm: 7.4,
  week: [
    { label: 'א׳', value: 8420 },
    { label: 'ב׳', value: 5310 },
    { label: 'ג׳', value: 9120 },
    { label: 'ד׳', value: 4870 },
    { label: 'ה׳', value: 8050 },
    { label: 'ו׳', value: 16554 },
    { label: 'ש׳', value: 0 },
  ],
  month: [6200, 7100, 5400, 8800, 9200, 7600, 6900, 10400, 8100, 7300, 9800, 6600, 9558, 16554].map((value, i) => ({
    label: i % 2 === 0 ? String(3 + i) : '',
    value,
  })),
};

/** Two weeks of the planner. */
export const PLAN = [
  {
    range: '11–17 אוקטובר',
    days: [
      { d: 'א׳', n: 11, items: ['אימון בפארק'] as string[], done: true },
      { d: 'ב׳', n: 12, items: ['8,000 צעדים'], done: true },
      { d: 'ג׳', n: 13, items: ['ריצה קלה'], done: true },
      { d: 'ד׳', n: 14, items: ['אימון משולב'], done: true },
      { d: 'ה׳', n: 15, items: [], done: false },
      { d: 'ו׳', n: 16, items: ['אימון בפארק'], done: false, today: true },
      { d: 'ש׳', n: 17, items: ['הליכה קבוצתית'], done: false },
    ],
  },
  {
    range: '18–24 אוקטובר',
    days: [
      { d: 'א׳', n: 18, items: ['כוח · פלג גוף עליון'], done: false },
      { d: 'ב׳', n: 19, items: [], done: false },
      { d: 'ג׳', n: 20, items: ['ריצה קלה'], done: false },
      { d: 'ד׳', n: 21, items: [], done: false },
      { d: 'ה׳', n: 22, items: ['כוח · רגליים'], done: false },
      { d: 'ו׳', n: 23, items: [], done: false },
      { d: 'ש׳', n: 24, items: ['הליכה קבוצתית'], done: false },
    ],
  },
];

export const PARK = {
  name: 'גינת כושר דבורה הנביאה',
  city: 'תל אביב־יפו',
  distance: '350 מ׳ ממך',
  photo: 'thumb:a5367716-ecd2-4764-ab32-409506623fe7',
  amenities: ['הצללה', 'ברזיית מים', 'ספסלים', 'תאורה בערב'],
  facilities: [
    { name: 'מתקן מתח', video: 'a5367716-ecd2-4764-ab32-409506623fe7' },
    { name: 'מקבילים', video: '912c9beb-a881-4593-980b-38189b5db773' },
    { name: 'ספסל שכיבות', video: '704d0e9a-a2ea-4e29-b8ed-b4dcef8c6384' },
    { name: 'סולם', video: '0f463574-b7bf-440e-aef5-afb383b93205' },
  ],
  training: {
    today: [
      { time: '07:00', who: 'רוני', what: 'כוח' },
      { time: '07:30', who: 'מיכל', what: 'כוח' },
      { time: '18:00', who: 'עומר', what: 'כתפיים' },
    ],
    tomorrow: [{ time: '08:00', who: 'נועה', what: 'גוף מלא' }],
    week: [
      { time: 'ש׳ 09:00', who: 'יואב', what: 'רגליים' },
      { time: 'א׳ 07:00', who: 'שירה', what: 'כוח' },
    ],
  },
};

export const GROUP = {
  name: 'הליכה בתל אביב',
  kind: 'הליכה',
  where: 'פארק המסילה, תל אביב־יפו',
  price: 'חינם · קבוצה שכונתית',
  photo: 'thumb:f82f157e-511a-402e-a2db-a7d348ac233a',
  next: { label: 'הליכה קבוצתית', when: 'היום, 18:30', inMinutes: 58 },
  goingNext: { count: 9, letters: ['מ', 'ש', 'נ'] },
  goingWeek: { count: 23, letters: ['ר', 'א', 'ע'] },
  sessions: [
    { day: 'היום', time: '18:30', going: 9 },
    { day: 'שני', time: '18:30', going: 6 },
    { day: 'רביעי', time: '07:00', going: 4 },
  ],
};

/** Home variants of today's cards (the location chip switches to these). */
export const TODAY_CARDS_HOME = [
  { id: 'balanced', label: 'מאוזן', title: 'אימון יומי בבית', minutes: 30, level: 2 as 1 | 2 | 3, photo: 'thumb:c5304f9e-26e4-4aaf-b5d9-29bda9673ba3', gear: 'door' as const },
  { id: 'intense', label: 'עצים ומהיר', title: 'בלאסט בבית', minutes: 15, level: 3 as 1 | 2 | 3, photo: 'thumb:704d0e9a-a2ea-4e29-b8ed-b4dcef8c6384', gear: 'chair' as const },
  { id: 'light', label: 'שחרור', title: 'אימון התאוששות בבית', minutes: 12, level: 1 as 1 | 2 | 3, photo: 'thumb:1bded9a1-b3ca-4263-99c8-e75800a76d99', gear: 'mat' as const },
];

/** "קבוצות קרובות אליך" — same row as the app's NearbyGroupsRow. */
export const NEARBY_GROUPS = [
  { id: 'walk', name: 'הליכה בתל אביב', cat: 'walking', catLabel: 'הליכה', next: 'היום 18:30', going: 9, letters: ['מ', 'ש', 'נ'], photo: 'thumb:f82f157e-511a-402e-a2db-a7d348ac233a', km: '0.8 ק״מ' },
  { id: 'run', name: 'רצים בירקון', cat: 'running', catLabel: 'ריצה', next: 'מחר 06:30', going: 14, letters: ['ע', 'ר', 'י'], photo: 'thumb:2ecc9e93-359b-4fc5-b322-a4bad9d5ccf4', km: '1.5 ק״מ' },
  { id: 'park', name: 'כוח בגינה — דבורה הנביאה', cat: 'calisthenics', catLabel: 'כוח', next: 'שבת 09:00', going: 6, letters: ['א', 'ד'], photo: 'thumb:a5367716-ecd2-4764-ab32-409506623fe7', km: '350 מ׳' },
  { id: 'moms', name: 'הליכת אמהות בשכונה', cat: 'community', catLabel: 'קהילתי', next: 'ראשון 10:00', going: 11, letters: ['ל', 'מ', 'ת'], photo: 'thumb:bc6f76c3-e415-4424-b1bd-8cfce59a7b58', km: '1.1 ק״מ' },
];
