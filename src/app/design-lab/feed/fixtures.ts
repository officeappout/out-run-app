/** Feed lab fixtures — made-up people, no photos of people (initials only). */

export type Activity = 'strength' | 'cardio' | 'maintenance';
export type Audience = 'partners' | 'neighborhood' | 'public' | 'private';
export type FeedFilter = 'all' | 'partners' | 'neighborhood' | 'groups';

export const ACTIVITY: Record<Activity, { label: string; hex: string; rgb: string; icon: string }> = {
  strength: { label: 'כוח', hex: '#00baf7', rgb: '0,186,247', icon: '/icons/programs/muscle.svg' },
  cardio: { label: 'אירובי', hex: '#84cc16', rgb: '132,204,22', icon: '/icons/programs/Run.svg' },
  maintenance: { label: 'תחזוקה', hex: '#8b5cf6', rgb: '139,92,246', icon: '/icons/programs/walking.svg' },
};

export const AUDIENCE: Record<Audience, { label: string; hint: string }> = {
  partners: { label: 'שותפים', hint: 'רק מי שאת/ה עוקב/ת אחריו והוא אחריך' },
  neighborhood: { label: 'השכונה', hint: 'מתאמנים מהשכונה שלך' },
  public: { label: 'כולם', hint: 'כל משתמשי OUT' },
  private: { label: 'רק אני', hint: 'נשמר אצלך, לא מתפרסם' },
};

export interface Person {
  name: string;
  initial: string;
  tint: string;
  place: string;
}

export const ME: Person = { name: 'דוד', initial: 'ד', tint: '#bae6fd', place: 'נווה זאב' };

const P = {
  noa: { name: 'נועה לוי', initial: 'נ', tint: '#c7f9e9', place: 'נווה זאב' },
  yoni: { name: 'יוני כהן', initial: 'י', tint: '#fde68a', place: 'רמות' },
  maya: { name: 'מאיה ש.', initial: 'מ', tint: '#e9d5ff', place: 'נווה זאב' },
  avi: { name: 'אבי פרץ', initial: 'א', tint: '#fecdd3', place: 'העיר העתיקה' },
} satisfies Record<string, Person>;

export type Post =
  | {
      id: string;
      kind: 'workout';
      who: Person;
      ago: string;
      activity: Activity;
      title: string;
      minutes: number;
      points: number;
      muscles?: string[];
      park?: string;
      cheers: number;
      comments: number;
      cheered?: boolean;
      audience: Audience;
      group?: string;
    }
  | {
      id: string;
      kind: 'run';
      who: Person;
      ago: string;
      title: string;
      km: number;
      pace: string;
      minutes: number;
      points: number;
      route: [number, number][];
      cheers: number;
      comments: number;
      cheered?: boolean;
      audience: Audience;
      pr?: string;
    }
  | {
      id: string;
      kind: 'streak';
      who: Person;
      ago: string;
      days: number;
      cheers: number;
      comments: number;
      audience: Audience;
    }
  | {
      id: string;
      kind: 'league';
      ago: string;
      scope: string;
      rank: number;
      prev: number;
      note: string;
    }
  | {
      id: string;
      kind: 'session';
      ago: string;
      group: string;
      park: string;
      people: string[];
      more: number;
      minutes: number;
    };

const ROUTE: [number, number][] = [
  [20, 70], [34, 58], [52, 54], [66, 40], [88, 34], [112, 40], [128, 28], [150, 22], [172, 30], [186, 48], [178, 66], [158, 74], [130, 78], [104, 86], [76, 84], [50, 88], [28, 82], [20, 70],
];

