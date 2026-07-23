'use client';

import { useEffect, useRef, useState } from 'react';
import { useMapStore } from '../store/useMapStore';
import { InventoryService } from '../services/inventory.service';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

export function useFacilities() {
    const { facilities, setFacilities } = useMapStore();
    // Scope the facility fetch to the user's authority (city). With no scope the
    // service returns the ENTIRE national facilities collection, which in a
    // dense city mounts thousands of un-culled DOM markers and drives the
    // WKWebView OOM. `undefined` (no authority — super-admin / not-yet-onboarded)
    // falls back to the unscoped fetch, preserving prior behaviour for that case.
    const authorityId = useUserStore((s) => s.profile?.core?.authorityId);
    // Gate the fetch on store hydration: on a cold boot (incl. the post-OOM
    // reload) we must read the REAL authorityId before fetching. Fetching while
    // the profile is still null would pull the national set and, once cached,
    // never re-scope — re-arming the exact OOM this change removes.
    const hasHydrated = useUserStore((s) => s._hasHydrated);
    const [loading, setLoading] = useState(false);
    // Which authority the current `facilities` were loaded for. A late profile
    // hydration (authority resolving AFTER first mount) flips this and re-scopes
    // instead of leaving the wrong set pinned.
    const loadedFor = useRef<string | null>(null);
    const hasLoaded = useRef(false);

    useEffect(() => {
        if (!hasHydrated) return;
        const scope = authorityId ?? null;
        if (hasLoaded.current && loadedFor.current === scope) return; // already loaded for this scope

        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const data = await InventoryService.fetchFacilities(authorityId ?? undefined);
                if (cancelled) return;
                setFacilities(data);
                loadedFor.current = scope;
                hasLoaded.current = true;
            } catch (err) {
                console.error('Failed to load facilities:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => { cancelled = true; };
    }, [hasHydrated, authorityId, setFacilities]);

    return { facilities, loading };
}
