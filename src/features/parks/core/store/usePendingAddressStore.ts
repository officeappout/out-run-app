'use client';

import { create } from 'zustand';

/**
 * In-progress address-destination pick (09.08 — David's 2nd-round UX fix).
 * Deliberately a SEPARATE store from useLegPlanStore, not a reuse of it —
 * David explicitly deferred "the unified generator" (address_destination +
 * leg_chaining sharing one flow) as its own future planning round. This
 * store exists only so a picked address survives FreeRunDrawer's remount
 * across the NavigationHub round-trip (mapMode leaves 'freeRun' per the
 * One-Card-Only map law, axioms.md §9) — same cross-remount need
 * useLegPlanStore solves, structurally parallel, intentionally not merged.
 */
interface PendingAddressState {
  /** True while the user is mid-pick — same "who does this address belong
   *  to" role useLegPlanStore.isComposing plays for the leg-plan flow. */
  isComposing: boolean;
  pending: { lat: number; lng: number; label?: string } | null;

  /** No-op if already composing — mirrors useLegPlanStore.startComposing. */
  startComposing: () => void;
  setPending: (p: { lat: number; lng: number; label?: string }) => void;
  clear: () => void;
}

export const usePendingAddressStore = create<PendingAddressState>((set, get) => ({
  isComposing: false,
  pending: null,

  startComposing: () => {
    if (get().isComposing) return;
    set({ isComposing: true });
  },

  setPending: (p) => set({ pending: p }),

  clear: () => set({ isComposing: false, pending: null }),
}));
