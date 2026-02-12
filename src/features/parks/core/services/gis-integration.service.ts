import { Route, ActivityType } from '../types/route.types';

/**
 * GIS Integration Service
 * =======================
 * Fetches GIS data from external ArcGIS REST APIs via our universal proxy.
 *
 * Features:
 *  - Auto-pagination: ArcGIS APIs cap results (typically 1000-2000).
 *    We keep fetching until all records are retrieved.
 *  - Classification: Accepts activity/terrain/environment params.
 *  - Smart field mapping: Tries multiple common GIS property names.
 */

interface GISClassification {
    activity: ActivityType;
    terrain: 'asphalt' | 'dirt' | 'mixed';
    environment: 'urban' | 'nature' | 'park' | 'beach';
    difficulty: 'easy' | 'medium' | 'hard';
}

/**
 * Auto-detect infrastructure mode from GIS feature properties.
 *
 * Inspects common fields (highway, type, path_type, route_type, etc.)
 * to classify a segment as 'cycling', 'pedestrian', or 'shared'.
 *
 * Falls back to the admin-selected activity classification if no
 * recognisable tag is found.
 */
function detectInfrastructureMode(
    props: Record<string, any>,
    fallbackActivity: ActivityType
): 'cycling' | 'pedestrian' | 'shared' {
    // Collect all values from common GIS classification fields
    const candidates = [
        props.highway,
        props.Highway,
        props.HIGHWAY,
        props.path_type,
        props.PATH_TYPE,
        props.route_type,
        props.ROUTE_TYPE,
        props.type,
        props.Type,
        props.TYPE,
        props.road_type,
        props.ROAD_TYPE,
        props.sug_dereh,      // Hebrew: סוג דרך (common in Israeli GIS)
        props.SUG_DEREH,
    ]
        .filter(Boolean)
        .map((v: any) => String(v).toLowerCase());

    const CYCLING_KEYWORDS = ['cycleway', 'bicycle', 'bike', 'cycle', 'ofanaim', 'אופניים'];
    const PEDESTRIAN_KEYWORDS = ['footway', 'pedestrian', 'sidewalk', 'footpath', 'holchei_regel', 'הולכי רגל', 'מדרכה'];
    const SHARED_KEYWORDS = ['path', 'shared', 'track', 'shared_use', 'meshutaf', 'משותף'];

    let isCycling = false;
    let isPedestrian = false;
    let isShared = false;

    for (const val of candidates) {
        if (CYCLING_KEYWORDS.some(k => val.includes(k))) isCycling = true;
        if (PEDESTRIAN_KEYWORDS.some(k => val.includes(k))) isPedestrian = true;
        if (SHARED_KEYWORDS.some(k => val.includes(k))) isShared = true;
    }

    // If both cycling and pedestrian tags present → shared
    if (isCycling && isPedestrian) return 'shared';
    if (isShared) return 'shared';
    if (isCycling) return 'cycling';
    if (isPedestrian) return 'pedestrian';

    // Fallback: derive from admin classification
    if (fallbackActivity === 'cycling') return 'cycling';
    if (fallbackActivity === 'walking' || fallbackActivity === 'running') return 'pedestrian';
    return 'shared';
}

export interface GISFetchProgress {
    phase: 'fetching' | 'parsing' | 'done';
    detail: string;
    featuresSoFar: number;
    percent: number;
}

/**
 * Normalize an ArcGIS REST URL to include the required query params.
 * If the URL already ends with `/query` or `/query?...`, we add defaults.
 * Otherwise, we append `/query?where=1%3D1&outFields=*&f=geojson&outSR=4326`.
 */
