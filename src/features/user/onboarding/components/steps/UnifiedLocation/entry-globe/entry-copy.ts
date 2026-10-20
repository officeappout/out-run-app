/**
 * Entry flow v2 — location step copy (Hebrew, verbatim from the owner's
 * design canvas M1b–M5 / brief C1). One place so the drawers stay small.
 */
export const ENTRY_COPY = {
  headlinePre: 'בשביל',
  headlineGoals: ['להתאמן', 'לשמור על הבריאות', 'להכיר אנשים דרך הספורט', 'להיות חזקה'] as const,
  headlineNeed: 'לא צריך',
  headlineNothing: 'כלום',

  initialTitle: 'בואו נמצא גינה לידך',
  initialBody: 'כדי להראות לך את מסלולי ההליכה, גינות הכושר והמקומות הכי קרובים אליך, נבקש גישה למיקום.',
  initialCta: 'הראו לי מה יש לידי',
  initialManual: 'בחירת עיר ושכונה באופן ידני',

  divePill: 'מחפשים גינות ומסלולים לידך…',
  diveManual: 'לוקח זמן? חיפוש ידני',

  dragHint: 'גוררים את המפה כדי לדייק',
  confirmEyebrow: 'מצאנו אותך 👋',
  confirmTitle: (place: string) => `גרים ב${place}?`,
  confirmBody: 'לפי הבית נציג לך גינות, מסלולים ואנשים בשכונה. בחינם, ובלי ציוד.',
  nearestParkLabel: 'הגינה הכי קרובה לבית',
  confirmDragLine: 'לא בדיוק? גוררים את המפה עד שהלמור על הבית',
  confirmCta: 'כן, זה הבית שלי',
  confirmNotHome: 'אני לא בבית עכשיו, אחפש את האזור שלי',

  searchPlaceholder: 'חפשו עיר או שכונה',
  searchCancel: 'ביטול',
  searchClear: 'נקה חיפוש',
  chipAll: 'הכל',
  chipNeighborhoods: 'שכונות',
  chipCities: 'ערים',
  sectionNeighborhoods: 'שכונות',
  sectionCities: 'ערים',
  noResults: (q: string) => `לא נמצאו תוצאות עבור "${q}"`,
  noResultsHint: 'נסו לחפש עיר או שכונה אחרת',
} as const;
