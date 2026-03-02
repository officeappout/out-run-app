/**
 * Reactions Service
 *
 * Stores reactions as a sub-collection: feed_posts/{postId}/reactions/{uid}
 * Each doc = { uid, type, createdAt }
 *
 * Also maintains a `reactionCount` field on the parent post for fast reads.
 */

import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  increment,
  collection,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type ReactionType = 'fire' | 'high_five';

export interface Reaction {
  uid: string;
  type: ReactionType;
  createdAt: Date;
}

/**
 * Toggle a reaction on a post (add if missing, remove if exists).
 * Returns the new state: true = reacted, false = removed.
 */
export async function toggleReaction(
  postId: string,
  uid: string,
  type: ReactionType = 'fire',
): Promise<boolean> {
  const reactionRef = doc(db, 'feed_posts', postId, 'reactions', uid);
  const postRef = doc(db, 'feed_posts', postId);

  const existing = await getDoc(reactionRef);

  if (existing.exists()) {
    await deleteDoc(reactionRef);
    await updateDoc(postRef, { reactionCount: increment(-1) }).catch(() => {});
    return false;
  } else {
    await setDoc(reactionRef, { uid, type, createdAt: serverTimestamp() });
    await updateDoc(postRef, { reactionCount: increment(1) }).catch(() => {});
    return true;
  }
}

/**
 * Check whether a specific user has reacted to a post.
 */
export async function hasUserReacted(
  postId: string,
  uid: string,
): Promise<boolean> {
  const snap = await getDoc(doc(db, 'feed_posts', postId, 'reactions', uid));
  return snap.exists();
}

/**
 * Get the reaction count for a post (reads from parent doc field).
 */
export async function getReactionCount(postId: string): Promise<number> {
  const snap = await getDoc(doc(db, 'feed_posts', postId));
  return snap.exists() ? (snap.data().reactionCount ?? 0) : 0;
}

/**
 * Get all reactions for a post (for rendering who reacted).
 */
export async function getReactions(postId: string): Promise<Reaction[]> {
  const snap = await getDocs(collection(db, 'feed_posts', postId, 'reactions'));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      uid: d.id,
      type: data.type ?? 'fire',
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
    };
  });
}
