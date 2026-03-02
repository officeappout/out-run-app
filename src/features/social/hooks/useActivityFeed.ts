'use client';

import { useEffect, useState } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ActivityFeedItem } from '@/types/community.types';

function tsToDate(ts: unknown): Date {
  if (ts instanceof Timestamp) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date();
}

/**
 * Real-time subscription to the current user's activity feed.
 * Firestore path: activity/{uid}/feed
 * Written by Cloud Functions and kudos.service.ts; read-only on client.
 */
export function useActivityFeed(myUid: string | null, itemLimit = 30) {
  const [items, setItems] = useState<ActivityFeedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const unreadCount = items.filter((i) => !i.read).length;

  useEffect(() => {
    if (!myUid) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    const q = query(
      collection(db, 'activity', myUid, 'feed'),
      orderBy('createdAt', 'desc'),
      limit(itemLimit),
    );

    const unsub = onSnapshot(q, (snap) => {
      const data: ActivityFeedItem[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ActivityFeedItem, 'id' | 'createdAt'>),
        createdAt: tsToDate(d.data().createdAt),
      }));
      setItems(data);
      setIsLoading(false);
    });

    return unsub;
  }, [myUid, itemLimit]);

  return { items, isLoading, unreadCount };
}
