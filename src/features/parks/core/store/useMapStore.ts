import { create } from 'zustand';
import { MapFacility, FacilityType } from '../types/facility.types';
import { Park } from '../types/park.types';

type LayerType = 'parks' | 'routes' | 'facilities';

interface MapStore {
  selectedFacilityType: FacilityType | null;
  facilities: MapFacility[];
  selectedPark: Park | null;
  visibleLayers: Set<LayerType>;
  setSelectedFacilityType: (type: FacilityType | null) => void;
  setFacilities: (facilities: MapFacility[]) => void;
  setSelectedPark: (park: Park | null) => void;
  toggleLayer: (layer: LayerType) => void;
}

export const useMapStore = create<MapStore>((set) => ({
  selectedFacilityType: null,
  facilities: [],
  selectedPark: null,
  visibleLayers: new Set<LayerType>(['parks', 'routes']),
  setSelectedFacilityType: (type) => set({ selectedFacilityType: type }),
  setFacilities: (facilities) => set({ facilities }),
  setSelectedPark: (park) => set({ selectedPark: park }),
  toggleLayer: (layer) => set((state) => {
    const newLayers = new Set(state.visibleLayers);
    if (newLayers.has(layer)) {
      newLayers.delete(layer);
    } else {
      newLayers.add(layer);
    }
    return { visibleLayers: newLayers };
  }),
}));
