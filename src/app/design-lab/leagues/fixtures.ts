/** Fixture data for the leagues design lab — demo values, not real users. */

export type LeagueTab = 'people' | 'neighborhoods' | 'cities' | 'units';

export const SEASON = { name: 'עונת הסתיו', week: 3, weeks: 8, daysLeft: 2 };

export const DIVISIONS = [
  { id: 'bronze', label: 'ארד', color: '#c98a5a' },
  { id: 'silver', label: 'כסף', color: '#9fb0bd' },
  { id: 'gold', label: 'זהב', color: '#ffc83d' },
  { id: 'diamond', label: 'יהלום', color: '#00baf7' },
] as const;

/** The viewer's personal division: 20 people, top 5 move up, bottom 3 move down. */
export const MY_DIVISION = {
  division: 'silver' as const,
  promoteTop: 5,
  relegateBottom: 3,
  size: 20,
  me: { rank: 7, points: 412, toPromotion: 58 },
  rows: [
    { name: 'רוני א.', points: 640, delta: 1 },
    { name: 'מיכל ש.', points: 598, delta: 0 },
    { name: 'עומר ב.', points: 551, delta: 2 },
    { name: 'נועה ל.', points: 503, delta: -1 },
    { name: 'יואב ג.', points: 470, delta: 3 },
    { name: 'שירה מ.', points: 448, delta: -2 },
    { name: 'אתה', points: 412, delta: 4, me: true },
    { name: 'איתי ר.', points: 398, delta: -1 },
    { name: 'דנה כ.', points: 377, delta: 0 },
  ],
  bottom: [
    { name: 'אלון ט.', points: 120, delta: -1, rank: 18 },
    { name: 'גיל פ.', points: 96, delta: 0, rank: 19 },
    { name: 'ליה ד.', points: 61, delta: -3, rank: 20 },
  ],
};

/** Leagues the viewer is in — the season division plus leagues people open themselves. */
export const MY_LEAGUES = [
  { id: 'division', name: 'ליגת כסף', sub: 'העונה · 20 מתאמנים', rank: 7, members: 20, kind: 'division' as const },
  { id: 'city', name: 'ליגת העיר', sub: 'תל אביב־יפו · כללי', rank: 41, members: 9870, kind: 'city' as const },
  { id: 'work', name: 'החבר׳ה מהמשרד', sub: 'ליגה פרטית · צעדים', rank: 2, members: 12, kind: 'private' as const },
  { id: 'family', name: 'משפחת כהן', sub: 'ליגה פרטית · דקות פעילות', rank: 1, members: 6, kind: 'private' as const },
];

/** Bonus for bringing friends in: points land in every league you're in. */
export const INVITES = { joined: 2, pending: 1, perFriend: 50, cap: 5 };

export const POINTS_RULES = [
  { label: 'דקת אימון כוח', pts: '2' },
  { label: 'דקת ריצה או הליכה מהירה', pts: '1' },
  { label: '1,000 צעדים', pts: '3' },
  { label: 'אימון בקבוצה', pts: '×1.5' },
  { label: 'חבר שהצטרף בהזמנה שלך', pts: '+50' },
];

export const BATTLE = {
  mine: { name: 'הצפון הישן', perMember: 186, active: 214 },
  rival: { name: 'פלורנטין', perMember: 171, active: 388 },
  myContribution: { minutes: 85, share: 4 },
  daysLeft: 2,
};

export const NEIGHBORHOODS = [
  { name: 'הצפון הישן', perMember: 186, active: 214, delta: 1, me: true },
  { name: 'פלורנטין', perMember: 171, active: 388, delta: -1 },
  { name: 'נווה צדק', perMember: 164, active: 97, delta: 2 },
  { name: 'רמת אביב', perMember: 152, active: 301, delta: 0 },
  { name: 'יד אליהו', perMember: 139, active: 176, delta: 3 },
  { name: 'יפו', perMember: 128, active: 242, delta: -2 },
];

export const CITIES = [
  { name: 'שדרות', perMember: 211, active: 1240, delta: 2, size: 'small' },
  { name: 'תל אביב־יפו', perMember: 174, active: 9870, delta: 0, me: true, size: 'large' },
  { name: 'חיפה', perMember: 169, active: 6120, delta: 1, size: 'large' },
  { name: 'קריית ים', perMember: 158, active: 830, delta: -1, size: 'small' },
  { name: 'אשקלון', perMember: 151, active: 2210, delta: -2, size: 'medium' },
  { name: 'באר שבע', perMember: 140, active: 3460, delta: 1, size: 'large' },
];

export const CITY_CHALLENGE = {
  a: 'תל אביב־יפו',
  b: 'חיפה',
  goal: 'מיליון דקות פעילות באוקטובר',
  aPct: 64,
  bPct: 58,
};

/** Unit names are invented. */
export const UNITS = {
  brigade: 'חטיבת הצפון',
  rows: [
    { name: 'גדוד אלון', participation: 86, avgMinutes: 142, delta: 1 },
    { name: 'גדוד ברק', participation: 81, avgMinutes: 155, delta: 0, me: true },
    { name: 'גדוד גפן', participation: 74, avgMinutes: 128, delta: 2 },
    { name: 'גדוד דקל', participation: 69, avgMinutes: 117, delta: -1 },
    { name: 'גדוד הדס', participation: 58, avgMinutes: 101, delta: -2 },
  ],
  brigades: [
    { name: 'חטיבת הצפון', score: 78, me: true },
    { name: 'חטיבת המרכז', score: 74 },
    { name: 'חטיבת הדרום', score: 71 },
  ],
  myCompany: { name: 'פלוגה ב׳', toTop: 3 },
};
