/**
 * Kelly Welcome Bot — Phase 1
 *
 * Seeds a one-time DM thread from "Kelly" (the OutRun virtual coach) to a user
 * the moment they finish onboarding.
 *
 * The actual Firestore writes moved server-side (10.09.2026) — see
 * /api/social/kelly-welcome-bot/route.ts for why: two independent rule
 * blockers made a client-SDK write here unable to ever succeed (DM creation
 * requires both participants to resolve to an adult users/{uid} doc, and
 * message creation requires the acting caller to BE the sender; Kelly is
 * neither a real user nor ever the actual caller). This file now only holds
 * the pure pieces the route needs (name, greeting text) plus the thin
 * client-side trigger that calls it.
 *
 * Firestore paths touched (server-side, via the route above):
 *   chats/{chatId}                 — thread metadata
 *   chats/{chatId}/messages/{id}   — the greeting
 *   users/{uid}.hasWelcomeBotTriggered = true
 */

import { auth } from '@/lib/firebase';

/** Kelly's permanent system UID — never collides with a real Firebase Auth uid. */
export const KELLY_UID = 'system_kelly_coach';

/** Display name shown on every Kelly message and in the inbox thread header. */
export const KELLY_NAME = 'קלי (OutRun Coach)';

type Gender = 'male' | 'female' | 'other';

/**
 * Builds the gender-aware greeting. Per the "No Slashes Rule", each branch is a
 * fully-formed sentence — we never render "מאמן/ת" style slashes. The fallback
 * is intentionally gender-neutral for `other` or missing data.
 */
export function buildKellyWelcomeMessage(name: string, gender?: Gender): string {
  const safeName = (name || '').trim();

  if (gender === 'male') {
    return `היי ${safeName}, איזה כיף לראות אותך ב-OutRun! אני קלי, המאמן הווירטואלי שלך למסע. המטרה שלנו היא לעזור לך לבנות כוח, לשפר מוביליטי ולדלג מעל פציעות. אם יש לך שאלה או צורך בתמיכה - המקום לכתוב לנו הוא ממש כאן, ונחזור אליך בהקדם!`;
  }

  if (gender === 'female') {
    return `היי ${safeName}, איזה כיף לראות אותך ב-OutRun! אני קלי, המאמנת הווירטואלית שלך למסע. המטרה שלנו היא לעזור לך לבנות כוח, לשפר מוביליטי ולדלג מעל פציעות. אם יש לך שאלה או צורך בתמיכה - המקום לכתוב לנו הוא ממש כאן, ונחזור אליך בהקדם!`;
  }

  // Fallback: gender === 'other' or missing → name-free, fully gender-neutral.
  return `איזה כיף שהצטרפת למשפחת OutRun! כאן קלי, העוזר והמאמן האישי שלך למסע. המטרה שלנו היא לעזור לך לבנות כוח, לשפר מוביליטי ולדלג מעל פציעות. אם יש לך שאלה או צורך בתמיכה - המקום לכתוב לנו הוא ממש כאן, ונחזור אליך בהקדם!`;
}

/**
 * Thin client-side trigger — calls /api/social/kelly-welcome-bot, which owns
 * the actual read-check-flip-and-write transaction. Safe to call fire-and-
 * forget from multiple places (onboarding completion, the login-time
 * catch-up hook): the endpoint's own transaction is what makes two
 * concurrent/duplicate calls resolve to exactly one greeting, not this
 * function.
 *
 * source is required and forwarded as-is — the route uses it to decide
 * whether the go-live registration-date cutoff applies ('catchup' only;
 * see the route's own comment for why 'onboarding' is exempt).
 *
 * Never throws: any failure is logged and swallowed so it can never block
 * the onboarding completion / navigation path that calls it.
 */
export async function triggerKellyWelcomeBot(
  userId: string,
  source: 'onboarding' | 'catchup',
): Promise<void> {
  if (!userId) return;

  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) {
      console.warn('[KellyBot] No auth token available — skipping welcome bot:', userId);
      return;
    }

    const res = await fetch('/api/social/kelly-welcome-bot', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ source }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      console.warn('[KellyBot] request failed:', body?.error ?? res.status);
      return;
    }

    const result = await res.json() as { sent?: boolean; reason?: string };
    if (result.sent) {
      console.log('[KellyBot] Welcome DM seeded for user:', userId);
    }
  } catch (err) {
    // Non-critical — never block onboarding completion.
    console.warn('[KellyBot] triggerKellyWelcomeBot failed (non-critical):', err);
  }
}
