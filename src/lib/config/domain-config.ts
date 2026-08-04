/**
 * Single source of truth for the domains THIS product's web app resolves
 * to — today (interim) and the subdomain shape it moves to on a future
 * domain migration (target). See docs/architecture/domain-config.md for
 * the full inventory + interim/target table. Flipping domains is meant to
 * become: set these env vars (+ capacitor.config.ts's mirrored defaults,
 * see its own comment) + rebuild — not a grep-and-replace across the repo.
 *
 * Every default below equals today's real, deployed value — setting no
 * env vars at all reproduces current production behavior exactly.
 *
 * Scope: THIS product's web/app domain (outrun.co.il) only. Explicitly
 * does NOT cover (see the inventory report for why):
 *   - the company's email/business domain (appout.co.il) — a different,
 *     intentionally separate domain (email + brand), not this product's
 *     web domain
 *   - Firebase Auth's authDomain (appout-1.firebaseapp.com) — tied to the
 *     Firebase PROJECT, not to ROOT_DOMAIN; changing one does not change
 *     the other, and changing it for real requires Firebase Console +
 *     OAuth provider changes, not just a code edit
 *   - the legacy out-run-app.vercel.app fallback URLs still used in a few
 *     share-text/metadata spots — left untouched, flagged in the report
 *
 * All NEXT_PUBLIC_* so the same value is available in both client bundles
 * and middleware (Edge runtime).
 */

/** Bare domain, no protocol, no subdomain — e.g. 'outrun.co.il'. */
export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'outrun.co.il';

/**
 * The marketing/public site. Interim: same bare root as APP_URL — there is
 * no separate marketing site deployed yet. Target (post domain migration):
 * ROOT_DOMAIN itself becomes the marketing site specifically, once the app
 * moves to its own subdomain — see the table in domain-config.md.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || `https://${ROOT_DOMAIN}`;

/**
 * The application itself — what the native shell's capacitor.config.ts
 * server.url points at and what the web app serves from. Interim: same
 * bare root as SITE_URL (no split yet). Target: app.<root>.
 */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || `https://${ROOT_DOMAIN}`;

/**
 * Admin panel. Already a real, live subdomain today — see
 * src/middleware.ts's isAdminDomain gate — not part of the future
 * migration, just centralized here so the literal isn't duplicated.
 */
export const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || `https://admin.${ROOT_DOMAIN}`;

/**
 * API base. No dedicated API domain exists today — /api/* is served from
 * the same origin as APP_URL. Reserved for a future dedicated API
 * subdomain; defaults to APP_URL until one exists.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL || APP_URL;

/**
 * Authority / city-manager portal. Already a real, live subdomain today —
 * see src/middleware.ts's isAuthorityDomain gate. Not one of the 5 vars
 * originally requested, added as a derived constant so middleware.ts
 * doesn't carry a second hardcoded `portal.` literal alongside ADMIN_URL's
 * `admin.` one — same "already split" category as ADMIN_URL.
 */
export const AUTHORITY_PORTAL_URL = process.env.NEXT_PUBLIC_AUTHORITY_PORTAL_URL || `https://portal.${ROOT_DOMAIN}`;
