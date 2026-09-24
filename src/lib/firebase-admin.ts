/**
 * Firebase Admin SDK initialization for Next.js API routes (Node runtime).
 *
 * The Admin SDK is privileged code — it must NEVER be imported from a
 * client component or middleware (Edge runtime). The `import 'server-only'`
 * directive at the top will fail loudly if anyone tries.
 *
 * Credentials lookup (in order):
 *   1. FIREBASE_SERVICE_ACCOUNT_KEY — raw JSON string of a Firebase Admin SA key
 *   2. GOOGLE_SERVICE_ACCOUNT_KEY   — base64-encoded JSON (same key used for Gmail/Drive)
 *   3. Application Default Credentials (local dev only — fails on Vercel)
 *
 * ⚠️  PERMISSIONS: whichever SA key is used must have these IAM roles on appout-1:
 *       - Firebase Admin SDK Administrator Service Agent  (or)
 *       - Cloud Datastore User  +  Firebase Authentication Admin
 *     The Gmail-delegation SA may lack these — if Firestore still fails after
 *     adding GOOGLE_SERVICE_ACCOUNT_KEY, grant those roles in Cloud Console
 *     or download the Firebase Admin SA key and set FIREBASE_SERVICE_ACCOUNT_KEY.
 *
 * The singleton pattern guarantees we only call initializeApp() once per
 * Node.js process even across hot-reloads.
 */

import 'server-only';
import { cert, getApps, initializeApp, applicationDefault, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let _adminApp: App | null = null;

/**
 * Resolve the Firebase project ID.
 *
 * Priority:
 *   1. FIREBASE_PROJECT_ID (server-only, most explicit)
 *   2. NEXT_PUBLIC_FIREBASE_PROJECT_ID (shared with client SDK config)
 *   3. Hard-coded fallback — the known project for this app.
 *
 * Passing projectId explicitly prevents @google-cloud/firestore from trying to
 * auto-detect it via the GCP metadata server, which only exists on actual GCP
 * infrastructure (Cloud Run, App Hosting, GCE) and always fails on localhost.
 */
function resolveProjectId(): string {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    'appout-1'
  );
}

function ensureApp(): App {
  if (_adminApp) return _adminApp;
  if (getApps().length > 0) {
    _adminApp = getApps()[0]!;
    return _adminApp;
  }

  const projectId = resolveProjectId();

  // 1. Raw JSON service account key (Firebase Admin SA — preferred)
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
        projectId: parsed.project_id ?? projectId,
      });
      console.log('[firebase-admin] Initialized with FIREBASE_SERVICE_ACCOUNT_KEY');
      return _adminApp;
    } catch (err) {
      console.error('[firebase-admin] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', err);
    }
  }

  // 2. Base64-encoded JSON (shared with Gmail/Drive SA — same key set by David in Vercel)
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (b64) {
    try {
      const parsed = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      _adminApp = initializeApp({
        credential: cert({
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: String(parsed.private_key).replace(/\\n/g, '\n'),
        }),
        projectId: parsed.project_id ?? projectId,
      });
      console.log('[firebase-admin] Initialized with GOOGLE_SERVICE_ACCOUNT_KEY (base64)');
      return _adminApp;
    } catch (err) {
      console.error('[firebase-admin] Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY:', err);
    }
  }

  // 3. Application Default Credentials — works on GCP infrastructure, fails on Vercel.
  // Works on Cloud Run / Cloud Functions / App Hosting without a service account
  // key file. projectId must be explicit here because the ADC credential does NOT
  // carry project information on its own — without it Firestore throws
  // "Unable to detect a Project Id in the current environment" on localhost.
  _adminApp = initializeApp({
    credential: applicationDefault(),
    projectId,
  });
  console.log('[firebase-admin] Initialized with ADC, projectId:', projectId);
  return _adminApp;
}

export function getAdminAuth(): Auth {
  return getAuth(ensureApp());
}

