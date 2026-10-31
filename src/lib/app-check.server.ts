/**
 * App Check for Next.js API routes. Callable functions enforce it natively (enforceAppCheck);
 * routes never checked it. The client sends the token in X-Firebase-AppCheck.
 *
 * Monitor first: App Check inside the Capacitor WKWebView still needs a device check, so
 * `enforce: false` only logs a missing / bad token and lets the request through. A route turns
 * enforcement on once the logs are clean (camera scan: app_config/ai `scanAppCheckEnforce`).
 */
import 'server-only';
import { getAppCheck } from 'firebase-admin/app-check';
import { getAdminAuth } from '@/lib/firebase-admin';

export const APP_CHECK_HEADER = 'X-Firebase-AppCheck';

export type AppCheckOutcome = 'valid' | 'missing' | 'invalid';

export async function checkAppCheckHeader(request: Request): Promise<AppCheckOutcome> {
  const token = request.headers.get(APP_CHECK_HEADER)?.trim();
  if (!token) return 'missing';
  try {
    // getAdminAuth() initializes the admin app; App Check uses the same default app.
    await getAppCheck(getAdminAuth().app).verifyToken(token);
    return 'valid';
  } catch {
    return 'invalid';
  }
}

/** true = let the request through. Logs every non-valid outcome with the route tag. */
export async function passesAppCheck(request: Request, route: string, enforce: boolean): Promise<boolean> {
  const outcome = await checkAppCheckHeader(request);
  if (outcome === 'valid') return true;
  console.warn(`[app-check] ${route}: ${outcome} token (${enforce ? 'blocked' : 'monitor only'})`);
  return !enforce;
}
