import { create } from 'zustand';
import { MapFacility, FacilityType } from '../types/facility.types';
import { Park } from '../types/park.types';

export type LayerType = 'parks' | 'routes' | 'facilities';

interface MapStore {
  selectedFacilityType: FacilityType | null;
  facilities: MapFacility[];
  selectedPark: Park | null;
  visibleLayers: LayerType[];
  setSelectedFacilityType: (type: FacilityType | null) => void;
  setFacilities: (facilities: MapFacility[]) => void;
  setSelectedPark: (park: Park | null) => void;
  toggleLayer: (layer: LayerType) => void;
}

export const useMapStore = create<MapStore>((set) => ({
  selectedFacilityType: null,
  facilities: [],
  selectedPark: null,
  visibleLayers: ['parks', 'routes'],
  setSelectedFacilityType: (type) => set({ selectedFacilityType: type }),
  setFacilities: (facilities) => set({ facilities }),
  setSelectedPark: (park) => set({ selectedPark: park }),
  toggleLayer: (layer) => set((state) => {
    if (state.visibleLayers.includes(layer)) {
      return { visibleLayers: state.visibleLayers.filter((l) => l !== layer) };
    }
    return { visibleLayers: [...state.visibleLayers, layer] };
  }),
}));
