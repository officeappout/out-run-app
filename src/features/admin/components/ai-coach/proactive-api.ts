'use client';

/** Panel client for /api/admin/ai-coach/proactive (Kelly phase 3). */
import { auth } from '@/lib/firebase';

export async function proactiveAdminFetch(init?: { method?: 'GET' | 'POST'; body?: unknown }): Promise<{ status: number; data: Record<string, unknown> }> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch('/api/admin/ai-coach/proactive', {
    method: init?.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });
  return { status: res.status, data: ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown> };
}

export const TRIGGER_LABEL_HE: Record<string, string> = {
  post_workout: 'איך היה (אחרי אימון)',
  weather: 'מזג אוויר',
  morning: 'בוקר ביום אימון',
  weekly: 'סיכום שבועי',
  assessment: 'בדיקת רמה חסרה',
};
