/**
 * Referral Service — Viral Gate referral tracking.
 *
 * When a new Outer signs up via an invite link (`/join?ref=<referrerUid>`),
 * this service increments `core.referralCount` on the referrer's document
 * and records the relationship in a subcollection for audit.
 *
 * Firestore writes:
 *   users/{referrerUid}            → core.referralCount +1
 *   users/{referrerUid}/referrals  → { inviteeUid, inviteeName, joinedAt }
 */

import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  increment,
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
 * Process a referral: increment the referrer's count and log the relationship.
 * Safe to call multiple times for the same pair — uses inviteeUid as doc ID
 * to prevent double-counting.
 */
export async function processReferral(
  referrerUid: string,
  inviteeUid: string,
  inviteeName: string,
): Promise<ReferralResult> {
  try {
    const referralDocRef = doc(db, 'users', referrerUid, 'referrals', inviteeUid);
    const existing = await getDoc(referralDocRef);
    if (existing.exists()) {
      const referrerDoc = await getDoc(doc(db, 'users', referrerUid));
      const currentCount = referrerDoc.data()?.core?.referralCount ?? 0;
      return { success: true, newCount: currentCount, justUnlocked: false };
    }

    await setDoc(referralDocRef, {
      inviteeUid,
      inviteeName,
      joinedAt: serverTimestamp(),
    });

    const userRef = doc(db, 'users', referrerUid);
    await updateDoc(userRef, {
      'core.referralCount': increment(1),
    });

    const updatedDoc = await getDoc(userRef);
    const data = updatedDoc.data();
    const newCount = data?.core?.referralCount ?? 1;
    const referrerName = data?.core?.name ?? '';

    return {
      success: true,
      newCount,
      justUnlocked: newCount >= REFERRAL_GOAL,
      referrerName,
    };
  } catch (error) {
    console.error('[ReferralService] processReferral failed:', error);
    return { success: false, newCount: 0, justUnlocked: false };
  }
}

/**
 * Extract and persist the referrer UID from the URL on the join/gateway page.
 * Call once on mount — stores in sessionStorage so downstream auth handlers
 * can pick it up after the new user finishes sign-up.
 */
export function captureReferralParam(): string | null {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  if (ref) {
    sessionStorage.setItem('referrer_uid', ref);
  }
  return ref ?? sessionStorage.getItem('referrer_uid');
}

/**
 * Retrieve the stored referrer UID (if any). Call after sign-up completes.
 */
export function getStoredReferrer(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('referrer_uid');
}

/**
 * Clear the stored referrer after it's been processed.
 */
export function clearStoredReferrer(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem('referrer_uid');
}
