/** Fixture data for the leagues design lab — demo values, not real users. */

export type LeagueTab = 'people' | 'neighborhoods' | 'cities' | 'units';

export const SEASON = { name: 'עונת הסתיו', week: 3, weeks: 8, daysLeft: 2 };

/** People board of the selected league. */
export const PEOPLE_BOARD = {
  size: 214,
  me: { rank: 7, points: 412, nextName: 'שירה מ.', toNext: 37 },
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
};

/** Leagues the viewer is in — automatic ones (neighborhood, city) plus ones people open themselves. */
export const MY_LEAGUES = [
  { id: 'neighborhood', name: 'ליגת הצפון הישן', sub: 'שכונה · ציבורית', rank: 7, members: 214, kind: 'neighborhood' as const },
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
  mine: { name: 'הצפון הישן', totalSteps: 2410000, perMember: 186, active: 214 },
  rival: { name: 'פלורנטין', totalSteps: 3980000, perMember: 171, active: 388 },
  myContribution: { minutes: 85, share: 4 },
  daysLeft: 2,
};

export const NEIGHBORHOODS = [
  { name: 'הצפון הישן', totalSteps: 2410000, perMember: 186, active: 214, delta: 1, me: true },
  { name: 'פלורנטין', totalSteps: 3980000, perMember: 171, active: 388, delta: -1 },
  { name: 'נווה צדק', totalSteps: 890000, perMember: 164, active: 97, delta: 2 },
  { name: 'רמת אביב', totalSteps: 2870000, perMember: 152, active: 301, delta: 0 },
  { name: 'יד אליהו', totalSteps: 1530000, perMember: 139, active: 176, delta: 3 },
  { name: 'יפו', totalSteps: 2110000, perMember: 128, active: 242, delta: -2 },
];

export const CITIES = [
  { name: 'שדרות', totalSteps: 14200000, perMember: 211, active: 1240, delta: 2, size: 'small' },
  { name: 'תל אביב־יפו', totalSteps: 98400000, perMember: 174, active: 9870, delta: 0, me: true, size: 'large' },
  { name: 'חיפה', totalSteps: 60100000, perMember: 169, active: 6120, delta: 1, size: 'large' },
  { name: 'קריית ים', totalSteps: 7600000, perMember: 158, active: 830, delta: -1, size: 'small' },
  { name: 'אשקלון', totalSteps: 19800000, perMember: 151, active: 2210, delta: -2, size: 'medium' },
  { name: 'באר שבע', totalSteps: 30500000, perMember: 140, active: 3460, delta: 1, size: 'large' },
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
    { name: 'גדוד אלון', totalMinutes: 9800, participation: 86, avgMinutes: 142, delta: 1 },
    { name: 'גדוד ברק', totalMinutes: 12400, participation: 81, avgMinutes: 155, delta: 0, me: true },
    { name: 'גדוד גפן', totalMinutes: 8100, participation: 74, avgMinutes: 128, delta: 2 },
    { name: 'גדוד דקל', totalMinutes: 10300, participation: 69, avgMinutes: 117, delta: -1 },
    { name: 'גדוד הדס', totalMinutes: 6200, participation: 58, avgMinutes: 101, delta: -2 },
  ],
  brigades: [
    { name: 'חטיבת הצפון', score: 78, totalMinutes: 46800, me: true },
    { name: 'חטיבת המרכז', score: 74, totalMinutes: 51200 },
    { name: 'חטיבת הדרום', score: 71, totalMinutes: 38900 },
  ],
  myCompany: { name: 'פלוגה ב׳', toTop: 3 },
};
