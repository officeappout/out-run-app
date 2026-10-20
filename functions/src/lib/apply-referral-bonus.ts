/**
 * applyReferralBonus — "invite a friend, +50 for your neighborhood" (design
 * lab leagues, approved 17.10.2026). When a referral is recorded
 * (referrals/{referrer}_{invitee}, written by the invitee's client), the
 * REFERRER's city and neighborhood league totals get +50 for the current week
 * and month, exactly once.
 *
 * Deliberately scope-level only: the bonus raises totalCredit (and a separate
 * bonusCredit for transparency) but never the active-member count or the
 * per-activity / per-gender buckets — inviting someone isn't a workout, and it
 * must not make a person who didn't train count as "active".
 *
 * Also fixes a quiet bug: processReferral() (client) increments the
 * referrer's core.referralCount / social.partnerCount on THEIR user doc, which
 * the rules only let the owner write — so it always failed and was swallowed.
 * The trigger does it with the Admin SDK instead.
 *
 * Abuse limits: no self-referral, one bonus per invitee pair (the doc id), and
 * at most MAX_BONUSES_PER_WEEK bonuses per referrer per week.
 */
import type { firestore } from 'firebase-admin';
import { periodKeysFor, scopeTargetsFor, statsDocId, type LeagueWindow } from './league-scope-stats';
import { isDemoUid } from './demo';

export const REFERRAL_BONUS = 50;
export const MAX_BONUSES_PER_WEEK = 5;
const WINDOWS: LeagueWindow[] = ['weekly', 'monthly'];

export type ReferralBonusResult = 'applied' | 'already' | 'self' | 'no-user' | 'no-scope' | 'capped';

export async function applyReferralBonus(
  db: firestore.Firestore,
  serverTimestamp: () => firestore.FieldValue,
  increment: (n: number) => firestore.FieldValue,
  referralId: string,
  data: firestore.DocumentData,
  now: Date = new Date(),
): Promise<ReferralBonusResult> {
  const referrer: string = typeof data.referrerUid === 'string' ? data.referrerUid : '';
  const invitee: string = typeof data.inviteeUid === 'string' ? data.inviteeUid : '';
  if (!referrer || !invitee) return 'no-user';
  if (referrer === invitee) return 'self';
  // Demo world guard (20.10.2026): a demo referrer or invitee never earns a
  // league bonus — simulated sign-ups must not lift a real city's board.
  if (isDemoUid(referrer) || isDemoUid(invitee)) return 'no-user';

  const userRef = db.collection('users').doc(referrer);
  const u = (await userRef.get()).data();
  if (!u) return 'no-user';
  // City + neighborhood only — groups aren't geographic leagues.
  const targets = scopeTargetsFor((u.core ?? {}) as Record<string, unknown>, []);

  const keys = periodKeysFor(now);
  const marker = db.collection('league_scope_stats_processed').doc(`referral_${referralId}`);
  const weekMarkers = db
    .collection('league_scope_stats_processed')
    .where('kind', '==', 'referral')
    .where('uid', '==', referrer)
    .where('weekKey', '==', keys.weekly);

  return db.runTransaction(async (tx) => {
    if ((await tx.get(marker)).exists) return 'already' as const;
    const already = await tx.get(weekMarkers);
    const capped = already.size >= MAX_BONUSES_PER_WEEK;

    if (!capped && targets.length) {
      for (const w of WINDOWS) {
        for (const t of targets) {
          const ref = db.collection('league_scope_stats').doc(statsDocId(w, keys[w], t));
          tx.set(
            ref,
            {
              window: w,
              periodKey: keys[w],
              granularity: t.granularity,
              scopeId: t.scopeId,
              parentId: t.parentId,
              totalCredit: increment(REFERRAL_BONUS),
              bonusCredit: increment(REFERRAL_BONUS),
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        }
      }
    }
    // The counters the client never managed to write (owner-only rule).
    tx.set(userRef, { core: { referralCount: increment(1) }, social: { partnerCount: increment(1) } }, { merge: true });
    tx.set(marker, {
      kind: 'referral',
      uid: referrer,
      invitee,
      weekKey: keys.weekly,
      credit: capped || !targets.length ? 0 : REFERRAL_BONUS,
      at: serverTimestamp(),
    });
    if (capped) return 'capped' as const;
    return targets.length ? ('applied' as const) : ('no-scope' as const);
  });
}
