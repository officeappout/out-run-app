'use client';

/**
 * The hub's view state ⇄ the URL query (CITY-MAPPING-HUB-DESIGN.md §3.1).
 * `router.replace` (not push) for typing / filter changes, so Back does not
 * step through every keystroke; selecting an authority pushes, so Back
 * returns to the previous one. scroll: false keeps the page where it is.
 */
import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { parseHubUrlState, serializeHubUrlState, type HubUrlState } from '@/lib/city-mapping-hub/url-state';

export function useHubUrlState(): [HubUrlState, (next: HubUrlState) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const state = useMemo(() => parseHubUrlState(sp ?? new URLSearchParams()), [sp]);
  const setState = useCallback((next: HubUrlState) => {
    const qs = serializeHubUrlState(next);
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (next.authority !== state.authority) router.push(url, { scroll: false });
    else router.replace(url, { scroll: false });
  }, [router, pathname, state.authority]);
  return [state, setState];
}
