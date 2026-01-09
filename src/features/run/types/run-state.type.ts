export interface GeoPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
  altitude?: number;
  accuracy?: number;
}

export interface Lap {
  id: string;          // מזהה ייחודי לכל הקפה
  lapNumber: number;   // מספר ההקפה (1, 2, 3...)
  distanceMeters: number;
  durationSeconds: number;
  splitPace: number;   // הקצב הממוצע של ההקפה הספציפית הזו
  isActive: boolean;   // האם זו ההקפה שרצה כרגע
}

export interface RunState {
  status: 'idle' | 'countdown' | 'running' | 'paused' | 'finished';
  totalDuration: number;
  totalDistance: number;
  currentPace: number;
  path: GeoPoint[];
  laps: Lap[];
}