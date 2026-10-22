/**
 * adminPageSynonyms — the ONE hand-written part of the admin page map (optional, small).
 * Extra words people actually type for a page, matched by the assistant's local navigation
 * (docs/admin/ADMIN-AI-ASSISTANT-PLAN.md §3.1). Keys are sidebar hrefs or page paths exactly
 * as they appear in src/generated/admin-page-map.json; the page-map test fails on a key that
 * matches no page. Add words here, then run `npx tsx scripts/gen-admin-page-map.ts`.
 *
 * The same word on two pages is intentional where the question is ambiguous ("טבלת כל
 * הערים" → both the authorities table and city mapping, plan §11 Q14): the drawer then shows
 * both buttons ("התכוונת ל…").
 */
export const ADMIN_PAGE_SYNONYMS: Record<string, string[]> = {
  '/admin': ['בית', 'דף הבית', 'דשבורד', 'מסך ראשי', 'סקירה'],
  '/admin/authorities': ['טבלת כל הערים', 'כל הערים', 'ערים', 'רשויות', 'עיריות', 'לקוחות', 'CRM', 'צנרת', 'פייפליין', 'pipeline'],
  '/admin/city-mapping': ['טבלת כל הערים', 'כל הערים', 'ערים במיפוי', 'מוכנות מיפוי', 'מיפוי ערים', 'מלאי עיר'],
  '/admin/approval-center': ['אישורים', 'ממתינים לאישור', 'מסלולים לאישור', 'תור אישורים', 'בקשות'],
  '/admin/journey': ['אנליטיקה', 'סטטיסטיקות', 'נתונים', 'משפך', 'retention', 'שימור', 'קוהורטות', 'נטישה', 'אונבורדינג'],
  '/admin/users/all': ['משתמשים', 'רשימת משתמשים', 'מתאמנים'],
  '/admin/users': ['הרשאות', 'מנהלים', 'אדמינים', 'תפקידים'],
  '/admin/costs': ['עלויות', 'עלות AI', 'הוצאות ענן', 'חשבון', 'כמה עולה'],
  '/admin/system-settings': ['דגלים', 'פיצרים', 'מתגים', 'feature flags', 'הגדרות'],
  '/admin/signup-failures': ['הרשמה נכשלה', 'שגיאות הרשמה', 'כשלי כניסה'],
  '/admin/agents': ['סוכנים', 'בוטים', 'אוטומציות'],
  '/admin/notifications': ['פושים', 'התראות', 'push'],
  '/admin/notifications/library': ['ספריית התראות', 'נוסחי פוש'],
  '/admin/exercises': ['תרגילים', 'מאגר תרגילים'],
  '/admin/locations': ['פארקים', 'גינות כושר', 'מסלולים', 'מפה'],
  '/admin/heatmap': ['מפת חום', 'פעילות חיה'],
  '/admin/ai-coach/kelly': ['קלי', 'צאט קלי', 'הודעות ממתינות'],
  '/admin/ai-coach/reviews': ['ביקורת שיחות', 'איכות קלי'],
  '/admin/finance/expenses': ['הוצאות', 'חשבוניות'],
  '/admin/web-traffic': ['אתר', 'תנועה', 'גוגל אנליטיקס'],
  '/admin/levels': ['XP', 'רמות', 'נקודות'],
  '/admin/audit-logs': ['לוג', 'יומן', 'מי שינה'],
};

/**
 * Titles for pages that have no sidebar label and no static <h1> (their folder name would be
 * the only title, e.g. "units"). Used only when the page is not on the sidebar.
 */
export const ADMIN_PAGE_TITLE_OVERRIDES: Record<string, string> = {
  '/admin/authority/units/[unitId]': 'יחידה · פרטים',
  '/admin/authority/neighborhoods/[id]': 'שכונה · פרטים',
  '/admin/authority/events': 'אירועים',
  '/admin/finance': 'כספים',
  '/admin/users/[uid]': 'משתמש · פרטים',
  '/admin/locations/import/[category]': 'מיקומים ומסלולים · ייבוא',
};
