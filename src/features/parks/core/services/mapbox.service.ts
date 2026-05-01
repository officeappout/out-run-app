// src/features/map/services/mapbox.service.ts

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
const BASE_URL = 'https://api.mapbox.com/directions/v5/mapbox';

// פונקציית עזר: ממירה כל פורמט של נקודה לפורמט ש-Mapbox אוהב: [lng, lat]
const toCoord = (input: any): [number, number] | null => {
  if (!input) return null;

  if (Array.isArray(input) && input.length >= 2) {
    const lng = input[0], lat = input[1];
    if (typeof lng === 'number' && !isNaN(lng) && typeof lat === 'number' && !isNaN(lat)) return [lng, lat];
    return null;
  }

  if (typeof input === 'object') {
    const lng = input.lng ?? input._lng;
    const lat = input.lat ?? input._lat;
    if (typeof lng === 'number' && !isNaN(lng) && typeof lat === 'number' && !isNaN(lat)) return [lng, lat];
  }

  return null;
};

// הפונקציה הראשית לחישוב מסלול חכם (ללא תלות ב-SDK)
const getSmartPath = async (
  start: any,
  end: any,
  profile: 'walking' | 'cycling' | 'driving' = 'walking',
  waypoints: any[] = []
) => {

  try {
    // 1. נירמול הקואורדינטות
    const startCoord = toCoord(start);
    const endCoord = toCoord(end);

    if (!startCoord || !endCoord) {
      console.warn('[MapboxService] Missing start or end coordinates');
      return null;
    }

    // 2. הכנת רשימת הנקודות למחרוזת
    // הפורמט ש-Mapbox דורש ב-URL הוא: start;wp1;wp2;end
    const cleanWaypoints = waypoints
      .map(wp => toCoord(wp))
      .filter((wp): wp is [number, number] => wp !== null);

    const allPoints = [startCoord, ...cleanWaypoints, endCoord];

    console.log(`[MapboxService] Fetching path for ${allPoints.length} points...`);

    // יצירת המחרוזת: "lng,lat;lng,lat;lng,lat"
    const coordinatesString = allPoints
      .map(p => `${p[0]},${p[1]}`)
      .join(';');

    // 3. בניית ה-URL הישיר (הכי אמין שיש)
    // geometries=geojson: זה הקסם שהופך משולש למסלול מפותל
    const url = `${BASE_URL}/${profile}/${coordinatesString}?alternatives=true&geometries=geojson&steps=true&overview=full&access_token=${MAPBOX_TOKEN}`;

    // 4. שליחת הבקשה
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error('[MapboxService] API Error:', data.message);
      return null;
    }

    if (!data.routes || data.routes.length === 0) {
      console.warn('[MapboxService] No route found.');
      return null;
    }

    // 5. החזרת המסלול הטוב ביותר
    const route = data.routes[0];
    console.log(`[MapboxService] ✅ Route Found! Duration: ${Math.round(route.duration / 60)}min, Distance: ${Math.round(route.distance)}m`);

    // Flatten step list across all legs so callers (e.g. useWalkToRoute)
    // can render a turn-by-turn timeline without re-walking the leg
    // structure. We pass through the raw Mapbox shape so each consumer
    // is free to compose its own instruction string from `maneuver.type`,
    // `maneuver.modifier`, and `name` (street).
    const steps = Array.isArray(route.legs)
      ? route.legs.flatMap((leg: any) => Array.isArray(leg?.steps) ? leg.steps : [])
      : [];

    return {
      path: route.geometry.coordinates as [number, number][], // המערך של קווי המתאר (הרחובות)
      distance: route.distance,
      duration: route.duration,
      steps,
    };

  } catch (error: any) {
    console.error("❌ Critical Error in Mapbox Service:", error.message);
    return null;
  }
};

// פונקציה לחיפוש כתובות (Geocoding)
const searchAddress = async (query: string): Promise<Array<{ text: string; coords: [number, number] }>> => {
  if (!query || query.length < 3) return [];

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&language=he&country=il&limit=5`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.features) {
      return data.features.map((f: any) => ({
        text: f.place_name,
        coords: f.center as [number, number] // [lng, lat]
      }));
    }
    return [];
  } catch (error) {
    console.error("❌ Geocoding Error:", error);
    return [];
  }
};

// 👇 Export אחיד - שומר על תאימות לקוד הישן שלך
export const MapboxService = {
  getSmartPath,
  getDirections: getSmartPath, // Alias לתאימות לאחור
  searchAddress
};