/**
 * onLevelUp — Firestore trigger (onUpdate on users/{uid}).
 *
 * Fires whenever a user document is updated. Early-exits immediately when
 * progression.globalLevel has not increased, so the cost per user-doc write is
 * a single field comparison with no further I/O.
 *
 * When a level-up is detected it sends a personalised Hebrew push notification
 * via push.service.ts, which enforces:
 *   • user preference filter (settings.notificationPrefs.progression)
 *   • quiet hours 22:00–07:00 IST
 *   • rate cap 24 h per uid on channel 'progression'
 *
 * Deep-link: '/' (home / league) — users see their new rank on return.
 *
 * Axiom compliance:
 *   • progression.globalLevel is the server-canonical value written only by
 *     awardWorkoutXP / progression.service.ts (axiom §2 / §LAW 0).
 *   • This trigger is READ-ONLY on the user doc — it sends a push and touches
 *     only push_rate/{uid} for the rate-cap stamp.
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendPush } from './services/push.service';

if (!admin.apps.length) {
  admin.initializeApp();
}

/** Maps level numbers to copy. Level 1 is the initial state — never pushes on first sign-up. */
const LEVEL_MESSAGES: Record<number, { title: string; body: string }> = {
  2:  { title: '🏅 עלית לרמה 2!', body: 'אתה בדרך הנכונה — המשך לאמן ותראה שינוי אמיתי.' },
  3:  { title: '💪 רמה 3 הושגה!', body: 'שלושה שבועות של עקביות. אתה לא ממוצע.' },
  4:  { title: '⚡ רמה 4!', body: 'רבע מהדרך לרמה 5 — כל אימון מוסיף.' },
  5:  { title: '🔥 רמה 5 — נגע יותר חזק!', body: 'הגעת לרמה חשובה. הגוף שלך כבר שונה מלפני חודש.' },
  6:  { title: '🎯 רמה 6', body: 'תמשיך ברצף שלך — כל יום ספירה.' },
  7:  { title: '⭐ רמה 7', body: 'אתה בטופ של הרשות שלך. מרשים.' },
  8:  { title: '🚀 רמה 8!', body: 'רק 2 רמות לסיום הליגה — תשאר ממוקד.' },
  9:  { title: '👑 רמה 9!', body: 'כמעט שם. רמה 10 היא מטרה שמעטים מגיעים אליה.' },
  10: { title: '🏆 רמה 10 — מקסימום!', body: 'הגעת לרמה הגבוהה ביותר. ברכות, זה מסע אמיתי.' },
};

const DEFAULT_LEVEL_MESSAGE = (level: number) => ({
  title: `⚡ עלית לרמה ${level}!`,
  body: 'כל אימון מוסיף — המשך.',
});

export const onLevelUp = onDocumentUpdated(
  {
    document: 'users/{uid}',
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (event) => {
    const uid = event.params.uid as string;
    const before = event.data?.before.data() as Record<string, unknown> | undefined;
    const after = event.data?.after.data() as Record<string, unknown> | undefined;

    if (!before || !after) return;

    const prevLevel = (before?.progression as Record<string, unknown> | undefined)?.globalLevel;
    const newLevel = (after?.progression as Record<string, unknown> | undefined)?.globalLevel;

    // Fast exit: no change or not a numeric level increase
    if (
      typeof newLevel !== 'number' ||
      typeof prevLevel !== 'number' ||
      newLevel <= prevLevel
    ) {
      return;
    }

    // Never push for level 1 (initial state on account creation)
    if (newLevel <= 1) return;

    const msg = LEVEL_MESSAGES[newLevel] ?? DEFAULT_LEVEL_MESSAGE(newLevel);

    logger.info(`[onLevelUp] uid=${uid} level ${prevLevel} → ${newLevel}`);

    try {
      const result = await sendPush({
        toUids: [uid],
        channel: 'progression',
        title: msg.title,
        body: msg.body,
        deepLink: '/',
        data: { newLevel: String(newLevel), prevLevel: String(prevLevel) },
        rateCapHours: 24,
      });
      logger.info(`[onLevelUp] uid=${uid} result=${JSON.stringify(result)}`);
    } catch (err: unknown) {
      logger.error(`[onLevelUp] sendPush failed for uid=${uid}`, err);
    }
  },
);
