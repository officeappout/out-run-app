// הטוקן הקשיח לביטחון (כדי למנוע שגיאות 401)
const MAPBOX_TOKEN = "pk.eyJ1IjoiZGF2aWQtb3V0IiwiYSI6ImNtanZpZmJ0djM5MTEzZXF5YXNmcm9zNGwifQ.8MD8s4TZOr0WYYgEpFfpzw";

// הגדרת טיפוסים פנימיים למניעת שגיאות
interface Coordinates { lat: number; lng: number }
interface Segment { start: Coordinates; end: Coordinates }

interface RouteResult {
  coordinates: number[][]; // הקו לציור על המפה
  distance: number;        // מטרים
  duration: number;        // שניות
}

export const RouteService = {
  // הפונקציה החדשה: getSmartRoute
  // מקבלת גם פרמטר אופציונלי segment
  getSmartRoute: async (
    userLoc: Coordinates, 
    targetLoc: Coordinates,
    segment?: Segment 
  ): Promise<RouteResult | null> => {
    try {
      // המיקום של המשתמש (הבית)
      const userStr = `${userLoc.lng},${userLoc.lat}`;
      let url = '';

      if (segment) {
        // --- לוגיקה 1: מסלול חכם (פארק קווי) ---
        // המסלול: הבית -> תחילת המקטע -> סוף המקטע -> הבית
        // זה מבטיח שהמשתמש ירוץ את כל הפארק ולא רק יגיע אליו
        const segStart = `${segment.start.lng},${segment.start.lat}`;
        const segEnd = `${segment.end.lng},${segment.end.lat}`;
        
        url = `https://api.mapbox.com/directions/v5/mapbox/walking/${userStr};${segStart};${segEnd};${userStr}?steps=true&geometries=geojson&access_token=${MAPBOX_TOKEN}`;
      } else {
        // --- לוגיקה 2: מסלול רגיל (פארק נקודתי) ---
        // המסלול: הבית -> נקודת הפארק -> הבית
        const targetStr = `${targetLoc.lng},${targetLoc.lat}`;
        url = `https://api.mapbox.com/directions/v5/mapbox/walking/${userStr};${targetStr};${userStr}?steps=true&geometries=geojson&access_token=${MAPBOX_TOKEN}`;
      }

      const res = await fetch(url);
      
      if (!res.ok) {
        console.error("Mapbox Error:", res.status);
        return null;
      }
      
      const data = await res.json();

      if (!data.routes || !data.routes[0]) return null;

      const route = data.routes[0];

      return {
        coordinates: route.geometry.coordinates,
        distance: route.distance,
        duration: route.duration
      };

    } catch (err) {
      console.error("Failed to fetch route:", err);
      return null;
    }
  }
};