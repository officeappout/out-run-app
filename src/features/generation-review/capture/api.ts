/** POST JSON to a generation-review route with the user's Firebase ID token. Never throws. */
import { auth } from '@/lib/firebase';

export async function postGenerationReview(path: 'log' | 'outcome' | 'report', body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return { ok: false, status: 401, data: null };
    const res = await fetch(`/api/generation-review/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      keepalive: true,
    });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}
