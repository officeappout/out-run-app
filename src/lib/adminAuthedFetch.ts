/**
 * adminAuthedFetch.ts — shared client-side helper for calling the
 * server-scoped admin analytics routes (statistics-summary,
 * insights-summary, growth-metrics, push-funnel-summary, …) that resolve
 * role/scope from the verified ID token server-side (see
 * src/lib/adminAnalyticsScope.ts). Extracted 04.10.2026 from
 * /admin/statistics/page.tsx's inline copy once a second page
 * (/admin/analytics) needed the exact same call shape — one copy, not two
 * that can drift.
 */
import { auth } from '@/lib/firebase';

export type AuthedFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

export async function adminAuthedFetch<T>(path: string): Promise<AuthedFetchResult<T>> {
  const user = auth.currentUser;
  if (!user) return { ok: false, status: 401, message: 'לא מחובר.' };
  const idToken = await user.getIdToken();
  const res = await fetch(path, { headers: { Authorization: `Bearer ${idToken}` } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, status: res.status, message: body?.error ?? 'שגיאה בטעינת הנתונים.' };
  }
  return { ok: true, data: await res.json() };
}
