'use client';

/**
 * useKellyThreadMeta — live view of the user's own ai_coach_threads/{uid} doc (owner-readable
 * per firestore.rules) for unified Kelly (kelly_unified_v1): unread count for the inbox row and
 * the header badge, plus the last message preview. `enabled` false → no listener, zeros.
 */
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { msOf } from '@/lib/ai/coach/kelly-admin';

export interface KellyThreadMeta {
  exists: boolean;
  unreadForUser: number;
  lastMessagePreview: string;
  lastMessageAtMs: number;
}

const EMPTY: KellyThreadMeta = { exists: false, unreadForUser: 0, lastMessagePreview: '', lastMessageAtMs: 0 };

export function useKellyThreadMeta(uid: string | null | undefined, enabled: boolean): KellyThreadMeta {
  const [meta, setMeta] = useState<KellyThreadMeta>(EMPTY);
  useEffect(() => {
    if (!uid || !enabled) {
      setMeta(EMPTY);
      return;
    }
    return onSnapshot(
      doc(db, 'ai_coach_threads', uid),
      (snap) => {
        const d = snap.exists() ? (snap.data() ?? {}) : {};
        setMeta({
          exists: snap.exists(),
          unreadForUser: typeof d.unreadForUser === 'number' && d.unreadForUser > 0 ? d.unreadForUser : 0,
          lastMessagePreview: typeof d.lastMessagePreview === 'string' ? d.lastMessagePreview : '',
          lastMessageAtMs: msOf(d.lastMessageAt),
        });
      },
      () => setMeta(EMPTY),
    );
  }, [uid, enabled]);
  return meta;
}
