// src/features/map/services/mapbox.service.ts
import { placeTypeFromV5, placeTypeFromV6, type GeoPlaceType } from './geocode-place-type';

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

/**
 * Single-route shape returned by `getSmartPath` (and one element of the
 * array returned by `getSmartPathAlternatives`). Mirrors the legacy
 * implicit shape so existing callers compile unchanged.
 */
export interface MapboxPathResult {
  path: [number, number][];
  distance: number;   // meters
  duration: number;   // seconds
  steps: any[];
  /**
   * Per-leg distance/duration breakdown for a multi-waypoint request —
   * Mapbox already computes this on every response (`route.legs[]`), one
   * entry per (start,wp1,wp2,...,end) segment, but it was silently
   * discarded here for every caller until 08.08 (confirmed during the
   * leg_chaining research: this is a free win, not an extra API cost).
   * Empty array for a plain 2-point request (still one leg — Mapbox
   * always returns at least one). Added purely-additively: no existing
   * caller reads this field, so nothing changes for loop mode or commute
   * mode — it exists for leg-plan.service.ts's compileLegPlan(), which
   * needs each leg's own distance/duration for its legBreakdown.
   */
  legs?: Array<{ distance: number; duration: number }>;
}

/**
 * Optional Mapbox Directions params we want to expose to specific callers
 * (commute "Quiet" variant uses `exclude=motorway`, etc.) without
 * polluting the legacy `getSmartPath` signature. Any key/value listed
 * here is appended to the request URL as-is — keep keys narrow and
 * Mapbox-spec-compliant. See:
 *   https://docs.mapbox.com/api/navigation/directions/#retrieve-directions
 */
export type MapboxDirectionsExtraParams = {
  /** Comma-separated list of road classes to avoid (e.g. 'motorway' or 'motorway,toll'). */
  exclude?: string;
  /** Override the default `alternatives=true` (rarely useful — we send true by default). */
  alternatives?: 'true' | 'false';
  /** Any other Mapbox-recognised query param. */
  [key: string]: string | undefined;
};

// הפונקציה הראשית לחישוב מסלול חכם (ללא תלות ב-SDK)
const getSmartPath = async (
  start: any,
  end: any,
  profile: 'walking' | 'cycling' | 'driving' = 'walking',
  waypoints: any[] = [],
  extraParams: MapboxDirectionsExtraParams = {},
  opts?: { signal?: AbortSignal },
): Promise<MapboxPathResult | null> => {

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
    // Defaults below match the legacy behaviour exactly; `extraParams`
    // can override any of them (e.g. add `exclude=motorway`) without
    // changing existing callers.
    const baseQuery = new URLSearchParams({
      alternatives: 'true',
      geometries: 'geojson',
      steps: 'true',
      overview: 'full',
    });
    for (const [k, v] of Object.entries(extraParams)) {
      if (v !== undefined) baseQuery.set(k, v);
    }
    baseQuery.set('access_token', MAPBOX_TOKEN);
    const url = `${BASE_URL}/${profile}/${coordinatesString}?${baseQuery.toString()}`;

    // 4. שליחת הבקשה
    const response = await fetch(url, { signal: opts?.signal });
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
    const legs = Array.isArray(route.legs)
      ? route.legs.map((leg: any) => ({ distance: leg.distance, duration: leg.duration }))
      : [];

    return {
      path: route.geometry.coordinates as [number, number][], // המערך של קווי המתאר (הרחובות)
      distance: route.distance,
      duration: route.duration,
      steps,
      legs,
    };

  } catch (error: any) {
    // A superseded call (governed via withCancelPrevious) aborts here — this
    // is the expected outcome of being cancelled, not a real failure, so it
    // resolves to null like "no route found" rather than logging as an error.
    if (error?.name !== 'AbortError') {
      console.error("❌ Critical Error in Mapbox Service:", error.message);
    }
    return null;
  }
};

/**
 * Same as `getSmartPath`, but returns ALL alternatives Mapbox produced
 * (up to 3) instead of only the primary route. Used by the commute
 * branch of the route generator to pick "fastest" + "alternative" from
 * a single API call without burning two extra round-trips.
 *
 * Order: Mapbox already sorts routes by duration ascending, so
 * `result[0]` is the fastest and subsequent entries are progressively
 * different geometries. The caller is responsible for any further
 * variant-selection logic (e.g. "most different from fastest").
 */
