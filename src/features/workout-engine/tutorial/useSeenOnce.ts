'use client';
/** A seen-once tutorial flag in onboardingPrefs: `show` while armed and not yet seen. */
import { useCallback, useEffect, useState } from 'react';
import { getOnboardingPrefAsync, setOnboardingPref } from '@/lib/onboardingPrefs';

export function useSeenOnce(key: string, armed: boolean): { show: boolean; finish: (reason: string) => void } {
  const [seen, setSeen] = useState<boolean | null>(null);
  useEffect(() => {
    if (!armed || seen !== null) return;
    let live = true;
    void getOnboardingPrefAsync(key).then((v) => { if (live) setSeen(!!v); });
    return () => { live = false; };
  }, [key, armed, seen]);
  const finish = useCallback((reason: string) => {
    setSeen(true);
    setOnboardingPref(key, reason);
  }, [key]);
  return { show: armed && seen === false, finish };
}
