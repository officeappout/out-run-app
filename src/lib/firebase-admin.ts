/**
 * Firebase Admin SDK initialization for Next.js API routes (Node runtime).
 *
 * The Admin SDK is privileged code — it must NEVER be imported from a
 * client component or middleware (Edge runtime). The `import 'server-only'`
 * directive at the top will fail loudly if anyone tries.
 *
 * Credentials lookup (in order):
 *   1. FIREBASE_SERVICE_ACCOUNT_KEY env var (full JSON of a service account)
 *   2. GOOGLE_APPLICATION_CREDENTIALS env var (path to JSON file)
 *   3. Application Default Credentials (Vercel + Firebase integration,
 *      Google Cloud Run, Firebase Hosting Functions, etc.)
 *
 * The singleton pattern guarantees we only call initializeApp() once per
 * Node.js process even across hot-reloads.
 */

import 'server-only';
import { cert, getApps, initializeApp, applicationDefault, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';

let _adminApp: App | null = null;

function ensureApp(): App {
  if (_adminApp) return _adminApp;
  if (getApps().length > 0) {
    _adminApp = getApps()[0]!;
    return _adminApp;
  }

  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      _adminApp = initializeApp({
        credential: cert({
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: String(parsed.private_key).replace(/\\n/g, '\n'),
        }),
      });
      return _adminApp;
    } catch (err) {
      console.error('[firebase-admin] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', err);
    }
  }

  // Fallback: Application Default Credentials.
  // Works on Cloud Run / Cloud Functions / GCE without any env var.
  _adminApp = initializeApp({
    credential: applicationDefault(),
  });
  return _adminApp;
}

export function getAdminAuth(): Auth {
  return getAuth(ensureApp());
}

/**
 * Resolve whether a Firebase user has admin privileges.
 *
 * Order of checks (cheapest first):
 *   1. Custom claim `admin === true` (recommended long-term mechanism).
 *   2. Hardcoded root-admin email allowlist (mirror of firestore.rules).
 *   3. Firestore-doc admin flags via `users/{uid}` (mirror of checkUserRole).
 *
 * Returns the resolved `{ uid, email, admin }` triple. Used by the
 * /api/auth/session route to mint the session cookie.
 */
const ROOT_ADMIN_EMAIL_REGEX = /^(david|office)@appout\.co\.il$/i;

export interface ResolvedIdentity {
  uid: string;
  email: string | null;
  admin: boolean;
}

export async function resolveIdentity(idToken: string): Promise<ResolvedIdentity> {
  const auth = getAdminAuth();
  // checkRevoked=true makes Firebase reject revoked tokens (forced sign-out).
  const decoded = await auth.verifyIdToken(idToken, true);

  const email: string | null = (decoded.email as string | undefined) ?? null;
  let admin = decoded.admin === true;

  if (!admin && email && ROOT_ADMIN_EMAIL_REGEX.test(email)) {
    admin = true;
  }

  if (!admin) {
    // Fall back to the Firestore-doc check used by checkUserRole().
    try {
      const { getFirestore } = await import('firebase-admin/firestore');
      const fs = getFirestore(ensureApp());
      const snap = await fs.collection('users').doc(decoded.uid).get();
      const data = snap.data() ?? {};
      const core = data.core ?? {};
      admin =
        data.role === 'admin' ||
        core.role === 'admin' ||
        core.role === 'system_admin' ||
        core.isSuperAdmin === true ||
        core.isSystemAdmin === true ||
        core.isVerticalAdmin === true ||
        core.isTenantOwner === true;
    } catch (err) {
      console.warn('[firebase-admin] Failed to read user doc for admin check:', err);
    }
  }

  return { uid: decoded.uid, email, admin };
}
