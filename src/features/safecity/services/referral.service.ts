/**
 * Referral Service — Viral Gate referral tracking + auto-connect.
 *
 * When a new Outer signs up via an invite link (`/join?ref=<referrerUid>`),
 * this service records the referral in a top-level `/referrals` collection
 * and establishes a mutual social connection between the two users.
 *
 * Firestore writes:
 *   referrals/{referrerUid}_{inviteeUid}  → audit record
 *   connections/{uid}                      → arrayUnion for mutual follow
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

const REFERRAL_GOAL = 1;

export interface ReferralResult {
  success: boolean;
  newCount: number;
  justUnlocked: boolean;
  referrerName?: string;
}

/**
 * Process a referral: log the relationship in the top-level /referrals collection.
 * Safe to call multiple times for the same pair — uses composite doc ID
 * to prevent double-counting.
 *
 * NOTE: referralCount on the referrer's user doc should be maintained by a
 * Cloud Function trigger on the /referrals collection, not by client writes.
 */
export async function processReferral(
  referrerUid: string,
  inviteeUid: string,
  inviteeName: string,
): Promise<ReferralResult> {
  try {
    const referralDocId = `${referrerUid}_${inviteeUid}`;
    const referralDocRef = doc(db, 'referrals', referralDocId);
    const existing = await getDoc(referralDocRef);
    if (existing.exists()) {
      return { success: true, newCount: 0, justUnlocked: false };
    }

    await setDoc(referralDocRef, {
      referrerUid,
      inviteeUid,
      inviteeName,
      joinedAt: serverTimestamp(),
    });

    return {
      success: true,
      newCount: 1,
      justUnlocked: true,
    };
  } catch (error) {
    console.error('[ReferralService] processReferral failed:', error);
    return { success: false, newCount: 0, justUnlocked: false };
  }
}

/**
 * Establish a mutual follow (partner) relationship between two users.
 * Writes to both connections/{inviterUid} and connections/{newUid}.
 */
export async function establishSocialConnection(
  inviterUid: string,
  newUid: string,
): Promise<void> {
  if (inviterUid === newUid) return;

  try {
    const inviterRef = doc(db, 'connections', inviterUid);
    const newUserRef = doc(db, 'connections', newUid);

    await Promise.all([
      updateDoc(inviterRef, {
        following: arrayUnion(newUid),
        followers: arrayUnion(newUid),
      }).catch(() =>
        setDoc(inviterRef, { following: [newUid], followers: [newUid] }, { merge: true }),
      ),
      updateDoc(newUserRef, {
        following: arrayUnion(inviterUid),
        followers: arrayUnion(inviterUid),
      }).catch(() =>
        setDoc(newUserRef, { following: [inviterUid], followers: [inviterUid] }, { merge: true }),
      ),
    ]);
  } catch (error) {
    console.error('[ReferralService] establishSocialConnection failed:', error);
  }
}

/**
 * Extract and persist the referrer UID from the URL on the join/gateway page.
 * Uses localStorage so the value survives tab-close on mobile.
 */
export function captureReferralParam(): string | null {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  if (ref) {
    localStorage.setItem('referrer_uid', ref);
  }
  return ref ?? localStorage.getItem('referrer_uid');
}

/**
 * Retrieve the stored referrer UID (if any). Call after sign-up completes.
 */
export function getStoredReferrer(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('referrer_uid');
}

/**
 * Clear the stored referrer after it's been processed.
 */
export function clearStoredReferrer(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('referrer_uid');
}
