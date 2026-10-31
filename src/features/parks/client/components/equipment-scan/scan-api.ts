'use client';

/**
 * Client of POST /api/scan/equipment. Sends the ID token and, when available, an App Check token
 * (native: the Capacitor plugin, like requestAccountDeletion; web: the registered App Check
 * instance). A missing App Check token is fine while the route is in monitor mode.
 */
import { auth, appCheck } from '@/lib/firebase';
import { isNativePlatform } from '@/features/social/services/feed-photo';
import type { ScanMode, ScanPhotoResult, ScanVerdict } from '@/lib/ai/scan/scan-types';
import type { ScanFeedback } from '@/lib/ai/scan/scan-feedback';

export const SCAN_CLIENT_TIMEOUT_MS = 30_000;

export type ScanApiError = 'not_signed_in' | 'rate_limited' | 'not_enabled' | 'unavailable' | 'network';

export type ScanApiResult =
  | { ok: true; result: ScanPhotoResult; verdict?: ScanVerdict }
  | { ok: false; error: ScanApiError };

async function appCheckToken(): Promise<string | undefined> {
  try {
    if (isNativePlatform()) {
      const { FirebaseAppCheck } = await import('@capacitor-firebase/app-check');
      return (await FirebaseAppCheck.getToken({ forceRefresh: false })).token;
    }
    if (!appCheck) return undefined;
    const { getToken } = await import('firebase/app-check');
    return (await getToken(appCheck, false)).token;
  } catch {
    return undefined;
  }
}

export function errorFromStatus(status: number, code: unknown): ScanApiError {
  if (status === 429) return 'rate_limited';
  if (status === 404 && code === 'not_enabled') return 'not_enabled';
  if (status === 401) return 'not_signed_in';
  return 'unavailable';
}

export async function postScan(
  body: { image: string; mode: ScanMode; parkId?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<ScanApiResult> {
  const token = await auth.currentUser?.getIdToken().catch(() => undefined);
  if (!token) return { ok: false, error: 'not_signed_in' };
  const ac = await appCheckToken();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), SCAN_CLIENT_TIMEOUT_MS);
  try {
    const res = await fetchImpl('/api/scan/equipment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(ac ? { 'X-Firebase-AppCheck': ac } : {}),
      },
      body: JSON.stringify({ image: body.image, mediaType: 'image/jpeg', mode: body.mode, ...(body.parkId ? { parkId: body.parkId } : {}) }),
      signal: ctl.signal,
    });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.status !== 200 || !data?.result) return { ok: false, error: errorFromStatus(res.status, data?.error) };
    return { ok: true, result: data.result as ScanPhotoResult, ...(data.verdict ? { verdict: data.verdict as ScanVerdict } : {}) };
  } catch {
    return { ok: false, error: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

/** The accuracy log (detected vs confirmed, never a photo). Fire and forget: never throws. */
export async function postScanFeedback(body: ScanFeedback, fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    const token = await auth.currentUser?.getIdToken().catch(() => undefined);
    if (!token) return;
    await fetchImpl('/api/scan/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    /* a log only */
  }
}

/** The detected list for the log: the result's catalog items, best first. */
export function detectedForLog(result: ScanPhotoResult | null): ScanFeedback['detected'] {
  return (result?.items ?? [])
    .filter((i) => i.kind === 'catalog')
    .slice(0, 20)
    .map((i) => ({ equipmentId: i.candidateId, confidence: i.confidence, ...(i.brandName ? { brandName: i.brandName } : {}) }));
}
