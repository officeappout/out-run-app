'use client';

/**
 * Saved Places store — local-first Home / Work shortcuts for the
 * commute flow. Persisted to localStorage via the same `persist +
 * createJSONStorage` recipe `usePartnerFilters` and `usePrivacyStore`
 * use, with `skipHydration` on the SSR boundary so we never read
 * `window.localStorage` during Next.js prerender.
 *
 * Design notes:
 *
 *   • Values are stored as the Mapbox-native `[lng, lat]` tuple — same
 *     order the SearchSuggestion type uses, the FloatingSearchBar /
 *     SavedPlacesQuickRow consume, and `useMapStore.commuteDestination`
 *     will hold. Keeping one ordering convention end-to-end avoids the
 *     classic lat/lng swap bug.
 *
 *   • `kind` is the discriminator AND the storage key so the store
 *     stays cheap (one slot per kind, no list management). Adding a
 *     third kind later (e.g. 'school') just means widening the union;
 *     no schema migration needed.
 *
 *   • Server-side persistence is a deliberate non-goal for v1 —
 *     localStorage round-trips in <1 ms and survives soft-refresh,
 *     which is everything a commute shortcut needs. Cross-device sync
 *     can graduate to Firestore later without changing this contract.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type SavedPlaceKind = 'home' | 'work';

export interface SavedPlace {
  kind: SavedPlaceKind;
  /** Short user-facing label (defaults to the kind's Hebrew name). */
  label: string;
  /** Mapbox-native `[lng, lat]` tuple. */
  coords: [number, number];
  /** Human-readable address from the geocoder, when available. */
  address?: string;
  /** Epoch ms — useful later for "recently set" sort orders / migration. */
  updatedAt: number;
}

interface SavedPlacesState {
  places: Record<SavedPlaceKind, SavedPlace | null>;
  setPlace: (place: SavedPlace) => void;
  clearPlace: (kind: SavedPlaceKind) => void;
  getPlace: (kind: SavedPlaceKind) => SavedPlace | null;
}

const EMPTY_PLACES: Record<SavedPlaceKind, SavedPlace | null> = {
  home: null,
  work: null,
};

export const useSavedPlacesStore = create<SavedPlacesState>()(
  persist(
    (set, get) => ({
      places: EMPTY_PLACES,

      setPlace: (place) =>
        set((state) => ({
          places: { ...state.places, [place.kind]: { ...place, updatedAt: Date.now() } },
        })),

      clearPlace: (kind) =>
        set((state) => ({
          places: { ...state.places, [kind]: null },
        })),

      getPlace: (kind) => get().places[kind],
    }),
    {
      name: 'out-saved-places',
      storage: createJSONStorage(() => localStorage),
      // Skip hydration during SSR so Next.js prerender never touches
      // `localStorage`. Components reading the store should render an
      // empty-state on first paint and let the client-side hydration
      // fill it in — same pattern as useUserStore / useAppStore.
      skipHydration: typeof window === 'undefined',
    },
  ),
);

/**
 * Hebrew label for a kind — single source of truth so the QuickRow,
 * SetSavedPlaceSheet, and any analytics events stay in lockstep.
 */
export const SAVED_PLACE_KIND_LABEL: Record<SavedPlaceKind, string> = {
  home: 'בית',
  work: 'עבודה',
};
