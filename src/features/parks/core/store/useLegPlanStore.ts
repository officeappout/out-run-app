'use client';

import { create } from 'zustand';
import type { ActivityType } from '../types/route.types';
import type { RouteLeg } from '../services/leg-plan.service';

/**
 * In-progress leg-plan composition state (capability ג', Phase 1 — 08.08).
 * Lives in Zustand — NOT FreeRunDrawer local state — specifically because
 * composing a plan needs multiple round-trips through NavigationHub, and
 * FreeRunDrawer fully UNMOUNTS on every "add stop" pick (`mapMode` leaves
 * 'freeRun' per the One-Card-Only map law, axioms.md §9), so any local
 * React state would be lost between picks. Mirrors the existing
 * useMapStore `pendingCommute` pattern (single-slot cross-remount request),
 * just for an ordered, multi-step composition instead of a one-shot value.
 *
 * See src/features/parks/core/services/leg-plan.service.ts (the compiler
 * this plan eventually feeds) and the scoping doc's Phase-1 section for
 * the full design rationale.
 */
interface LegPlanStoreState {
  /**
   * True while the user is actively composing a plan. Read by
   * DiscoverLayer's handleAddressSelect (route an address pick back here
   * instead of starting a commute) and by FreeRunDrawer's lazy initial
   * state (auto-reopen LegPlanSheet after an add-stop round-trip).
   */
  isComposing: boolean;
  origin: { lat: number; lng: number } | null;
  activity: ActivityType;
  legs: RouteLeg[];

  /** No-op if already composing — preserves the in-progress list rather than restarting it. */
  startComposing: (origin: { lat: number; lng: number }, activity: ActivityType) => void;
  addLeg: (destination: { lat: number; lng: number }, label?: string) => void;
  removeLeg: (id: string) => void;
  /** `orderedIds` is the full leg id list in its new order (framer-motion Reorder.Group's onReorder gives values in the new order). */
  reorderLegs: (orderedIds: string[]) => void;
  reset: () => void;
}

let legIdCounter = 0;
const nextLegId = () => `leg-${Date.now()}-${legIdCounter++}`;

export const useLegPlanStore = create<LegPlanStoreState>((set, get) => ({
  isComposing: false,
  origin: null,
  activity: 'running',
  legs: [],

  startComposing: (origin, activity) => {
    if (get().isComposing) return;
    set({ isComposing: true, origin, activity, legs: [] });
  },

  addLeg: (destination, label) => {
    set((s) => ({
      legs: [...s.legs, { kind: 'to_point', id: nextLegId(), label, destination }],
    }));
  },

  removeLeg: (id) => {
    set((s) => ({ legs: s.legs.filter((l) => l.id !== id) }));
  },

  reorderLegs: (orderedIds) => {
    set((s) => {
      const byId = new Map(s.legs.map((l) => [l.id, l]));
      const reordered = orderedIds.map((id) => byId.get(id)).filter((l): l is RouteLeg => !!l);
      // Defensive — if the id lists ever desync, don't silently drop legs.
      return reordered.length === s.legs.length ? { legs: reordered } : {};
    });
  },

  reset: () => set({ isComposing: false, origin: null, legs: [] }),
}));
