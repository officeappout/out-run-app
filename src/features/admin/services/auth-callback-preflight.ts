/**
 * Pure decision logic for /admin/auth/callback's pre-flight check: given
 * whatever Firebase Auth session already exists in this browser (if any)
 * and the magic link's resolved target email, decide what to do next —
 * before touching Firebase or React state at all.
 *
 * Kept dependency-free (no firebase/auth, no React, no @/lib/firebase) so
 * it's testable directly in Node/vitest — unlike the rest of this flow,
 * which needs a real client SDK and this repo has no jsdom setup for.
 */

export interface PreflightSessionInfo {
  uid: string;
  email: string | null;
  isAnonymous: boolean;
}

export type PreflightAction =
  | { kind: 'proceed' }
  | { kind: 'resolve'; uid: string }
  | { kind: 'confirm-switch'; fromEmail: string; toEmail: string };

/**
 * currentUser: null when nobody is signed in on this device/browser.
 * targetEmail: the magic link's resolved recipient; '' when unresolvable
 *   (e.g. an invitation link whose verify-token lookup failed).
 *
 * An ANONYMOUS session is treated exactly like no session at all. It's a
 * distinct, disposable identity that says nothing about who is actually
 * opening this link — this app creates them liberally (SPEC-03 Wave C).
 * Treating one as "already signed in" was the root cause of a live
 * regression (22.09.2026): a returning manager's own magic link got
 * silently evaluated against a leftover anonymous uid instead of ever
 * being consumed, producing "no access" without the real account ever
 * being touched.
 */
export function decidePreflightAction(
  currentUser: PreflightSessionInfo | null,
  targetEmail: string,
): PreflightAction {
  if (!currentUser || currentUser.isAnonymous) {
    return { kind: 'proceed' };
  }

  const isDifferentTarget = Boolean(
    targetEmail && currentUser.email &&
    targetEmail.toLowerCase() !== currentUser.email.toLowerCase(),
  );

  if (isDifferentTarget) {
    return { kind: 'confirm-switch', fromEmail: currentUser.email || '', toEmail: targetEmail };
  }

  return { kind: 'resolve', uid: currentUser.uid };
}
