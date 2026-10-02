import type { WeddingSettings, WeddingState } from './wedding.types';

/** Firestore location. Server-only access through the Admin SDK. */
export const WEDDING_COLLECTION = 'wedding_planner';
export const WEDDING_DOC_ID = 'main';

export const DEFAULT_SETTINGS: WeddingSettings = {
  date: '2027-03-09',
  guests: 250,
  low: 200,
  high: 300,
  budget: 0,
  vat: 18,
  design: 8000,
  chuppah: 3000,
  light: 6000,
  bar: 30,
  people: ['דוד', 'בת הזוג'],
  tagColors: {},
};

const SEED_TASKS: Array<[string, number]> = [
  ['לסגור תקציב כולל והערכת אורחים', 155],
  ['סיור באולמות והזנת ההצעות', 150],
  ['סגירת אולם, תאריך וחוזה', 140],
  ['חוזה עם ה-DJ על התאריך', 135],
  ['צלם סטילס ווידאו', 125],
  ['רב / עורך טקס', 115],
  ['שמלה – סבב מדידות', 110],
  ['פתיחת תיק ברבנות', 90],
  ['חליפה וטבעות', 80],
  ['ניסיון איפור ושיער', 60],
  ['רשימת מוזמנים שמית סופית', 55],
  ['הזמנות – הדפסה ושליחה', 45],
  ['אישורי הגעה', 21],
  ['מספר סופי לאולם', 10],
  ['סידורי הושבה ותשלומים אחרונים', 7],
];

const SEED_VENDORS = [
  'DJ (שלנו)',
  'צילום סטילס ווידאו',
  'רב / עורך טקס',
  'שמלת כלה',
  'חליפת חתן',
  'איפור ושיער',
  'טבעות',
  'הזמנות ואישורי הגעה',
];

/** First-open state when no document exists yet. Venues start empty: only real offers go in. */
export function initialWeddingState(): WeddingState {
  return {
    settings: { ...DEFAULT_SETTINGS },
    venues: [],
    catalogHidden: [],
    vendors: SEED_VENDORS.map((name, i) => ({
      id: `v${i + 1}`,
      name,
      supplier: '',
      price: 0,
      paid: 0,
      status: i === 0 ? 'נסגר' : 'לברר',
      priceIsEstimate: false,
    })),
    tasks: SEED_TASKS.map(([name, daysBefore], i) => ({
      id: `t${String(i + 1).padStart(2, '0')}`,
      name,
      daysBefore,
      startBefore: daysBefore,
      done: false,
      owners: [],
      vendorId: '',
    })),
  };
}

/**
 * Recommended booking lead time per vendor kind, in days before the wedding
 * (researched 02.10.2026: Zola vendor timeline, planning.wedding checklist,
 * guini RSVP guide, mitchatnim / saveadate on the rabbinate). First match on
 * the vendor name wins. Used to date a vendor's "close" task.
 */
export const BOOKING_LEADS: Array<{ match: string[]; days: number; label: string }> = [
  { match: ['אולם', 'גן אירועים', 'מקום'], days: 365, label: '12 חודשים' },
  { match: ['מגנט', 'עמדת צילום'], days: 180, label: '6 חודשים' },
  { match: ['צילום', 'צלם', 'וידאו'], days: 330, label: '10–12 חודשים' },
  { match: ['רבנות', 'הדרכ'], days: 90, label: '3 חודשים (רישום עד 45 יום לפני)' },
  { match: ['רב ', 'רב/', 'עורך טקס'], days: 270, label: '8–10 חודשים' },
  { match: ['חליפ', 'טבעות', 'טבעת', 'נעליים', 'אביזר'], days: 150, label: '5 חודשים' },
  { match: ['פרח', 'זר', 'עיצוב'], days: 270, label: '8–9 חודשים' },
  { match: ['DJ', 'די ג׳יי', 'להקה', 'מוזיקה', 'זמר', 'כנר', 'סקסופון'], days: 255, label: '8–9 חודשים' },
  { match: ['שמל'], days: 240, label: '8 חודשים (תפירה: לפחות 3–4)' },
  { match: ['הסעות', 'רכב', 'לינה', 'מלון'], days: 210, label: '7 חודשים' },
  { match: ['עוגה', 'קינוח'], days: 210, label: '7 חודשים' },
  { match: ['איפור', 'שיער', 'מאפר'], days: 180, label: '6 חודשים' },
  { match: ['אפקט', 'זיקוק', 'עשן'], days: 150, label: '5 חודשים' },
  { match: ['הזמנות', 'אישורי הגעה'], days: 90, label: '3 חודשים (שליחה 6–8 שבועות לפני)' },
  { match: ['טיפ'], days: 3, label: 'בשבוע האחרון' },
];
export const DEFAULT_LEAD = { days: 120, label: '4 חודשים' };

/**
 * Market reference figures (researched 02.10.2026). Display-only.
 * Sources are content sites, not quotes — real prices come from written offers.
 */
export const MARKET = {
  plateCenter: { min: 280, max: 450 },
  plateGarden: { min: 300, max: 500 },
  weekdaySaving: '10–25%',
  thursdaySurcharge: '10–12%',
  alcoholPerGuest: { min: 22, max: 45 },
  vendors: [
    { name: 'צילום סטילס+וידאו', min: 6000, max: 14000, match: 'צילום' },
    { name: 'DJ', min: 3500, max: 12000, match: '' },
    { name: 'עיצוב ופרחים', min: 8000, max: 40000, match: '' },
    { name: 'שמלה (השכרה)', min: 1500, max: 7000, match: 'שמל' },
    { name: 'חליפה', min: 2000, max: 6000, match: 'חליפ' },
  ],
  sources: [
    { label: 'Evanto – עלות חתונה 2026', url: 'https://www.evanto.co.il/guide/wedding-cost-israel-2026' },
    { label: 'SaveADate – כמה עולה חתונה', url: 'https://www.saveadate.co.il/wedding-sale/' },
    { label: 'ערוץ 14 – עונת החתונות 2026', url: 'https://www.c14.co.il/article/1543920' },
    { label: 'מתחתנים למען מתחתנים – מחיר DJ', url: 'https://www.mit4mit.co.il/blog/article/61f643e2eeee0dd4687ef626' },
  ],
} as const;