function normalizeArcGISUrl(rawUrl: string): URL {
    let url: URL;

    try {
        url = new URL(rawUrl);
    } catch {
        throw new Error('כתובת URL לא תקינה');
    }

    // If the user pasted a service layer URL without /query, add it
    const pathLower = url.pathname.toLowerCase();
    if (!pathLower.endsWith('/query')) {
        // Strip trailing slash then add /query
        url.pathname = url.pathname.replace(/\/+$/, '') + '/query';
    }

    // Ensure essential ArcGIS query params
    if (!url.searchParams.has('where')) {
        url.searchParams.set('where', '1=1');
    }
    if (!url.searchParams.has('outFields')) {
        url.searchParams.set('outFields', '*');
    }
    if (!url.searchParams.has('f')) {
        url.searchParams.set('f', 'geojson');
    }
    if (!url.searchParams.has('outSR')) {
        url.searchParams.set('outSR', '4326');
    }

    return url;
}

/** Page size for ArcGIS pagination */
const PAGE_SIZE = 1000;

export const GISIntegrationService = {
    /**
     * Fetches ALL features from an ArcGIS REST endpoint, handling pagination.
     * Returns parsed Route objects ready for saving.
     *
     * @param targetUrl  The raw ArcGIS REST URL (with or without /query)
     * @param classification  Activity/terrain/environment classification
     * @param onProgress  Optional callback for progress updates
     */
    fetchFromArcGIS: async (
        targetUrl: string,
        classification: GISClassification = {
            activity: 'cycling',
            terrain: 'asphalt',
            environment: 'urban',
            difficulty: 'easy',
        },
        onProgress?: (p: GISFetchProgress) => void
    ): Promise<Route[]> => {
        try {
            console.log(`[GISService] Syncing from: ${targetUrl}`);

            const url = normalizeArcGISUrl(targetUrl);
            const allFeatures: any[] = [];
            let offset = 0;
            let page = 1;
            let hasMore = true;

            // Pagination loop
            while (hasMore) {
                onProgress?.({
                    phase: 'fetching',
                    detail: `מוריד עמוד ${page}... (${allFeatures.length} תכונות עד כה)`,
                    featuresSoFar: allFeatures.length,
                    percent: Math.min(80, page * 10),
                });

                // Set pagination params
                url.searchParams.set('resultOffset', offset.toString());
                url.searchParams.set('resultRecordCount', PAGE_SIZE.toString());

                // Use our proxy to avoid CORS
                const encodedUrl = encodeURIComponent(url.toString());
                const response = await fetch(`/api/integrations/universal-gis-proxy?url=${encodedUrl}`);

                if (!response.ok) {
                    throw new Error(`Proxy returned error ${response.status}`);
                }

                const data = await response.json();

                // Handle GeoJSON response
                if (data.type === 'FeatureCollection' && data.features) {
                    allFeatures.push(...data.features);
                    // If we got fewer than PAGE_SIZE features, we've reached the end
                    if (data.features.length < PAGE_SIZE) {
                        hasMore = false;
                    } else {
                        offset += PAGE_SIZE;
                        page++;
                    }
                }
                // Handle EsriJSON (already converted by proxy)
                else if (data.features && Array.isArray(data.features)) {
                    allFeatures.push(...data.features);
                    if (data.features.length < PAGE_SIZE) {
                        hasMore = false;
                    } else {
                        offset += PAGE_SIZE;
                        page++;
                    }
                } else {
                    // No features or unknown format
                    hasMore = false;
                }

                // Safety: stop after 50 pages (50,000 features)
                if (page > 50) {
                    console.warn('[GISService] Reached 50-page limit, stopping pagination');
                    hasMore = false;
                }
            }

            console.log(`[GISService] Total features fetched: ${allFeatures.length}`);

            // Parse features into Route objects
            onProgress?.({
                phase: 'parsing',
                detail: `ממיר ${allFeatures.length} תכונות למסלולים...`,
                featuresSoFar: allFeatures.length,
                percent: 85,
            });

            const routes = allFeatures
                .map((feature: any, index: number) => {
                    const geometry = feature.geometry;
                    const props = feature.properties || feature.attributes || {};

                    if (!geometry) return null;

                    // Only accept line geometries
                    if (
                        geometry.type !== 'LineString' &&
                        geometry.type !== 'MultiLineString'
                    ) {
                        return null;
                    }

                    // Extract coordinates
                    let path: [number, number][] = [];
                    if (geometry.type === 'LineString') {
                        path = geometry.coordinates;
                    } else if (geometry.type === 'MultiLineString') {
                        // Flatten all line segments into one path
                        path = geometry.coordinates.flat();
                    }

                    if (path.length < 2) return null;

                    // Smart name extraction (try many common GIS field names)
                    const name =
                        props.t_name ||
                        props.shem_rehov ||
                        props.Name ||
                        props.name ||
                        props.label ||
                        props.LABEL ||
                        props.STREET_NAME ||
                        props.street_name ||
                        props.SHEM ||
                        props.shem ||
                        props.ROUTE_NAME ||
                        `מקטע ${index + 1}`;

                    const objectId =
                        props.OBJECTID ||
                        props.objectid ||
                        props.FID ||
                        props.fid ||
                        props.id ||
                        props.GlobalID ||
                        index;

                    // Calculate approximate distance
                    const rawDist = props.length || props.Length || props.SHAPE_Length ||
                        props.Shape_Length || props.shape_length || props.distance || 0;
                    const distKm = rawDist > 100
                        ? Number((rawDist / 1000).toFixed(2))   // Likely metres
                        : rawDist > 0
                            ? Number(rawDist.toFixed(2))          // Likely already km
                            : 1.0;                                 // Fallback

                    // Rating normalization
                    const rawRating =
                        props.rating ?? props.Rating ?? props.score ?? props.Score;
                    let rating = 0;
                    if (rawRating != null && typeof rawRating === 'number' && rawRating > 0) {
                        rating = rawRating > 5
                            ? Number((rawRating / 2).toFixed(1))
                            : Number(rawRating.toFixed(1));
                        rating = Math.max(1, Math.min(5, rating));
                    }

                    // ── Auto-detect infrastructure mode from GIS properties ──
                    // Try common highway/path type fields used by OSM / municipal GIS
                    const infraMode = detectInfrastructureMode(props, classification.activity);

                    const route: Route = {
                        id: `gis-${classification.activity}-${objectId}-${index}`,
                        name,
                        description: `מסלול רשמי – ${name}`,
                        distance: distKm,
                        duration: Math.round(
                            distKm * (classification.activity === 'cycling' ? 3 : 6)
                        ),
                        score: Math.round(distKm * 10),
                        rating,
                        calories: Math.round(
                            distKm * (classification.activity === 'cycling' ? 30 : 65)
                        ),
                        type: classification.activity,
                        activityType: classification.activity,
                        difficulty: classification.difficulty,
                        path,
                        segments: [],
                        features: {
                            hasGym: false,
                            hasBenches: false,
                            scenic:
                                classification.environment === 'nature' ||
                                classification.environment === 'beach',
                            lit: classification.environment === 'urban',
                            terrain: classification.terrain,
                            environment: classification.environment,
                            trafficLoad:
                                classification.environment === 'urban' ? 'medium' : 'none',
                            surface:
                                classification.terrain === 'asphalt' ? 'road' : 'trail',
                        },
                        source: {
                            type: 'official_api',
                            name: 'מקור GIS חיצוני',
                            externalId: objectId.toString(),
                        },
                        infrastructureMode: infraMode,
                    };

                    return route;
                })
                .filter((r): r is Route => r !== null);

            onProgress?.({
                phase: 'done',
                detail: `${routes.length} מסלולים נטענו בהצלחה`,
                featuresSoFar: allFeatures.length,
                percent: 100,
            });

            return routes;
        } catch (error) {
            console.error('[GISService] Sync failed:', error);
            throw error;
        }
    },
};