/** Privileged Firestore instance — use only in Next.js API routes (Node runtime). */
export function getAdminDb(): Firestore {
  return getFirestore(ensureApp());
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

/**
 * 24.09.2026 — Stage 4 of the military/school vertical build (.claude/
 * plans/tenant-military-school-vertical-model.md §ח) added `tenant_owner`
 * and `unit_admin` here. Two real problems found by investigating the
 * officer-facing panel screens (before this fix, neither role could
 * actually be used):
 *   - `unit_admin` was invisible to this entire function — no check here
 *     reads `core.unitId`/`core.authorityId` (the fields Stage 2's
 *     accept-invitation writes for them). A real unit_admin would get
 *     `admin:false, scope:undefined` and be redirected straight back to
 *     /admin/login by middleware.ts's decideAdminGateAction, forever.
 *   - `tenant_owner` got FULL `admin:true` (via `core.isTenantOwner===true`
 *     folded into the admin check below) — no domain restriction
 *     whatsoever, the same blanket grant as root/super_admin. This
 *     predates this stage (the check existed before any invitation flow
 *     could actually produce a working tenant_owner) but was dormant until
 *     Stage 2 made creating one possible. Removed from the admin check;
 *     replaced with a narrow scope, exactly like authority_manager.
 */
export type IdentityScope = 'authority_manager' | 'tenant_owner' | 'unit_admin';

export interface ResolvedIdentity {
  uid: string;
  email: string | null;
  admin: boolean;
  /**
   * Server-computed, narrow grant for authority managers
   * (authorities.managerIds array-contains uid) — deliberately NEVER
   * folded into `admin`. `admin` gates requireAdminApi/requireSection/
   * resolveAdminUid across /api/admin/*, including routes that return
   * cross-tenant PII (e.g. /api/admin/photo-release/[submissionId],
   * minors' data by submissionId with no per-authority scoping) — an
   * authority manager getting `admin:true` would open every other city's
   * data, not just their own. `scope` exists solely so the session
   * cookie can carry enough for middleware.ts's decideAdminGateAction to
   * allow ONLY that manager's own portal paths — see 00-MASTER-PLAN.md
   * §13.10 for the redirect-loop this replaces, and §13.16 for the
   * tenant_owner/unit_admin extension.
   */
  scope?: IdentityScope;
}

/**
 * The pure, uid-keyed half of identity resolution — factored out of
 * resolveIdentity() specifically so it's directly testable against the
 * Firestore emulator without needing a real Firebase Auth ID token (same
 * compute*()-split convention used throughout the military/school vertical
 * build). `tokenClaimAdmin` is the ONE fact this function can't derive
 * from uid alone — the `admin` custom claim lives on the decoded token,
 * not in Firestore — so resolveIdentity() passes it in after verifying
 * the token; every other check here is a Firestore read keyed by uid.
 *
 * tenant_owner/unit_admin detection reuses resolveUnitPermissionScope
 * (src/lib/unitPermissionScope.ts, Stage 0) as-is — no duplicated domain
 * logic. It runs BEFORE the generic authority_manager check (pre-existing,
 * unchanged), not after — a real tenant_owner is ALSO present in
 * authorities/{tenantId}.managerIds (same field, no `type` filter on the
 * generic check), so checking that one first would mislabel every real
 * tenant_owner as a plain 'authority_manager' — caught by this stage's own
 * test suite. resolveUnitPermissionScope's military_unit/school `type`
 * filter is what makes a municipal authority manager correctly fall
 * through to the (unchanged) generic check below instead.
 */
export async function computeAdminScope(
  uid: string,
  email: string | null,
  tokenClaimAdmin: boolean,
): Promise<{ admin: boolean; scope?: IdentityScope }> {
  let admin = tokenClaimAdmin;

  if (!admin && email && ROOT_ADMIN_EMAIL_REGEX.test(email)) {
    admin = true;
  }

  if (!admin) {
    // Fall back to the Firestore-doc check used by checkUserRole().
    try {
      const { getFirestore } = await import('firebase-admin/firestore');
      const fs = getFirestore(ensureApp());
      const snap = await fs.collection('users').doc(uid).get();
      const data = snap.data() ?? {};
      const core = data.core ?? {};
      admin =
        data.role === 'admin' ||
        core.role === 'admin' ||
        core.role === 'system_admin' ||
        core.isSuperAdmin === true ||
        core.isSystemAdmin === true ||
        core.isVerticalAdmin === true;
      // core.isTenantOwner === true — deliberately NOT included (see this
      // file's Stage 4 header comment). tenant_owner gets a scope below,
      // never blanket admin.
    } catch (err) {
      console.warn('[firebase-admin] Failed to read user doc for admin check:', err);
    }
  }

  // tenant_owner/unit_admin, checked BEFORE the generic authority_manager
  // query below — deliberately, not incidentally. A tenant_owner IS also
  // present in authorities/{tenantId}.managerIds (that's literally how
  // resolveUnitPermissionScope finds them — same field the generic check
  // below reads, just without a `type` filter), so the generic check would
  // otherwise match EVERY real tenant_owner too and mislabel them
  // 'authority_manager' — found by this stage's own test suite. Checking
  // the more specific classification first, and only falling through to
  // the generic one when it comes back 'denied', is what makes the two
  // mutually exclusive in practice. resolveUnitPermissionScope's own
  // military_unit/school type filter is what a municipal authority manager
  // correctly fails, so they fall through to the unchanged check below.
  let scope: IdentityScope | undefined;
  if (!admin) {
    try {
      const { resolveUnitPermissionScope } = await import('@/lib/unitPermissionScope');
      const unitScope = await resolveUnitPermissionScope(uid);
      if (unitScope.kind === 'tenantOwner') scope = 'tenant_owner';
      else if (unitScope.kind === 'unitAdmin') scope = 'unit_admin';
      // unitScope.kind === 'root' can't happen here — resolveUnitPermission
      // Scope's own root check is the same isRootAdmin(email) gate already
      // folded into `admin` above via ROOT_ADMIN_EMAIL_REGEX. 'denied'
      // leaves scope undefined, falling through to the check below.
    } catch (err) {
      console.warn('[firebase-admin] Failed to check unit permission scope:', err);
    }
  }

  // Authority-manager scope (pre-existing, unchanged logic) — checked only
  // when the caller isn't already a full admin AND didn't already resolve
  // to the more specific tenant_owner/unit_admin above. Server-computed
  // from authorities.managerIds directly — never trusts a client-supplied
  // claim.
  if (!admin && !scope) {
    try {
      const { getFirestore } = await import('firebase-admin/firestore');
      const fs = getFirestore(ensureApp());
      const managerSnap = await fs
        .collection('authorities')
        .where('managerIds', 'array-contains', uid)
        .limit(1)
        .get();
      if (!managerSnap.empty) {
        scope = 'authority_manager';
      }
    } catch (err) {
      console.warn('[firebase-admin] Failed to check authority-manager scope:', err);
    }
  }

  return { admin, scope };
}

export async function resolveIdentity(idToken: string): Promise<ResolvedIdentity> {
  const auth = getAdminAuth();

  // Prefer checkRevoked=true so explicitly-revoked tokens are rejected immediately.
  // However, the revocation check requires a network round-trip to Firebase Auth
  // servers and can fail transiently (network error, cold-start latency). If the
  // first attempt throws for any reason OTHER than "token is actually revoked",
  // we fall back to a signature-only verification — the token is still validated
  // cryptographically, just without the real-time revocation check.
  let decoded;
  try {
    decoded = await auth.verifyIdToken(idToken, /* checkRevoked */ true);
  } catch (firstErr: any) {
    // auth/id-token-revoked means the token was explicitly revoked — propagate.
    if (firstErr?.code === 'auth/id-token-revoked') throw firstErr;
    // Any other error (network, Admin SDK cold-start, missing credentials) →
    // try once more without the revocation check.
    try {
      decoded = await auth.verifyIdToken(idToken, /* checkRevoked */ false);
    } catch (secondErr: any) {
      // SPEC-02 SEC-11: this used to fall back to decodeJwt() (parses the
      // token WITHOUT checking its cryptographic signature at all) when
      // NODE_ENV !== 'production', trusting whatever email claim the
      // token claimed. Since decodeJwt never verifies anything, ANYONE
      // could construct a fake token claiming `email:
      // 'david@appout.co.il'` — no real signing key needed — and become
      // admin, in any non-production environment (any preview/staging
      // deploy that doesn't happen to have NODE_ENV exactly ==
      // 'production' set). Deleted outright, per the spec's own
      // instruction: always verify, no exceptions. Local dev already has
      // FIREBASE_SERVICE_ACCOUNT_KEY configured (.env.local), so
      // verifyIdToken succeeds on the very first attempt above in
      // practice — this fallback was very likely already dead code, not
      // a working convenience being removed.
      throw secondErr;
    }
  }

  const email: string | null = (decoded.email as string | undefined) ?? null;
  const { admin, scope } = await computeAdminScope(decoded.uid, email, decoded.admin === true);

  return { uid: decoded.uid, email, admin, scope };
}
