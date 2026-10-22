'use client';

/**
 * Resolve the "mapped by" credit for a place (enable_park_mapped_by_credit).
 *
 * One read at most: a single `getDoc(userPublic/{uid})` — the same public-
 * profile path the profile page, UserProfileSheet and the park reviews already
 * use (rule: `allow get: if isAuthenticated()`). Never `users/{uid}` (owner +
 * admin only) and never a list/where query (axiom §25). No read at all for
 * team / anonymous-community / unknown credits, or when `enabled` is false.
 */
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  mappedByProfileUid,
  resolveMappedByCredit,
  type MappedByCredit,
  type MappedByPublicProfile,
  type ParkMappedBy,
} from './mapped-by';

const NONE: MappedByCredit = { kind: 'none' };

export function useMappedByCredit(mappedBy: ParkMappedBy | undefined, enabled: boolean): MappedByCredit {
  const uid = enabled ? mappedByProfileUid(mappedBy) : null;
  const [loaded, setLoaded] = useState<{ uid: string; profile: MappedByPublicProfile | null } | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    getDoc(doc(db, 'userPublic', uid))
      .then((snap) => {
        if (cancelled) return;
        if (!snap.exists()) { setLoaded({ uid, profile: null }); return; }
        const d = (snap.data() ?? {}) as Record<string, unknown>;
        setLoaded({
          uid,
          profile: {
            name: typeof d.name === 'string' ? d.name : undefined,
            photoURL: typeof d.photoURL === 'string' ? d.photoURL : undefined,
            ageGroup: d.ageGroup === 'adult' || d.ageGroup === 'minor' ? d.ageGroup : undefined,
          },
        });
      })
      .catch(() => { if (!cancelled) setLoaded({ uid, profile: null }); });
    return () => { cancelled = true; };
  }, [uid]);

  if (!enabled) return NONE;
  // undefined = still loading (resolve shows nothing yet); stale uid counts as loading.
  const profile = uid ? (loaded?.uid === uid ? loaded.profile : undefined) : null;
  return resolveMappedByCredit(mappedBy, profile);
}
