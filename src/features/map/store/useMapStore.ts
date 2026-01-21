import { create } from 'zustand';
import { MapFacility, FacilityType } from '../types/map-objects.type';

type MapPark = any;
type MuscleGroup = string;

interface MapState {
  // 1. הפארק שנבחר כרגע
  selectedPark: MapPark | null;
  setSelectedPark: (park: MapPark | null) => void;

  // --- הוספנו את זה: מיקום המשתמש ---
  userLocation: { lat: number; lng: number } | null;
  setUserLocation: (loc: { lat: number; lng: number } | null) => void;
  // ----------------------------------

  // מתקנים (Facilities)
  facilities: MapFacility[];
  setFacilities: (facilities: MapFacility[]) => void;
  addFacilities: (facilities: MapFacility[]) => void;

  // שכבות נראות (Visible Layers)
  visibleLayers: string[];
  toggleLayer: (layerId: string) => void;

  // טריגר למירכוז
  triggerCenter: number;
  triggerUserLocation: () => void;

  // האם אנחנו עוקבים אחרי המשתמש?
  isFollowing: boolean;
  setIsFollowing: (isFollowing: boolean) => void;

  // 2. סינון לפי קבוצת שרירים
  muscleFilter: MuscleGroup | 'all';
  setMuscleFilter: (filter: MuscleGroup | 'all') => void;

  // 3. חיפוש טקסטואלי
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // 4. מצב התצוגה של המפה
  isShowingRoute: boolean;
  setIsShowingRoute: (val: boolean) => void;

  // 5. ניקוי
  resetMapState: () => void;
}

export const useMapStore = create<MapState>((set) => ({
  // ערכים התחלתיים
  selectedPark: null,
  userLocation: null,
  facilities: [],
  visibleLayers: ['routes', 'water', 'toilet', 'gym', 'parking'],
  muscleFilter: 'all',
  searchQuery: '',
  isShowingRoute: false,
  isFollowing: true,
  triggerCenter: 0,

  // פעולות (Actions)
  setSelectedPark: (park) => set({ selectedPark: park }),
  setUserLocation: (loc) => set({ userLocation: loc }),

  setFacilities: (facilities) => set({ facilities }),
  addFacilities: (newFacilities) => set((state) => ({
    facilities: [...state.facilities, ...newFacilities]
  })),

  toggleLayer: (layerId) => set((state) => ({
    visibleLayers: state.visibleLayers.includes(layerId)
      ? state.visibleLayers.filter(l => l !== layerId)
      : [...state.visibleLayers, layerId]
  })),

  triggerUserLocation: () => set({ triggerCenter: Date.now(), isFollowing: true }),
  setIsFollowing: (isFollowing) => set({ isFollowing }),
  setMuscleFilter: (filter) => set({ muscleFilter: filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setIsShowingRoute: (val) => set({ isShowingRoute: val }),

  resetMapState: () => set({
    selectedPark: null,
    muscleFilter: 'all',
    searchQuery: '',
    isShowingRoute: false,
    isFollowing: true,
    userLocation: null,
    facilities: []
  }),
}));