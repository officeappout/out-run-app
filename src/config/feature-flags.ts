/**
 * Feature Flags Configuration
 * 
 * COIN_SYSTEM_PAUSED: The coin/economy system is temporarily frozen.
 * Re-enable in April by setting IS_COIN_SYSTEM_ENABLED = true
 */

// COIN_SYSTEM_PAUSED: Set to true to re-enable the coin economy system
export const IS_COIN_SYSTEM_ENABLED = false;

// ============================================================================
// ROOT ADMIN SYSTEM (ENV-based, immutable at runtime)
// ============================================================================

/**
 * Root Admins — defined via environment variable for maximum security.
 * Only Root Admins can manage the admin_invitations collection.
 * Root Admins automatically have super_admin privileges + isApproved.
 *
 * Set in .env.local:
 *   NEXT_PUBLIC_ROOT_ADMIN_EMAILS=david@appout.co.il,office@appout.co.il
 */
const ROOT_ADMIN_ENV = process.env.NEXT_PUBLIC_ROOT_ADMIN_EMAILS || '';

export const ROOT_ADMIN_EMAILS: string[] = ROOT_ADMIN_ENV
  ? ROOT_ADMIN_ENV.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  : [
      // Hardcoded fallback — used if ENV is not set (e.g., local dev without .env)
      'david@appout.co.il',
      'office@appout.co.il',
    ];

/**
 * Check if an email is a Root Admin (ENV-defined, highest authority).
 */
export function isRootAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return ROOT_ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

// ============================================================================
// ADMIN ACCESS CONTROL (Super Admin allowlist)
// ============================================================================

/**
 * Admin Access Control
 * 
 * Only emails in this list (or Root Admins) are allowed Super Admin access.
 * Root Admins are always included implicitly.
 */
export const ADMIN_ALLOWED_EMAILS: string[] = [
  // Root Admins (always included)
  ...ROOT_ADMIN_EMAILS,
  // DB-managed Super Admins
  'gal@appout.co.il',
  'matan.danan@appout.co.il',
];

/**
 * Check if an email is allowed admin access (Super Admin level).
 * Returns true for Root Admins + allowlisted Super Admins.
 */
export function isAdminEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalizedEmail = email.toLowerCase().trim();
  return ADMIN_ALLOWED_EMAILS.some(
    allowedEmail => allowedEmail.toLowerCase().trim() === normalizedEmail
  );
}

// Helper function for conditional rendering
export function shouldShowCoinUI(): boolean {
  return IS_COIN_SYSTEM_ENABLED;
}

// Helper function for conditional coin logic
export function shouldProcessCoinRewards(): boolean {
  return IS_COIN_SYSTEM_ENABLED;
}
