/**
 * Centralized App URL Configuration
 *
 * Architectural distinction:
 *
 *   GENERAL_INVITE_ONELINK — Used exclusively for social friend-invite flows.
 *     Points to a smart OneLink that detects the OS and redirects the recipient
 *     to the correct App Store (iOS) or Play Store (Android). New users who
 *     don't have the app installed will be sent straight to the store.
 *     Format: `GENERAL_INVITE_ONELINK?ref=<userId>`
 *
 *   WEB_BASE_URL — Used for entity-sharing flows (workouts, groups, events).
 *     Must land on the browser/web-view first so the content can render for
 *     recipients who don't yet have the app, and so Open Graph previews work.
 *     Format: `WEB_BASE_URL/workouts/<id>` or `WEB_BASE_URL/join/<inviteCode>`
 *
 *   LEGACY_VERCEL_URL — The old Vercel deployment URL kept as a reference.
 *     Do not use in new code. Retained here to make future migration audits easy.
 */
export const APP_CONFIG_LINKS = {
  /** OneLink smart-link for general friend invites — forces store redirect. */
  GENERAL_INVITE_ONELINK: 'https://onelink.to/appout',

  /** Canonical production web base URL for entity sharing (workouts, groups). */
  WEB_BASE_URL: 'https://outrun.co.il',

  /** Legacy Vercel deployment URL — kept for reference only, do not use. */
  LEGACY_VERCEL_URL: 'https://out-run-app.vercel.app',
} as const;
