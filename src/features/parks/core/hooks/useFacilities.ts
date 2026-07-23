'use client';

import { useEffect, useRef, useState } from 'react';
import { useMapStore, type ViewportBounds } from '../store/useMapStore';
import { InventoryService } from '../services/inventory.service';

// Facilities only render at zoom >= 14 (AppMap facility markers), so below that
// there is nothing to fetch. Fetch a box padded 50% beyond the viewport so small
// pans stay inside the loaded area and don't trigger a refetch.
const FACILITIES_MIN_ZOOM = 14;
const BOUNDS_PAD = 0.5;

type Box = { swLat: number; neLat: number; swLng: number; neLng: number };

function padBox(b: ViewportBounds, pad: number): Box {
    const dLat = (b.neLat - b.swLat) * pad;
    const dLng = (b.neLng - b.swLng) * pad;
    return {
        swLat: b.swLat - dLat, neLat: b.neLat + dLat,
        swLng: b.swLng - dLng, neLng: b.neLng + dLng,
    };
}

// Is the current viewport still inside the box we last fetched for?
function boxContains(outer: Box, v: ViewportBounds): boolean {
    return v.swLat >= outer.swLat && v.neLat <= outer.neLat
        && v.swLng >= outer.swLng && v.neLng <= outer.neLng;
}

/**
 * Loads map facilities for the CURRENT VIEWPORT and refetches as the user pans
 * out of the loaded area — instead of pulling the entire national `facilities`
 * collection into heap on mount (a dense-city OOM driver). The user still sees
 * every facility while exploring; they are just streamed per-area. A superseding
 * pan or an unmount aborts the in-flight fetch's state write (the Firestore
 * getDocs network itself is not cancelable — same limitation as the park fetch).
 */
export function useFacilities(currentZoom: number) {
    const { facilities, setFacilities } = useMapStore();
    const viewportBounds = useMapStore((s) => s.viewportBounds);
    const [loading, setLoading] = useState(false);
    // The padded box the current `facilities` set was fetched for.
    const loadedBoxRef = useRef<Box | null>(null);

    useEffect(() => {
        if (currentZoom < FACILITIES_MIN_ZOOM || !viewportBounds) return;
        // Still inside the last-fetched (padded) box → no refetch.
        if (loadedBoxRef.current && boxContains(loadedBoxRef.current, viewportBounds)) return;

        const controller = new AbortController();
        const box = padBox(viewportBounds, BOUNDS_PAD);
        setLoading(true);
        InventoryService.fetchFacilitiesInBounds(box)
            .then((data) => {
                if (controller.signal.aborted) return; // superseded pan / unmount
                loadedBoxRef.current = box;
                setFacilities(data);
            })
            .catch((err) => {
                if (!controller.signal.aborted) console.error('Failed to load facilities:', err);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });

        return () => controller.abort();
    }, [currentZoom, viewportBounds, setFacilities]);

    return { facilities, loading };
}
