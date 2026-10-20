'use client';

/**
 * useWeeklyRunCount — this week's RUNS (not walks), enable_home_v2 only.
 *
 * One bounded read per (user, week, refreshKey); the ConsistencyWidget and home's
 * next-up logic share it through a small module cache, so two consumers never mean two
 * reads. `refreshKey` = anything that changes when a workout lands (e.g. the weekly cardio
 * session count) — it re-reads then. Disabled → null, no read.
 */
import { useEffect, useState } from 'react';
import { useUserStore } from '@/features/user';
import { getWeeklyRunCount } from '../services/activity-history.service';
import { useDateKey } from './useMidnightRefresh';

const cache = new Map<string, Promise<number | null>>();
const CACHE_CAP = 8;

function readCached(key: string, userId: string): Promise<number | null> {
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size >= CACHE_CAP) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  const p = getWeeklyRunCount(userId).then((n) => {
    if (n === null) cache.delete(key); // don't pin a failed read
    return n;
  });
  cache.set(key, p);
  return p;
}

export function useWeeklyRunCount(enabled: boolean, refreshKey: string | number = 0): number | null {
  const userId = useUserStore((s) => s.profile?.id);
  const dateKey = useDateKey();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled || !userId) {
      setCount(null);
      return;
    }
    let cancelled = false;
    readCached(`${userId}|${dateKey}|${refreshKey}`, userId).then((n) => {
      if (!cancelled) setCount(n);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, userId, dateKey, refreshKey]);

  return count;
}

export default useWeeklyRunCount;
