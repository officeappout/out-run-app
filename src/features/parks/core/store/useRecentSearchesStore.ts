'use client';

/**
 * useRecentSearchesStore — local history of the last places the user
 * searched & picked. Replaces the hard-coded "recent searches" stub
 * inside NavigationHub with a real, persisted list that survives page
 * reloads and feels like a "Maps app you've used before".
 *
 * Storage contract (mirrors useSavedPlacesStore):
 *   • `out-recent-searches` localStorage key.
 *   • SSR-safe via `skipHydration: typeof window === 'undefined'`.
 *   • Capped at MAX_ENTRIES so the list stays fresh and never balloons.
 *
 * Coordinate ordering: every entry stores `coords: [lng, lat]` —
 * SAME order as Mapbox / SearchSuggestion / SavedPlace, so the value
 * can be replayed straight back through `onAddressSelect` with
 * `_source: 'recent'` and the existing commute branch picks it up
 * without any conversion. The downstream branch in DiscoverLayer
 * treats anything that isn't 'park' / 'route' as a commute trigger,
 * so 'recent' funnels into the same A-to-B pipeline.
 *
 * De-dup rule: two entries collide if their text matches (case-
 * insensitive trimmed). The newer one wins and bubbles to the top —
 * we don't keep stale duplicates with old timestamps.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const MAX_ENTRIES = 8;

export interface RecentSearch {
  /** Display label, e.g. "תל אביב, רחוב הרצל 14" or "פארק הירקון". */
  text: string;
  /** Mapbox-native [lng, lat] tuple — replayable directly. */
  coords: [number, number];
  /**
   * Original suggestion source so we can re-render the icon (park /
   * route / mapbox) consistently with the live suggestion list.
   */
  source: 'park' | 'route' | 'mapbox';
  /** Last-picked timestamp (ms). Drives ordering. */
  pickedAt: number;
}

interface RecentSearchesState {
  recents: RecentSearch[];
  /**
   * Push a new pick to the top of the list. De-dups by case-insensitive
   * trimmed text and trims to MAX_ENTRIES. Safe to call on every
   * suggestion tap — it's a no-op when the result is the same as the
   * head entry.
   */
  pushRecent: (entry: Omit<RecentSearch, 'pickedAt'>) => void;
  /** Remove a single entry (by exact text match). */
  removeRecent: (text: string) => void;
  /** Wipe the whole list — used by the "clear" affordance. */
  clearRecents: () => void;
}

export const useRecentSearchesStore = create<RecentSearchesState>()(
  persist(
    (set) => ({
      recents: [],
      pushRecent: (entry) =>
        set((state) => {
          const normalised = entry.text.trim();
          if (!normalised) return state;
          const next: RecentSearch = {
            text: normalised,
            coords: entry.coords,
            source: entry.source,
            pickedAt: Date.now(),
          };
          const filtered = state.recents.filter(
            (r) => r.text.toLowerCase() !== normalised.toLowerCase(),
          );
          return { recents: [next, ...filtered].slice(0, MAX_ENTRIES) };
        }),
      removeRecent: (text) =>
        set((state) => ({
          recents: state.recents.filter(
            (r) => r.text.toLowerCase() !== text.trim().toLowerCase(),
          ),
        })),
      clearRecents: () => set({ recents: [] }),
    }),
    {
      name: 'out-recent-searches',
      storage: createJSONStorage(() => localStorage),
      skipHydration: typeof window === 'undefined',
    },
  ),
);
