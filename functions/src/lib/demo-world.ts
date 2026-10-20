/**
 * Demo world — the one Firestore read the guards need: the owner's viewer
 * accounts (real test accounts bound to the demo world, see
 * agent-briefs/demo-users-design.md §3.1 bind-viewer).
 *
 *   demo_registry/viewers = { uids: string[] }
 *
 * demo_registry is server-only (firestore.rules: read/write false) — written
 * by the seed / bind-viewer scripts (PR 3) with the Admin SDK. Read ONLY when
 * the actor of an action is already known to be demo, so real-user flows pay
 * nothing. Fails closed: a missing doc or a read error ⇒ no viewers, i.e. a
 * demo actor reaches only other demo users.
 */
import type { firestore } from 'firebase-admin';

export const DEMO_REGISTRY_COLLECTION = 'demo_registry';
export const DEMO_VIEWERS_DOC_ID = 'viewers';

export async function loadDemoViewerUids(db: firestore.Firestore): Promise<Set<string>> {
  try {
    const snap = await db.collection(DEMO_REGISTRY_COLLECTION).doc(DEMO_VIEWERS_DOC_ID).get();
    const uids = snap.exists ? (snap.data()?.uids as unknown) : undefined;
    return new Set(Array.isArray(uids) ? uids.filter((u): u is string => typeof u === 'string' && !!u) : []);
  } catch {
    return new Set();
  }
}
