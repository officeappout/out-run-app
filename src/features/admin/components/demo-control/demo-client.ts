/**
 * Client helpers for /admin/demo — authed fetch (Bearer ID token), Hebrew error
 * labels, $ / time formatting. The panel never reads demo_registry with the client
 * SDK (rules keep it server-only); everything goes through /api/admin/demo/**.
 */
import { auth } from '@/lib/firebase';

export async function demoFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await auth.currentUser?.getIdToken();
  return fetch(path, {
    ...init,
    cache: 'no-store',
    headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
  });
}

const ERRORS: Record<string, string> = {
  load_failed: 'הטעינה נכשלה',
  save_failed: 'השמירה נכשלה',
  action_failed: 'הפעולה נכשלה',
  bad_request: 'נתונים לא תקינים',
  bad_workflow: 'שם תהליך לא מוכר',
  switch_off: 'כדי להריץ סיור צריך ש"חיים" וגם "בודקים" יהיו דולקים.',
  cap_reached: 'הגעתם לתקרה (יומית, חודשית או מספר סיורים). אפשר להעלות אותה בעורך התקרות.',
  dispatch_not_configured: 'ההרצה מהפאנל עוד לא מחוברת: חסר הסוד GITHUB_DISPATCH_TOKEN בשרת.',
  workflow_not_found: 'תהליך הבודקים (qa-testers.yml) עוד לא קיים ב-main. הוא ייכנס ב-PR של ה-runner.',
  token_rejected: 'GitHub דחה את הטוקן (GITHUB_DISPATCH_TOKEN). צריך טוקן עם הרשאת Actions לכתיבה.',
  dispatch_rejected: 'GitHub סירב להפעיל את התהליך (אין לו workflow_dispatch או קלט לא תקין).',
  github_error: 'שגיאה מ-GitHub. נסו שוב בעוד דקה.',
  network_error: 'אין חיבור ל-GitHub כרגע.',
  daily_above_monthly: 'התקרה היומית גבוהה מהחודשית.',
  too_many_models: 'יותר מדי מודלים בטבלת המחירים.',
  bad_model_id: 'מזהה מודל לא תקין (אותיות קטנות, ספרות, נקודה, מקף).',
  bad_price: 'מחיר לא תקין (0 עד 1,000 דולר למיליון).',
  bad_dailyUsdCap: 'תקרה יומית לא תקינה',
  bad_monthlyUsdCap: 'תקרה חודשית לא תקינה',
  bad_maxTesterSessionsPerDay: 'מספר סיורים ביום לא תקין',
  bad_maxLlmCallsPerDay: 'מספר קריאות AI ביום לא תקין',
  not_found: 'הפריט כבר לא קיים (אולי עולם הדמו נמחק).',
  no_screenshot: 'לממצא הזה אין צילום מסך.',
  sign_failed: 'לא הצלחנו לפתוח את צילום המסך (חתימת הקישור נכשלה בשרת).',
  bad_text: 'ההערה צריכה להיות בין 4 ל-500 תווים.',
  bad_screen: 'מזהה מסך לא תקין (למשל home_today או ‎/map).',
  bad_severity: 'חומרה לא תקינה',
  too_many_notes: 'אין עוד מקום להערות חדשות.',
  Unauthorized: 'צריך להתחבר מחדש',
  Forbidden: 'אין הרשאה',
};

export function errorLabel(code: string): string {
  return ERRORS[code] ?? code;
}

export async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: unknown };
  return typeof body.error === 'string' ? errorLabel(body.error) : `שגיאה ${res.status}`;
}

const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd4 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });
const int = new Intl.NumberFormat('he-IL');

/** $ — cents from $1 up, up to 4 decimals below (LLM days are often fractions of a cent). */
export function fmtUsd(v: number): string {
  return Math.abs(v) >= 1 ? usd2.format(v) : usd4.format(v);
}

export function fmtInt(v: number): string {
  return int.format(Math.round(v));
}

export function fmtWhen(ms: number | null): string {
  if (ms === null) return '—';
  return new Date(ms).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' });
}
