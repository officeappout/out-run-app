/**
 * onReferralCreateLeagueBonus — +50 for the referrer's city and neighborhood
 * leagues when a friend joins through their invite (see
 * lib/apply-referral-bonus.ts for the rules and the abuse limits).
 */
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { applyReferralBonus } from './lib/apply-referral-bonus';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export const onReferralCreateLeagueBonus = onDocumentCreated('referrals/{referralId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  try {
    const result = await applyReferralBonus(
      db,
      () => admin.firestore.FieldValue.serverTimestamp(),
      (n) => admin.firestore.FieldValue.increment(n),
      event.params.referralId,
      snap.data(),
    );
    logger.info('onReferralCreateLeagueBonus', { referralId: event.params.referralId, result });
  } catch (e) {
    logger.error('onReferralCreateLeagueBonus failed', { referralId: event.params.referralId, e });
    throw e; // retry — the marker keeps it exactly-once
  }
});
