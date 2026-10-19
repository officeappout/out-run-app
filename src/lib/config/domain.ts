/**
 * The app's public domain — the ONE switch for a domain move.
 *
 * Every absolute URL / host check in the app derives from here. Moving the
 * app to a new domain (planned: outrun.co.il → appout.co.il) is:
 *   1. NEXT_PUBLIC_APP_DOMAIN=<new host> in Vercel (+ redeploy — NEXT_PUBLIC_*
 *      is inlined at build, including into the edge middleware).
 *   2. NEXT_PUBLIC_APP_LEGACY_DOMAINS=<old host> so the old host keeps being
 *      recognised (admin./portal. routing, own-site referrers) while it is
 *      still attached and serving.
 * Native shell files (capacitor.config.ts, AndroidManifest, entitlements) and
 * console allow-lists are NOT covered by this — see docs/migration-plan.md in
 * the appout-website repo.
 *
 * Never use this for calendar UIDs/PRODIDs (`@outrun.co.il`): those must stay
 * stable forever or subscribed calendars duplicate every event.
 */

function cleanHost(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
}

/** Bare host, no scheme — e.g. `outrun.co.il`. */
export const APP_DOMAIN = cleanHost(process.env.NEXT_PUBLIC_APP_DOMAIN || 'outrun.co.il');

/** `https://<APP_DOMAIN>` — no trailing slash. */
export const APP_ORIGIN = `https://${APP_DOMAIN}`;

/** Previous domains that still serve the app (comma-separated env). */
export const LEGACY_APP_DOMAINS: readonly string[] = (process.env.NEXT_PUBLIC_APP_LEGACY_DOMAINS || '')
  .split(',')
  .map(cleanHost)
  .filter((d) => d && d !== APP_DOMAIN);

/** Current domain first, then the legacy ones. */
export const ALL_APP_DOMAINS: readonly string[] = [APP_DOMAIN, ...LEGACY_APP_DOMAINS];

/** Hosts that route to the admin panel (plus the local-dev alias). */
export const ADMIN_HOSTS: readonly string[] = [...ALL_APP_DOMAINS.map((d) => `admin.${d}`), 'admin.outrun.local'];

/** Hosts that route to the authority portal (plus the local-dev alias). */
export const PORTAL_HOSTS: readonly string[] = [...ALL_APP_DOMAINS.map((d) => `portal.${d}`), 'portal.outrun.local'];

/** Our own site hosts (bare + www), for "is this referrer us?" checks. */
export const SITE_HOSTS: readonly string[] = ALL_APP_DOMAINS.flatMap((d) => [d, `www.${d}`]);
