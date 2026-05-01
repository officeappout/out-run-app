/**
 * Client wrapper for the `requestAccountDeletion` Cloud Function
 * (Compliance Phase 3.3 — GDPR / Israeli Privacy Law right-to-erasure).
 *
 * This is the ONLY supported way to delete an account from the browser.
 * Direct `auth.currentUser.delete()` only removes the Auth record and
 * leaves orphan data in Firestore + Storage; the callable function
 * recursively purges users/{uid}, dailyActivity, presence, connections,
 * activity, kudos, feed_posts, DMs, group-chat membership, communities
 * the user created, and storage prefixes — then deletes the Auth user.
 *
 * The server-side function is idempotent, so retrying after a network
 * failure is safe.
 *
 * After a successful call, the user's auth token is invalid; the caller
 * MUST `signOut(auth)` and route to a public landing page.
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '@/lib/firebase';

export interface RequestAccountDeletionResult {
  ok: true;
  uid: string;
  /** Counts of subcollections / docs purged (best-effort, server-reported). */
  counts?: Record<string, number>;
}

export async function requestAccountDeletion(): Promise<RequestAccountDeletionResult | null> {
  if (typeof window === 'undefined') return null;
  try {
    const functions = getFunctions(app, 'us-central1');
    const callable = httpsCallable<Record<string, never>, RequestAccountDeletionResult>(
      functions,
      'requestAccountDeletion',
    );
    const { data } = await callable({});
    return data;
  } catch (err) {
    console.error('[requestAccountDeletion] callable failed:', err);
    throw err;
  }
}
