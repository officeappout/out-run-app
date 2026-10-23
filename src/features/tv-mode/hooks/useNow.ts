'use client';

import { useEffect, useState } from 'react';

/** Re-renders every `everyMs` with the current local time (timers, expiry). */
export function useNow(everyMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
