/**
 * resolveAuthLinkOutcome.ts — P0-4 (25.09.2026, see docs/audit-2026-09/
 * 00-MASTER-PLAN.md §13.24): the decision logic behind src/app/page.tsx's
 * Google/Apple login handlers, extracted into a pure function so it's
 * actually testable — this repo's vitest config is node-only, no jsdom,
 * so logic left inline in a .tsx component's event handler can't be
 * exercised directly (same reasoning as P0-1's resolveUser() extraction).
 *
 * Takes the raw {user, error} result from auth.service.ts's link/sign-in
 * functions (none of which throw — they all catch internally) and turns
 * it into exactly one of four outcomes the caller acts on:
 *   - 'silent'          — user canceled; do nothing, no log, no message.
 *   - 'account_exists'  — the Google/Apple identity is already a real
 *                          account elsewhere. David's explicit product
 *                          decision: offer to sign into it, never block —
 *                          this outcome by itself changes NOTHING (no
 *                          redirect, no guest-doc write); the caller must
 *                          get an explicit confirm before doing anything.
 *   - 'proceed'         — success, or the defensive 'not_anonymous' case
 *                          (became non-anonymous between the isAnonymous
 *                          check and the call) — redirect with this uid.
 *   - 'error'           — a real failure (timeout, network, unknown) —
 *                          must be reported AND shown to the user, never
 *                          silent.
 */

export type AuthProvider = 'google' | 'apple';

export type AuthLinkOutcome =
  | { kind: 'silent' }
  | { kind: 'account_exists'; provider: AuthProvider; reportReason: string }
  | { kind: 'proceed'; uid: string }
  | { kind: 'error'; reportReason: string; toastMessage: string };

export interface AuthResult {
  user: { uid: string } | null;
  error: string | null;
}

const CANCEL_CODES: Record<AuthProvider, readonly string[]> = {
  google: ['google_canceled', 'popup_closed'],
  apple: ['apple_canceled'],
};

const GENERIC_TOAST_MESSAGE: Record<AuthProvider, string> = {
  google: 'החיבור ל-Google לא הצליח. נסו שוב.',
  apple: 'החיבור ל-Apple לא הצליח. נסו שוב.',
};

/**
 * @param provider which provider this result came from.
 * @param result the raw {user, error} from auth.service.ts.
 * @param currentUserUid auth.currentUser?.uid at call time — only consulted
 *   for the defensive 'not_anonymous' branch.
 */
export function resolveAuthLinkOutcome(
  provider: AuthProvider,
  result: AuthResult,
  currentUserUid: string | null,
): AuthLinkOutcome {
  const { user, error } = result;

  if (error && CANCEL_CODES[provider].includes(error)) {
    return { kind: 'silent' };
  }

  if (error === `${provider}_account_exists`) {
    return { kind: 'account_exists', provider, reportReason: error };
  }

  if (error === 'not_anonymous') {
    return currentUserUid
      ? { kind: 'proceed', uid: currentUserUid }
      : { kind: 'error', reportReason: 'not_anonymous', toastMessage: GENERIC_TOAST_MESSAGE[provider] };
  }

  if (error) {
    return { kind: 'error', reportReason: error, toastMessage: GENERIC_TOAST_MESSAGE[provider] };
  }

  if (user) {
    return { kind: 'proceed', uid: user.uid };
  }

  return { kind: 'error', reportReason: 'unknown', toastMessage: GENERIC_TOAST_MESSAGE[provider] };
}
