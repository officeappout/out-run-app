/**
 * Feature Flags Configuration
 * 
 * COIN_SYSTEM_PAUSED: The coin/economy system is temporarily frozen.
 * Re-enable in April by setting IS_COIN_SYSTEM_ENABLED = true
 */

// COIN_SYSTEM_PAUSED: Set to true to re-enable the coin economy system
export const IS_COIN_SYSTEM_ENABLED = false;

/**
 * Admin Access Control
 * 
 * Only emails in this list are allowed to access /admin routes.
 * Add new admin emails here.
 */
export const ADMIN_ALLOWED_EMAILS: string[] = [
  // Primary admins - add your actual admin emails here
  'gal@appout.co.il',
  'office@appout.co.il',
  'david@appout.co.il',
  'matan.danan@appout.co.il',
  // Add more admin emails below:
  // 'your-email@gmail.com',
];

// Helper function to check if an email is allowed admin access
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
