/**
 * Kelly Welcome Bot — Phase 1
 *
 * Seeds a one-time welcome from "Kelly" (OUT's coach) to a user
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

export { KELLY_UID, KELLY_NAME } from './kelly-welcome-bot.constants';

type Gender = 'male' | 'female' | 'other';

/**
 * 'ai'   — the user has Kelly's AI (unified Kelly, flag kelly_unified_v1, adult + AI access):
 *          say what Kelly can do and that the team is there too.
 * 'team' — the conversation is answered by the team (flag off: the human Kelly DM; flag on:
 *          users without AI). No capability the user doesn't actually get.
 */
export type KellyWelcomeMode = 'ai' | 'team';

/**
 * The welcome message. Kelly is a MALE coach for everyone (the AI persona's voice); the brand
 * is OUT. Only the words addressed TO the user are gendered, one full sentence per branch
 * ("No Slashes Rule": never "ברוך/ה"). 'other' / missing gender → name-free and neutral.
 * No "we'll get back to you soon" promise (18.10.2026, owner).
 */
export function buildKellyWelcomeMessage(name: string, gender?: Gender, mode: KellyWelcomeMode = 'team'): string {
  const safeName = (name || '').trim();
  const hello =
    gender === 'male' && safeName
      ? `היי ${safeName}, ברוך הבא ל-OUT!`
      : gender === 'female' && safeName
        ? `היי ${safeName}, ברוכה הבאה ל-OUT!`
        : 'היי, כיף שהצטרפת ל-OUT!';

  if (mode === 'ai') {
    const ask = gender === 'male' ? 'תכתוב לי' : gender === 'female' ? 'תכתבי לי' : 'אפשר לכתוב לי';
    return `${hello} אני קלי, המאמן שלך. אני יכול לבנות לך אימון, לסדר לך את השבוע ולענות על שאלות על האפליקציה. ואם צריך, גם הצוות שלנו זמין כאן. ${ask} מה בא לך לעשות היום.`;
  }

  const ask = gender === 'male' ? 'אתה מוזמן לכתוב' : gender === 'female' ? 'את מוזמנת לכתוב' : 'אפשר לכתוב';
  return `${hello} אני קלי, המאמן שלך. ${ask} כאן כל שאלה על האימונים או על האפליקציה, והצוות שלנו יענה לך.`;
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
