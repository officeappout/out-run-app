'use client';

import { useCallback, useEffect, useState } from 'react';
import { addRecent, readRecents, removeRecent, writeRecents } from '../core/recents';

/** Recent searches for this user, kept in localStorage (per uid). */
export function useSearchRecents(uid: string | null) {
  const [recents, setRecents] = useState<string[]>([]);
  useEffect(() => setRecents(readRecents(uid)), [uid]);
  const update = useCallback((fn: (l: string[]) => string[]) => {
    setRecents((cur) => {
      const next = fn(cur);
      writeRecents(uid, next);
      return next;
    });
  }, [uid]);
  return {
    recents,
    add: useCallback((q: string) => update((l) => addRecent(l, q)), [update]),
    remove: useCallback((q: string) => update((l) => removeRecent(l, q)), [update]),
    clear: useCallback(() => update(() => []), [update]),
  };
}
