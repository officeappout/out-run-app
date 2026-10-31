'use client';
/** enable_home_after_v1: true while the done slides lead (isDoneFirst), flips to false when the window ends. */
import { useEffect, useState } from 'react';
import { DONE_FIRST_MS, isDoneFirst } from '../utils/home-after';

export function useDoneFirst(completedAtIso: string | null | undefined): boolean {
  const [now, setNow] = useState(() => Date.now());
  const first = isDoneFirst(completedAtIso, now);
  useEffect(() => {
    if (!first || !completedAtIso) return;
    const left = new Date(completedAtIso).getTime() + DONE_FIRST_MS - Date.now();
    const id = setTimeout(() => setNow(Date.now()), Math.max(0, left) + 50);
    return () => clearTimeout(id);
  }, [first, completedAtIso]);
  return first;
}
