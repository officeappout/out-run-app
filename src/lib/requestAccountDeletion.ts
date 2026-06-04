/**
 * Client wrapper for the `requestAccountDeletion` Cloud Function
 * (Compliance Phase 3.3 — GDPR / Israeli Privacy Law right-to-erasure).
 *
 * This is the ONLY supported way to delete an account from the browser.
 * Direct `auth.currentUser.delete()` only removes the Auth record and
 * leaves orphan data in Firestore + Storage; the callable function
 * recursively purges users/{uid}, dailyActivity, presence, connections,
 * activity, kudos, feed_posts, DMs, group-chat membership, communities
 * the user created, and storage prefixes — then deletes the Auth user.
 *
 * The server-side function is idempotent, so retrying after a network
 * failure is safe.
 *
 * After a successful call, the user's auth token is invalid; the caller
 * MUST `signOut(auth)` and route to a public landing page.
 *
 * Platform strategy:
 *   Native iOS/Android — the Firebase Web SDK's internal App Check
 *   attachment can fail when `initializeAppCheck` didn't register
 *   properly through the Capacitor bridge. We bypass this by fetching
 *   the token directly from the @capacitor-firebase/app-check plugin
 *   and attaching it as the `X-Firebase-AppCheck` header on a raw fetch
 *   call to the callable endpoint.
 *
 *   Web — standard `httpsCallable` (App Check token auto-attached by
 *   the Firebase Functions SDK via the registered AppCheck instance).
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, auth } from '@/lib/firebase';

export interface RequestAccountDeletionResult {
  ok: true;
  uid: string;
  /** Counts of subcollections / docs purged (best-effort, server-reported). */
  counts?: Record<string, number>;
}

/** True when running inside the Capacitor native shell. */
function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor?.isNativePlatform?.(),
  );
}

/**
 * On native, call the Cloud Function directly via fetch so we can
 * manually attach the App Check token from the Capacitor plugin.
 * The Firebase callable protocol is:
 *   POST <url>  body: {"data":{}}
 *   Headers: Authorization: Bearer <idToken>
 *            X-Firebase-AppCheck: <appCheckToken>
 *            Content-Type: application/json
 */
async function callViaFetch(): Promise<RequestAccountDeletionResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Not authenticated');

  // Get Firebase Auth ID token.
  const idToken = await currentUser.getIdToken();

  // Get App Check token directly from the Capacitor plugin — this always
  // uses the provider configured in capacitor.config.json (debug or DeviceCheck),
  // bypassing the Firebase Web SDK's internal App Check mechanism entirely.
  const { FirebaseAppCheck } = await import('@capacitor-firebase/app-check');
  let appCheckToken: string | undefined;
  try {
    const { token } = await FirebaseAppCheck.getToken({ forceRefresh: false });
    appCheckToken = token;
    console.info('[requestAccountDeletion] App Check token fetched, length:', token.length);
  } catch (acErr) {
    console.warn('[requestAccountDeletion] App Check getToken failed (will proceed without token):', acErr);
  }

  const url =
    'https://us-central1-appout-1.cloudfunctions.net/requestAccountDeletion';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${idToken}`,
  };
  if (appCheckToken) {
    headers['X-Firebase-AppCheck'] = appCheckToken;
  }

  console.info('[requestAccountDeletion] Calling via fetch (native path)', { hasAppCheck: !!appCheckToken });

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data: {} }),
  });

  const body = await response.json().catch(() => ({})) as Record<string, unknown>;

  if (!response.ok) {
    // Firebase callable error shape: { error: { status, message, details } }
    const firebaseErr = body.error as Record<string, string> | undefined;
    const code = firebaseErr?.status ?? `HTTP_${response.status}`;
    const message = firebaseErr?.message ?? `Request failed with status ${response.status}`;
    const err = Object.assign(new Error(message), { code: `functions/${code.toLowerCase()}` });
    throw err;
  }

  // Successful callable response shape: { result: { ok, uid, counts } }
  const result = (body.result ?? body) as RequestAccountDeletionResult;
  return result;
}

export async function requestAccountDeletion(): Promise<RequestAccountDeletionResult | null> {
  if (typeof window === 'undefined') return null;
  try {
    if (isNativePlatform()) {
      return await callViaFetch();
    }

    // Web path — httpsCallable attaches App Check token automatically via
    // the Firebase SDK's registered AppCheck instance (reCAPTCHA Enterprise).
    const functions = getFunctions(app, 'us-central1');
    const callable = httpsCallable<Record<string, never>, RequestAccountDeletionResult>(
      functions,
      'requestAccountDeletion',
    );
    const { data } = await callable({});
    return data;
  } catch (err) {
    console.error('[requestAccountDeletion] callable failed:', err);
    throw err;
  }
}