const getSmartPathAlternatives = async (
  start: any,
  end: any,
  profile: 'walking' | 'cycling' | 'driving' = 'walking',
  waypoints: any[] = [],
  extraParams: MapboxDirectionsExtraParams = {},
  opts?: { signal?: AbortSignal },
): Promise<MapboxPathResult[]> => {
  try {
    const startCoord = toCoord(start);
    const endCoord = toCoord(end);
    if (!startCoord || !endCoord) {
      console.warn('[MapboxService] Missing start or end coordinates (alternatives)');
      return [];
    }
    const cleanWaypoints = waypoints
      .map(wp => toCoord(wp))
      .filter((wp): wp is [number, number] => wp !== null);
    const allPoints = [startCoord, ...cleanWaypoints, endCoord];
    const coordinatesString = allPoints.map(p => `${p[0]},${p[1]}`).join(';');

    const baseQuery = new URLSearchParams({
      alternatives: 'true',
      geometries: 'geojson',
      steps: 'true',
      overview: 'full',
    });
    for (const [k, v] of Object.entries(extraParams)) {
      if (v !== undefined) baseQuery.set(k, v);
    }
    baseQuery.set('access_token', MAPBOX_TOKEN);
    const url = `${BASE_URL}/${profile}/${coordinatesString}?${baseQuery.toString()}`;

    const response = await fetch(url, { signal: opts?.signal });
    const data = await response.json();
    if (!response.ok) {
      console.error('[MapboxService] API Error (alternatives):', data.message);
      return [];
    }
    if (!Array.isArray(data.routes) || data.routes.length === 0) return [];

    return data.routes.map((route: any) => {
      const steps = Array.isArray(route.legs)
        ? route.legs.flatMap((leg: any) => Array.isArray(leg?.steps) ? leg.steps : [])
        : [];
      const legs = Array.isArray(route.legs)
        ? route.legs.map((leg: any) => ({ distance: leg.distance, duration: leg.duration }))
        : [];
      return {
        path: route.geometry.coordinates as [number, number][],
        distance: route.distance,
        duration: route.duration,
        steps,
        legs,
      };
    });
  } catch (error: any) {
    if (error?.name !== 'AbortError') {
      console.error('❌ Critical Error in Mapbox Service (alternatives):', error.message);
    }
    return [];
  }
};

// פונקציה לחיפוש כתובות (Geocoding)
//
// 17.10.2026 (owner: "when I type it doesn't find all the addresses"): the
// old call was Geocoding v5 only, 5 results, no proximity — v5's Israeli
// street/house-number coverage in Hebrew is thin. Now two calls in parallel:
//   • Geocoding v6 forward — the newer address index (streets, house
//     numbers, neighborhoods, localities), autocomplete, biased to the user;
//   • Geocoding v5 — kept for points of interest (v6 has no POIs).
// Merged (v6 first), de-duplicated by name + ~50m, up to 8.
/** placeType: Mapbox result kind (v6 feature_type / v5 place_type), see geocode-place-type.ts. */
type GeoHit = { text: string; coords: [number, number]; placeType?: GeoPlaceType };

function toQuery(params: Record<string, string | undefined>): string {
  return Object.entries(params)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join('&');
}

const searchAddress = async (
  query: string,
  opts?: { signal?: AbortSignal; proximity?: [number, number] | null },
): Promise<GeoHit[]> => {
  if (!query || query.length < 2) return [];
  const proximity = opts?.proximity ? `${opts.proximity[0]},${opts.proximity[1]}` : undefined;

  const v6 = async (): Promise<GeoHit[]> => {
    const url = `https://api.mapbox.com/search/geocode/v6/forward?${toQuery({
      q: query,
      country: 'il',
      language: 'he',
      limit: '8',
      autocomplete: 'true',
      proximity,
      access_token: MAPBOX_TOKEN,
    })}`;
    const res = await fetch(url, { signal: opts?.signal });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features ?? [])
      .map((f: any) => {
        const p = f.properties ?? {};
        const coords = (f.geometry?.coordinates ?? [p.coordinates?.longitude, p.coordinates?.latitude]) as [number, number];
        const text = p.full_address || [p.name, p.place_formatted].filter(Boolean).join(', ');
        if (!text || !Number.isFinite(coords?.[0])) return null;
        const placeType = placeTypeFromV6(p.feature_type);
        return placeType ? { text, coords, placeType } : { text, coords };
      })
      .filter(Boolean) as GeoHit[];
  };

  const v5 = async (): Promise<GeoHit[]> => {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${toQuery({
      access_token: MAPBOX_TOKEN,
      language: 'he',
      country: 'il',
      limit: '6',
      autocomplete: 'true',
      fuzzyMatch: 'true',
      proximity,
    })}`;
    const res = await fetch(url, { signal: opts?.signal });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features ?? []).map((f: any) => {
      const placeType = placeTypeFromV5(f);
      const hit: GeoHit = { text: f.place_name as string, coords: f.center as [number, number] };
      return placeType ? { ...hit, placeType } : hit;
    });
  };

  try {
    const [a, b] = await Promise.allSettled([v6(), v5()]);
    const merged = [...(a.status === 'fulfilled' ? a.value : []), ...(b.status === 'fulfilled' ? b.value : [])];
    const out: GeoHit[] = [];
    for (const h of merged) {
      const dup = out.some(
        (o) =>
          o.text === h.text ||
          (Math.abs(o.coords[0] - h.coords[0]) < 0.0005 && Math.abs(o.coords[1] - h.coords[1]) < 0.0005 && o.text.split(',')[0] === h.text.split(',')[0]),
      );
      if (!dup) out.push(h);
      if (out.length >= 8) break;
    }
    if (!out.length && (a.status === 'rejected' && (a.reason as Error)?.name === 'AbortError')) throw a.reason;
    return out;
  } catch (error: any) {
    if (error?.name !== 'AbortError') {
      console.error("❌ Geocoding Error:", error);
    }
    return [];
  }
};

// 👇 Export אחיד - שומר על תאימות לקוד הישן שלך
export const MapboxService = {
  getSmartPath,
  getSmartPathAlternatives,
  getDirections: getSmartPath, // Alias לתאימות לאחור
  searchAddress
};