export const POSTS: Post[] = [
  {
    id: 'p1', kind: 'run', who: P.noa, ago: 'לפני 40 דק׳', title: 'ריצת בוקר בפארק', km: 5.2, pace: '5:48', minutes: 30, points: 30,
    route: ROUTE, cheers: 12, comments: 3, audience: 'neighborhood', pr: 'שיא אישי ב-5 ק״מ',
  },
  {
    id: 'p2', kind: 'workout', who: P.yoni, ago: 'לפני שעה', activity: 'strength', title: 'כוח עליון · מתח ומקבילים', minutes: 35, points: 70,
    muscles: ['גב', 'חזה', 'יד אחורית'], park: 'פארק רמות', cheers: 8, comments: 1, cheered: true, audience: 'partners',
  },
  { id: 'p3', kind: 'league', ago: 'היום', scope: 'נווה זאב', rank: 2, prev: 4, note: 'עליתם 2 מקומות בליגת השכונות של באר שבע' },
  { id: 'p4', kind: 'streak', who: P.maya, ago: 'לפני 3 שעות', days: 14, cheers: 21, comments: 5, audience: 'partners' },
  {
    id: 'p5', kind: 'session', ago: 'אתמול', group: 'רצים של נווה זאב', park: 'פארק נחל עשן', people: ['נ', 'מ', 'א', 'ש'], more: 5, minutes: 45,
  },
  {
    id: 'p6', kind: 'workout', who: P.avi, ago: 'אתמול', activity: 'maintenance', title: 'מתיחות ומוביליטי', minutes: 20, points: 20,
    cheers: 4, comments: 0, audience: 'public', group: 'גמישות 50+',
  },
];

export const COMMENTS = [
  { who: P.yoni, text: 'וואו איזה קצב! מחר אני מצטרף', ago: '30 דק׳' },
  { who: P.maya, text: 'אלופה 🔥', ago: '25 דק׳' },
  { who: P.avi, text: 'איזה מסלול זה? נראה מעולה', ago: '10 דק׳' },
];

export const CHEERERS = [P.yoni, P.maya, P.avi, { name: 'שירה', initial: 'ש', tint: '#bae6fd', place: '' }];

export const QUICK_REPLIES = ['כל הכבוד!', 'אלופה 💪', 'מחר איתך?', 'איזה קצב'];

export interface ProfileTile {
  activity: Activity;
  title: string;
  value: string;
  unit: string;
  day: string;
  cheers: number;
  route?: boolean;
  pr?: boolean;
  private?: boolean;
  streak?: number;
}

/** Profile — your own posts as tiles, newest first. */
export const PROFILE = {
  me: { ...ME, bio: 'מתאמן בפארק כל בוקר', partners: 18, following: 24 },
  stats: [
    { label: 'אימונים החודש', value: '14' },
    { label: 'דקות', value: '512' },
    { label: 'רצף', value: '9 ימים' },
  ],
  highlights: [
    { label: 'שיא 5 ק״מ', value: '27:40', activity: 'cardio' as Activity },
    { label: 'מתח ברצף', value: '14', activity: 'strength' as Activity },
    { label: 'רצף שיא', value: '21 ימים', activity: 'strength' as Activity },
  ],
  tiles: [
    { activity: 'strength', title: 'כוח עליון', value: '35', unit: 'דק׳', day: 'היום', cheers: 8 },
    { activity: 'cardio', title: 'ריצת בוקר', value: '5.2', unit: 'ק״מ', day: 'אתמול', cheers: 12, route: true, pr: true },
    { activity: 'strength', title: 'רגליים וליבה', value: '40', unit: 'דק׳', day: 'ד׳', cheers: 5 },
    { activity: 'maintenance', title: 'מתיחות', value: '20', unit: 'דק׳', day: 'ג׳', cheers: 0, private: true },
    { activity: 'cardio', title: 'הליכה מהירה', value: '3.1', unit: 'ק״מ', day: 'ב׳', cheers: 3, route: true },
    { activity: 'strength', title: 'פול באדי', value: '30', unit: 'דק׳', day: 'א׳', cheers: 6 },
    { activity: 'strength', title: 'מתח ומקבילים', value: '45', unit: 'דק׳', day: 'ש׳', cheers: 9, streak: 14 },
    { activity: 'cardio', title: 'ריצה ארוכה', value: '8.0', unit: 'ק״מ', day: 'ו׳', cheers: 15, route: true },
    { activity: 'maintenance', title: 'מוביליטי', value: '15', unit: 'דק׳', day: 'ה׳', cheers: 2 },
  ] as ProfileTile[],
};
