/**
 * Kelly Welcome Bot — Phase 1
 *
 * Seeds a one-time DM thread from "Kelly" (the OutRun virtual coach) to a user
 * the moment they finish onboarding. Reuses the canonical chat layer
 * (getOrCreateChat + sendMessage) so the thread is indistinguishable from any
 * other human DM and shows up in the user's inbox via useChatInbox.
 *
 * Idempotency: guarded by users/{uid}.hasWelcomeBotTriggered so repeated
 * COMPLETED writes (or retries) never duplicate the greeting.
 *
 * Firestore paths touched:
 *   chats/{chatId}                 — thread metadata (via getOrCreateChat)
 *   chats/{chatId}/messages/{id}   — the greeting (via sendMessage)
 *   users/{uid}.hasWelcomeBotTriggered = true
 */

import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getOrCreateChat, sendMessage } from './chat.service';

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
 * One-time, self-contained trigger. Safe to call fire-and-forget — it reads the
 * user doc, short-circuits if the greeting was already seeded, otherwise creates
 * the Kelly DM thread, posts the greeting as Kelly, and flips the guard flag.
 *
 * Never throws: any failure is logged and swallowed so it can never block the
 * onboarding completion / navigation path that calls it.
 */
export async function triggerKellyWelcomeBot(userId: string): Promise<void> {
  if (!userId) return;

  try {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      console.warn('[KellyBot] User doc missing — skipping welcome bot:', userId);
      return;
    }

    const data = snap.data();

    // Idempotency guard — exactly one greeting per user, ever.
    if (data.hasWelcomeBotTriggered === true) {
      return;
    }

    const name: string = data.core?.name ?? '';
    const gender: Gender | undefined = data.core?.gender;
    const message = buildKellyWelcomeMessage(name, gender);

    // The user is "me" in the canonical pair — Kelly is the other participant.
    const thread = await getOrCreateChat(userId, name || 'משתמש', KELLY_UID, KELLY_NAME);

    // Post the greeting AS Kelly so it lands as an incoming (unread) message for
    // the user and renders on the correct side of the bubble layout.
    await sendMessage(thread.id, KELLY_UID, KELLY_NAME, message);

    // Flip the guard last — if anything above failed we want a retry next time.
    await updateDoc(userRef, { hasWelcomeBotTriggered: true });

    console.log('[KellyBot] Welcome DM seeded for user:', userId);
  } catch (err) {
    // Non-critical — never block onboarding completion.
    console.warn('[KellyBot] triggerKellyWelcomeBot failed (non-critical):', err);
  }
}
