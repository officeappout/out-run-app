import { create } from 'zustand';
import { Route } from '@/features/map/types/map-objects.type'; // הייבוא של הטיפוס החדש

// --- נתוני דמה ראשוניים בפורמט החדש (Route) ---
// זה מבטיח שהחנות תאותחל עם מידע שמתאים לכרטיסים ולמגירה החדשה
const INITIAL_ROUTES: Route[] = [];

export interface Lap {
  number: number;
  distanceMeters: number;
  duration: number;
  splitPace: number;
  isActive: boolean;
}

interface RunState {
  // סטטוסים
  status: 'idle' | 'running' | 'paused' | 'finished';
  runMode: 'free' | 'plan' | 'my_routes';
  activityType: 'running' | 'walking';

  // נתונים שוטפים
  startTime: number | null;
  totalDuration: number;
  totalDistance: number;
  currentPace: number;

  // נתונים גיאוגרפיים ומסלולים
  laps: Lap[];
  view: 'main' | 'laps';
  routeCoords: number[][]; // הקו שנצבר בפועל
  lastViewport: { latitude: number; longitude: number; zoom: number };

  suggestedRoutes: Route[]; // <--- שינוי לטיפוס החדש
  activeRoutePath: number[][]; // הקו המתוכנן (כחול)

  // פעולות (Setters)
  setRunMode: (mode: 'free' | 'plan' | 'my_routes') => void;
  setActivityType: (type: 'running' | 'walking') => void;
  setSuggestedRoutes: (routes: Route[]) => void; // <--- שינוי לטיפוס החדש
  setActiveRoutePath: (path: number[][]) => void;

  // לוגיקה עסקית (נשאר ללא שינוי)
  calculatePace: (dist: number, dur: number) => number;
  startRun: () => void;
  pauseRun: () => void;
  resumeRun: () => void;
  stopRun: () => void;
  triggerLap: () => void;
  updateRunData: (distanceDelta: number) => void;
  updateDuration: () => void;
  setView: (view: 'main' | 'laps') => void;
  addCoord: (coord: number[]) => void;
  setLastViewport: (vp: any) => void;
  injectMockData: () => void;
  clearCurrentWorkout: () => void;
}

export const useRunStore = create<RunState>((set, get) => ({
  // ערכים התחלתיים
  status: 'idle',
  runMode: 'plan',
  activityType: 'running',
  startTime: null,
  totalDuration: 0,
  totalDistance: 0.00,
  currentPace: 0,
  view: 'main',
  laps: [{ number: 1, distanceMeters: 0, duration: 0, splitPace: 0, isActive: true }],
  routeCoords: [],

  // אתחול עם הנתונים החדשים
  suggestedRoutes: INITIAL_ROUTES,
  activeRoutePath: [],

  lastViewport: { latitude: 32.0853, longitude: 34.7818, zoom: 15 },

  // מימושים (Setters)
  setRunMode: (mode) => set({ runMode: mode }),
  setActivityType: (type) => set({ activityType: type }),
  setView: (view) => set({ view }),
  setLastViewport: (vp) => set({ lastViewport: vp }),
  setSuggestedRoutes: (routes) => set({ suggestedRoutes: routes }),
  setActiveRoutePath: (path) => set({ activeRoutePath: path }),

  // לוגיקת ריצה
  startRun: () => set({ status: 'running', startTime: Date.now() }),
  pauseRun: () => set({ status: 'paused' }),
  resumeRun: () => set({ status: 'running' }),
  stopRun: () => set({ status: 'finished' }),

  calculatePace: (dist: number, dur: number) => {
    if (dist <= 0 || dur <= 0) return 0;
    return (dur / 60) / dist;
  },

  addCoord: (coord) => set((state) => ({ routeCoords: [...state.routeCoords, coord] })),

  triggerLap: () => {
    const { laps } = get();
    const updatedLaps = laps.map(lap => ({ ...lap, isActive: false }));
    updatedLaps.push({ number: laps.length + 1, distanceMeters: 0, duration: 0, splitPace: 0, isActive: true });
    set({ laps: updatedLaps });
  },

  updateRunData: (distanceDelta: number) => {
    const { status, totalDistance, totalDuration, laps, calculatePace } = get();
    if (status !== 'running') return;
    const newDist = totalDistance + distanceDelta;
    const newPace = calculatePace(newDist, totalDuration);
    set({
      totalDistance: newDist,
      currentPace: newPace,
      laps: laps.map(lap => lap.isActive ? {
        ...lap,
        distanceMeters: lap.distanceMeters + (distanceDelta * 1000),
        splitPace: calculatePace((lap.distanceMeters / 1000) + distanceDelta, lap.duration)
      } : lap)
    });
  },

  updateDuration: () => {
    const { status, totalDuration, totalDistance, laps, calculatePace } = get();
    if (status !== 'running') return;
    const nextDuration = totalDuration + 1;
    const nextPace = nextDuration % 3 === 0 ? calculatePace(totalDistance, nextDuration) : get().currentPace;
    set({
      totalDuration: nextDuration,
      currentPace: nextPace,
      laps: laps.map(lap => lap.isActive ? {
        ...lap,
        duration: lap.duration + 1,
        splitPace: nextDuration % 3 === 0 ? calculatePace(lap.distanceMeters / 1000, lap.duration + 1) : lap.splitPace
      } : lap)
    });
  },

  injectMockData: () => set({
    status: 'finished',
    totalDistance: 4.01,
    totalDuration: 1201,
    currentPace: 5.05,
    routeCoords: [[34.7818, 32.0853], [34.7825, 32.0858], [34.7835, 32.0865], [34.7845, 32.0875], [34.7818, 32.0853]],
    laps: [{ number: 1, distanceMeters: 1000, duration: 301, splitPace: 5.01, isActive: false }]
  }),

  clearCurrentWorkout: () => set({
    status: 'idle',
    startTime: null,
    totalDuration: 0,
    totalDistance: 0,
    currentPace: 0,
    routeCoords: [],
    laps: [{ number: 1, distanceMeters: 0, duration: 0, splitPace: 0, isActive: true }]
  })
}));