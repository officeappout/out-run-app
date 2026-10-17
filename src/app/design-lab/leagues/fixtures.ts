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

export type Region = 'north' | 'haifa' | 'sharon' | 'center' | 'jerusalem' | 'south';
export const REGIONS: { id: Region; label: string }[] = [
  { id: 'north', label: 'צפון' },
  { id: 'haifa', label: 'חיפה והקריות' },
  { id: 'sharon', label: 'שרון' },
  { id: 'center', label: 'מרכז' },
  { id: 'jerusalem', label: 'ירושלים' },
  { id: 'south', label: 'דרום' },
];

export type SettlementKind = 'city' | 'local' | 'kibbutz' | 'moshav';
export const SETTLEMENT_KINDS: { id: SettlementKind; label: string }[] = [
  { id: 'city', label: 'ערים' },
  { id: 'local', label: 'מועצות מקומיות' },
  { id: 'kibbutz', label: 'קיבוצים' },
  { id: 'moshav', label: 'מושבים' },
];

/** Every kind of settlement — names are real places, numbers are demo. */
export const SETTLEMENTS: {
  name: string;
  kind: SettlementKind;
  region: Region;
  size: 'small' | 'medium' | 'large';
  perMember: number;
  active: number;
  totalSteps: number;
  improve: number;
  delta: number;
  me?: boolean;
}[] = [
  { name: 'קיבוץ סעד', kind: 'kibbutz', region: 'south', size: 'small', perMember: 232, active: 140, totalSteps: 1900000, improve: 18, delta: 3 },
  { name: 'שדרות', kind: 'city', region: 'south', size: 'small', perMember: 211, active: 1240, totalSteps: 14200000, improve: 9, delta: 2 },
  { name: 'מושב נהלל', kind: 'moshav', region: 'north', size: 'small', perMember: 204, active: 95, totalSteps: 1200000, improve: 22, delta: 4 },
  { name: 'קיבוץ יגור', kind: 'kibbutz', region: 'haifa', size: 'small', perMember: 189, active: 160, totalSteps: 1700000, improve: 4, delta: 0 },
  { name: 'תל אביב־יפו', kind: 'city', region: 'center', size: 'large', perMember: 174, active: 9870, totalSteps: 98400000, improve: 3, delta: 0, me: true },
  { name: 'חיפה', kind: 'city', region: 'haifa', size: 'large', perMember: 169, active: 6120, totalSteps: 60100000, improve: 6, delta: 1 },
  { name: 'כפר ורדים', kind: 'local', region: 'north', size: 'small', perMember: 166, active: 310, totalSteps: 3100000, improve: 12, delta: 2 },
  { name: 'קריית ים', kind: 'city', region: 'haifa', size: 'small', perMember: 158, active: 830, totalSteps: 7600000, improve: -2, delta: -1 },
  { name: 'אבן יהודה', kind: 'local', region: 'sharon', size: 'small', perMember: 155, active: 420, totalSteps: 4100000, improve: 7, delta: 1 },
  { name: 'אשקלון', kind: 'city', region: 'south', size: 'medium', perMember: 151, active: 2210, totalSteps: 19800000, improve: -4, delta: -2 },
  { name: 'ירושלים', kind: 'city', region: 'jerusalem', size: 'large', perMember: 146, active: 7350, totalSteps: 64800000, improve: 5, delta: 0 },
  { name: 'באר שבע', kind: 'city', region: 'south', size: 'large', perMember: 140, active: 3460, totalSteps: 30500000, improve: 11, delta: 1 },
];

/** Neighborhoods across the country, for the "כל הארץ" / "קרובות אליי" scopes. */
export const NEIGHBORHOODS_ALL = [
  { name: 'נווה שאנן', city: 'חיפה', perMember: 197, active: 180, totalSteps: 2050000, improve: 14, delta: 2, near: false },
  { name: 'הצפון הישן', city: 'תל אביב־יפו', perMember: 186, active: 214, totalSteps: 2410000, improve: 6, delta: 1, me: true, near: true },
  { name: 'רמת השרון — מרכז', city: 'רמת השרון', perMember: 181, active: 150, totalSteps: 1600000, improve: 3, delta: 0, near: true },
  { name: 'פלורנטין', city: 'תל אביב־יפו', perMember: 171, active: 388, totalSteps: 3980000, improve: -3, delta: -1, near: true },
  { name: 'רחביה', city: 'ירושלים', perMember: 168, active: 260, totalSteps: 2600000, improve: 8, delta: 1, near: false },
  { name: 'נווה צדק', city: 'תל אביב־יפו', perMember: 164, active: 97, totalSteps: 890000, improve: 10, delta: 2, near: true },
  { name: 'רמת אביב', city: 'תל אביב־יפו', perMember: 152, active: 301, totalSteps: 2870000, improve: 1, delta: 0, near: true },
  { name: 'נאות אשכול', city: 'שדרות', perMember: 149, active: 120, totalSteps: 1100000, improve: 19, delta: 3, near: false },
  { name: 'יד אליהו', city: 'תל אביב־יפו', perMember: 139, active: 176, totalSteps: 1530000, improve: 12, delta: 3, near: true },
  { name: 'יפו', city: 'תל אביב־יפו', perMember: 128, active: 242, totalSteps: 2110000, improve: -5, delta: -2, near: true },
];
