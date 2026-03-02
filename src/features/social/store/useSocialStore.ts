'use client';

/**
 * Social Store — Zustand + Firestore
 *
 * Firestore schema:
 *   connections/{myUid}          → { following: string[], followers: string[] }
 *   feed_posts/{postId}          → FeedPost document
 *
 * All reads require auth. Writes are restricted to own doc.
 */

import { create } from 'zustand';
import {
  doc,
  getDoc,
  setDoc,
  arrayUnion,
  arrayRemove,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface ConnectionsDoc {
  following: string[];
  followers: string[];
}

interface SocialState {
  following: string[];
  followers: string[];
  isLoaded: boolean;
  isLoading: boolean;

  loadConnections: (userId: string) => Promise<void>;
  followUser: (myUid: string, targetUid: string) => Promise<void>;
  unfollowUser: (myUid: string, targetUid: string) => Promise<void>;
  isFollowing: (targetUid: string) => boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Store
// ────────────────────────────────────────────────────────────────────────────

export const useSocialStore = create<SocialState>((set, get) => ({
  following: [],
  followers: [],
  isLoaded: false,
  isLoading: false,

  loadConnections: async (userId: string) => {
    if (get().isLoading) return;
    set({ isLoading: true });

    try {
      const snap = await getDoc(doc(db, 'connections', userId));
      if (snap.exists()) {
        const data = snap.data() as ConnectionsDoc;
        set({
          following: data.following ?? [],
          followers: data.followers ?? [],
          isLoaded: true,
        });
      } else {
        await setDoc(doc(db, 'connections', userId), {
          following: [],
          followers: [],
        });
        set({ following: [], followers: [], isLoaded: true });
      }
    } catch (err) {
      console.error('[SocialStore] loadConnections failed:', err);
    } finally {
      set({ isLoading: false });
    }
  },

  followUser: async (myUid: string, targetUid: string) => {
    if (myUid === targetUid) return;

    set((s) => ({
      following: s.following.includes(targetUid)
        ? s.following
        : [...s.following, targetUid],
    }));

    try {
      const myRef = doc(db, 'connections', myUid);
      const targetRef = doc(db, 'connections', targetUid);

      await Promise.all([
        updateDoc(myRef, { following: arrayUnion(targetUid) }).catch(() =>
          setDoc(myRef, { following: [targetUid], followers: [] }, { merge: true }),
        ),
        updateDoc(targetRef, { followers: arrayUnion(myUid) }).catch(() =>
          setDoc(targetRef, { following: [], followers: [myUid] }, { merge: true }),
        ),
      ]);
    } catch (err) {
      console.error('[SocialStore] followUser failed:', err);
      set((s) => ({ following: s.following.filter((id) => id !== targetUid) }));
    }
  },

  unfollowUser: async (myUid: string, targetUid: string) => {
    set((s) => ({
      following: s.following.filter((id) => id !== targetUid),
    }));

    try {
      const myRef = doc(db, 'connections', myUid);
      const targetRef = doc(db, 'connections', targetUid);

      await Promise.all([
        updateDoc(myRef, { following: arrayRemove(targetUid) }),
        updateDoc(targetRef, { followers: arrayRemove(myUid) }),
      ]);
    } catch (err) {
      console.error('[SocialStore] unfollowUser failed:', err);
      set((s) => ({
        following: s.following.includes(targetUid)
          ? s.following
          : [...s.following, targetUid],
      }));
    }
  },

  isFollowing: (targetUid: string) => {
    return get().following.includes(targetUid);
  },
}));
