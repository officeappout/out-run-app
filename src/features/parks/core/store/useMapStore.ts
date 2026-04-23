import { create } from 'zustand';
import { MapFacility, FacilityType } from '../types/facility.types';
import { Park } from '../types/park.types';
import type { Route } from '../types/route.types';

export type LayerType = 'parks' | 'routes' | 'water' | 'toilet' | 'gym';

export interface MapDeepLinkIntent {
  type: 'park' | 'route';
  targetId: string;
  sessionId?: string;
  source: 'home_workout' | 'notification' | 'share_link' | 'partners_drawer';
}

/** Global sheet overlay — renderable on any screen without navigating to /map */
export type GlobalSheetState =
  | { type: 'park'; park: Park }
  | { type: 'route'; route: Route }
  | null;

interface MapStore {
  selectedFacilityType: FacilityType | null;
  facilities: MapFacility[];
  selectedPark: Park | null;
  visibleLayers: LayerType[];
  pendingDeepLink: MapDeepLinkIntent | null;
  /** Global detail sheet overlay (works on any page) */
  globalSheet: GlobalSheetState;
  setSelectedFacilityType: (type: FacilityType | null) => void;
  setFacilities: (facilities: MapFacility[]) => void;
  setSelectedPark: (park: Park | null) => void;
  toggleLayer: (layer: LayerType) => void;
  setDeepLink: (intent: MapDeepLinkIntent) => void;
  consumeDeepLink: () => MapDeepLinkIntent | null;
  openGlobalParkSheet: (park: Park) => void;
  openGlobalRouteSheet: (route: Route) => void;
  closeGlobalSheet: () => void;
}

export const useMapStore = create<MapStore>((set, get) => ({
  selectedFacilityType: null,
  facilities: [],
  selectedPark: null,
  visibleLayers: ['parks', 'routes', 'gym'],
  pendingDeepLink: null,
  globalSheet: null,
  setSelectedFacilityType: (type) => set({ selectedFacilityType: type }),
  setFacilities: (facilities) => set({ facilities }),
  setSelectedPark: (park) => set({ selectedPark: park }),
  toggleLayer: (layer) => set((state) => {
    if (state.visibleLayers.includes(layer)) {
      return { visibleLayers: state.visibleLayers.filter((l) => l !== layer) };
    }
    return { visibleLayers: [...state.visibleLayers, layer] };
  }),
  setDeepLink: (intent) => set({ pendingDeepLink: intent }),
  consumeDeepLink: () => {
    const current = get().pendingDeepLink;
    if (current) set({ pendingDeepLink: null });
    return current;
  },
  openGlobalParkSheet: (park) => set({ globalSheet: { type: 'park', park }, selectedPark: park }),
  openGlobalRouteSheet: (route) => set({ globalSheet: { type: 'route', route } }),
  closeGlobalSheet: () => set({ globalSheet: null }),
}));
