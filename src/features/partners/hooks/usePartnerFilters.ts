'use client';

/**
 * Partner Filters Store — persists Partner Finder filter selections.
 *
 * Persisted to localStorage so users return to their previously chosen
 * filter set across sessions. Same `createJSONStorage` pattern as
 * `usePrivacyStore`.
 *
 * Default `liveActivity` is derived once at hydration time from the
 * current `useSessionStore.mode` (no `lastMode` field exists in that
 * store today, so we fall back to the active mode if any, else 'all').
 *
 * State shape (Filter Redesign):
 *   Always-visible rows
 *     - liveActivity        — Row 1 (activity type pills)
 *     - soloGroupFilter     — Row 2 (solo / groups; replaces plannedFilter)
 *   Conditional rows (per liveActivity)
 *     - selectedProgram     — Row 3 strength (templateId of program)
 *     - runDistance         — Row 3 running (target km, single value)
 *     - levelRange          — Row 4 strength (min/max level)
 *     - paceRange           — Row 4 running (min/max sec/km)
 *   Scheduled-tab-only
 *     - plannedTime         — Row 5 pills (today/tomorrow only)
 *     - scheduledTimeMinutes — Row 5 slider (HH*60+MM, null = off)
 *   Long-tail (PartnerFilterSheet)
 *     - genderFilter, ageRange, distanceKm
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';

export type LiveActivityFilter = 'all' | 'strength' | 'running' | 'walking';
export type GenderFilter = 'all' | 'male' | 'female';
export type SoloGroupFilter = 'all' | 'solo' | 'groups';
/**
 * Time-bucket pills on the Scheduled tab. The legacy `'morning' | 'evening'`
 * values were retired with the Filter Redesign — Row 5 now exposes a
 * 06:00–22:00 slider for finer time control.
 */
export type PlannedTimeFilter = 'all' | 'today' | 'tomorrow';

interface PartnerFiltersState {
  liveActivity: LiveActivityFilter;
  genderFilter: GenderFilter;
  soloGroupFilter: SoloGroupFilter;
  plannedTime: PlannedTimeFilter;
  /** Selected strength program templateId for Row 3; null = "all programs". */
  selectedProgram: string | null;
  /** Target run distance km for Row 3 running slider; default 5. */
  runDistance: number;
  /** Min/max pace in seconds-per-km for Row 4 running slider. */
  paceRange: [number, number];
  /** Minutes-from-midnight for Row 5 time slider; null = no time selected. */
  scheduledTimeMinutes: number | null;
  distanceKm: number;
  ageRange: [number, number];
  levelRange: [number, number];

  setLiveActivity: (v: LiveActivityFilter) => void;
  setGenderFilter: (v: GenderFilter) => void;
  setSoloGroupFilter: (v: SoloGroupFilter) => void;
  setPlannedTime: (v: PlannedTimeFilter) => void;
  setSelectedProgram: (v: string | null) => void;
  setRunDistance: (v: number) => void;
  setPaceRange: (v: [number, number]) => void;
  setScheduledTimeMinutes: (v: number | null) => void;
  setDistanceKm: (v: number) => void;
  setAgeRange: (v: [number, number]) => void;
  setLevelRange: (v: [number, number]) => void;
  reset: () => void;
}

function deriveDefaultActivity(): LiveActivityFilter {
  const mode = useSessionStore.getState().mode;
  if (mode === 'strength') return 'strength';
  if (mode === 'running') return 'running';
  if (mode === 'walking') return 'walking';
  return 'all';
}

const DEFAULTS: Omit<
  PartnerFiltersState,
  | 'setLiveActivity'
  | 'setGenderFilter'
  | 'setSoloGroupFilter'
  | 'setPlannedTime'
  | 'setSelectedProgram'
  | 'setRunDistance'
  | 'setPaceRange'
  | 'setScheduledTimeMinutes'
  | 'setDistanceKm'
  | 'setAgeRange'
  | 'setLevelRange'
  | 'reset'
> = {
  liveActivity: 'all',
  genderFilter: 'all',
  soloGroupFilter: 'all',
  plannedTime: 'all',
  selectedProgram: null,
  // 5km is a typical neighborhood-jog target and matches the default
  // `distanceKm` radius — useful as a "starter" running target.
  runDistance: 5,
  // 315–405 sec/km == 5:15–6:45 min/km, which spans the bulk of
  // recreational runners. Smart defaults will narrow this around the
  // user's basePace ±45s on first open.
  paceRange: [315, 405],
  scheduledTimeMinutes: null,
  distanceKm: 5,
  ageRange: [18, 99],
  levelRange: [1, 10],
};

export const usePartnerFilters = create<PartnerFiltersState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      liveActivity: deriveDefaultActivity(),

      setLiveActivity: (v) => set({ liveActivity: v }),
      setGenderFilter: (v) => set({ genderFilter: v }),
      setSoloGroupFilter: (v) => set({ soloGroupFilter: v }),
      setPlannedTime: (v) => set({ plannedTime: v }),
      setSelectedProgram: (v) => set({ selectedProgram: v }),
      setRunDistance: (v) => set({ runDistance: v }),
      setPaceRange: (v) => set({ paceRange: v }),
      setScheduledTimeMinutes: (v) => set({ scheduledTimeMinutes: v }),
      setDistanceKm: (v) => set({ distanceKm: v }),
      setAgeRange: (v) => set({ ageRange: v }),
      setLevelRange: (v) => set({ levelRange: v }),
      reset: () => set({ ...DEFAULTS, liveActivity: deriveDefaultActivity() }),
    }),
    {
      name: 'out-partner-filters',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
