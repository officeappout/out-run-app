import shp from 'shpjs';
import JSZip from 'jszip';
import { Route, ActivityType } from '../types/route.types';
import { MapFacility, FacilityType } from '../types/facility.types';

export interface GISClassification {
    activity: ActivityType;
    /** Multiple activity types for this import (overrides single `activity` when set) */
    activities?: ActivityType[];
    terrain: 'asphalt' | 'dirt' | 'mixed';
    environment: 'urban' | 'nature' | 'park' | 'beach';
    difficulty: 'easy' | 'medium' | 'hard';
}

/**
 * Auto-detect infrastructure mode from GIS feature properties.
 * Mirrors the logic in gis-integration.service.ts.
 */
function detectInfrastructureMode(
    props: Record<string, any>,
    fallbackActivity: ActivityType
): 'cycling' | 'pedestrian' | 'shared' {
    const candidates = [
        props.highway, props.Highway, props.HIGHWAY,
        props.path_type, props.PATH_TYPE,
        props.route_type, props.ROUTE_TYPE,
        props.type, props.Type, props.TYPE,
        props.road_type, props.ROAD_TYPE,
        props.sug_dereh, props.SUG_DEREH,
    ].filter(Boolean).map((v: any) => String(v).toLowerCase());

    const CYCLING = ['cycleway', 'bicycle', 'bike', 'cycle', 'ofanaim', 'אופניים'];
    const PEDESTRIAN = ['footway', 'pedestrian', 'sidewalk', 'footpath', 'holchei_regel', 'הולכי רגל', 'מדרכה'];
    const SHARED = ['path', 'shared', 'track', 'shared_use', 'meshutaf', 'משותף'];

    let cyc = false, ped = false, shr = false;
    for (const val of candidates) {
        if (CYCLING.some(k => val.includes(k))) cyc = true;
        if (PEDESTRIAN.some(k => val.includes(k))) ped = true;
        if (SHARED.some(k => val.includes(k))) shr = true;
    }

    if (cyc && ped) return 'shared';
    if (shr) return 'shared';
    if (cyc) return 'cycling';
    if (ped) return 'pedestrian';

    if (fallbackActivity === 'cycling') return 'cycling';
    if (fallbackActivity === 'walking' || fallbackActivity === 'running') return 'pedestrian';
    return 'shared';
}

export const GISParserService = {
    /**
     * Entry point for parsing a GIS file (GeoJSON or Shapefile ZIP)
     */
    parseFile: async (file: File): Promise<any> => {
        const fileName = file.name.toLowerCase();

        // 1. Handle JSON/GeoJSON directly
        if (fileName.endsWith('.json') || fileName.endsWith('.geojson')) {
            let text = await file.text();
            // Strip BOM if present
            if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
            try {
                const parsed = JSON.parse(text);
                if (!parsed.features && !parsed.type) {
                    throw new Error('הקובץ אינו GeoJSON תקין — חסר שדה "features" או "type".');
                }
                return parsed;
            } catch (jsonErr: any) {
                throw new Error(`שגיאת פירוש GeoJSON: ${jsonErr.message}`);
            }
        }

        // 2. Handle ZIP — check for GeoJSON inside first, then fall back to Shapefile
        if (fileName.endsWith('.zip')) {
            try {
                const buffer = await file.arrayBuffer();
                const zip = await JSZip.loadAsync(buffer);

                const entries = Object.entries(zip.files);

                // ── 2a. Look for GeoJSON files inside the ZIP ──
                for (const [entryPath, zipFile] of entries) {
                    const entryName = entryPath.toLowerCase();
                    if (zipFile.dir || entryName.includes('__macosx') || entryPath.startsWith('.')) continue;

                    if (entryName.endsWith('.geojson') || entryName.endsWith('.json')) {
                        let text = await zipFile.async('string');
                        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

                        try {
                            const parsed = JSON.parse(text);
                            if (parsed.features || parsed.type === 'FeatureCollection') {
                                console.log(`[GISParser] Found GeoJSON inside ZIP: "${entryPath}", processing...`);
                                return parsed;
                            }
                        } catch {
                            // Not valid JSON — might be a shapefile companion .json (e.g. .prj.json), skip
                        }
                    }
                }

                // ── 2b. No GeoJSON found — try Shapefile extraction ──
                const cleanZip = new JSZip();
                let hasShapefile = false;

                for (const [entryPath, zipFile] of entries) {
                    const entryName = entryPath.toLowerCase();
                    if (entryName.includes('__macosx') || zipFile.dir || entryPath.startsWith('.')) continue;

                    if (entryName.endsWith('.shp') || entryName.endsWith('.dbf') ||
                        entryName.endsWith('.shx') || entryName.endsWith('.prj') ||
                        entryName.endsWith('.cpg')) {

                        const content = await zipFile.async('arraybuffer');
                        const basename = entryPath.split('/').pop() || entryPath;
                        cleanZip.file(basename, content);
                        hasShapefile = true;
                    }
                }

                if (!hasShapefile) {
                    throw new Error('לא נמצא Shapefile או GeoJSON בתוך קובץ ה-ZIP. ודאו שהקובץ מכיל .shp/.shx/.dbf או .geojson.');
                }

                const cleanBuffer = await cleanZip.generateAsync({ type: 'arraybuffer' });
                const result = await shp(cleanBuffer);

                if (Array.isArray(result)) {
                    return {
                        type: 'FeatureCollection',
                        features: result.flatMap(fc => fc.features)
                    };
                }
                return result;
            } catch (err: any) {
                console.error('[GISParser] ZIP Error:', err);
                if (err.message?.includes('Junk found') || err.message?.includes('compressed data')) {
                    throw new Error('פורמט ה-ZIP אינו תקני. נסו לחלץ ולדחוס מחדש רק את קבצי .shp/.shx/.dbf.');
                }
                throw err;
            }
        }

        throw new Error('Unsupported file format. Please upload .geojson or .zip Shapefile.');
    },


    /**
     * Parses GeoJSON data into OutRun Route objects
     * @param geojson The raw GeoJSON object
     * @param classification Default classification tags to apply
     */
    parseGeoJSON: (geojson: any, classification: GISClassification): Route[] => {
        if (!geojson || !geojson.features) {
            console.warn('[GISParser) Invalid GeoJSON structure');
            return [];
        }

        return geojson.features.map((feature: any, index: number) => {
            const geometry = feature.geometry;
            const properties = feature.properties || {};

            if (!geometry || (geometry.type !== 'LineString' && geometry.type !== 'MultiLineString')) {
                console.warn(`[GISParser] Skipping feature ${index}: unsupported geometry type "${geometry?.type}"`);
                return null;
            }

            // Extract coordinates (handling MultiLineString by flattening)
            // Strip elevation if present: [lng, lat, elev] → [lng, lat]
            let rawCoords: number[][] = [];
            if (geometry.type === 'LineString') {
                rawCoords = geometry.coordinates;
            } else {
                rawCoords = geometry.coordinates.flat();
            }
            const path: [number, number][] = rawCoords.map(
                (c: number[]) => [c[0], c[1]] as [number, number]
            );

            // Calculate an approximate distance if not provided in properties
            // (Using a simple 0-value placeholder for now as Mapbox or Parks service usually recalculates)
            const distanceMetres = properties.length || properties.distance || 0;
            const distanceKm = Number((distanceMetres / 1000).toFixed(2)) || 1.0;

            // Extract name from properties (common GIS fields, including Hebrew)
            const name = properties.name || properties.Name || properties.NAME
                || properties.label || properties.Label || properties.LABEL
                || properties.shem || properties.SHEM || properties.שם
                || `מקטע ${index + 1}`;

            // Auto-map rating: if source provides a rating, normalize to 1–5
            const rawRating = properties.rating ?? properties.Rating ?? properties.score ?? properties.Score;
            let normalizedRating = 0;
            if (rawRating != null && typeof rawRating === 'number' && rawRating > 0) {
                // If source is 1–10, divide by 2; if already 1–5, keep as is
                normalizedRating = rawRating > 5 ? Number((rawRating / 2).toFixed(1)) : Number(rawRating.toFixed(1));
                // Clamp to [1, 5]
                normalizedRating = Math.max(1, Math.min(5, normalizedRating));
            }

            const allActivities = classification.activities?.length
                ? classification.activities
                : [classification.activity];
            const primaryActivity = allActivities[0];

            const infraMode = detectInfrastructureMode(properties, primaryActivity);

            const route: Route = {
                id: `gis-${primaryActivity}-${Date.now()}-${index}`,
                name: name,
                description: properties.description || `מסלול ${primaryActivity === 'cycling' ? 'רכיבה' : primaryActivity === 'walking' ? 'הליכה' : 'ריצה'} בתוואי ${classification.terrain === 'asphalt' ? 'סלול' : 'שטח'}`,
                distance: distanceKm,
                duration: Math.round(distanceKm * (primaryActivity === 'cycling' ? 3 : 6)),
                score: Math.round(distanceKm * 10),
                rating: normalizedRating,
                calories: Math.round(distanceKm * (primaryActivity === 'cycling' ? 30 : 65)),
                type: primaryActivity,
                activityType: primaryActivity,
                activityTypes: allActivities,
                difficulty: classification.difficulty,
                path: path,
                segments: [],
                features: {
                    hasGym: false,
                    hasBenches: false,
                    scenic: classification.environment === 'nature' || classification.environment === 'beach',
                    lit: classification.environment === 'urban',
                    terrain: classification.terrain,
                    environment: classification.environment,
                    trafficLoad: classification.environment === 'urban' ? 'medium' : 'none',
                    surface: classification.terrain === 'asphalt' ? 'road' : 'trail'
                },
                source: {
                    type: 'official_api',
                    name: properties.source || 'GIS Import',
                    externalId: properties.id?.toString() || properties.GlobalID?.toString()
                },
                infrastructureMode: infraMode,
            };

            return route;
        }).filter((r: any): r is Route => r !== null);
    },

    /**
     * Parses GeoJSON data into OutRun Facility objects
     * @param geojson The raw GeoJSON object
     * @param type The selected facility type
     */
    parseFacilities: (geojson: any, type: FacilityType): MapFacility[] => {
        if (!geojson || !geojson.features) {
            console.warn('[GISParser] Invalid GeoJSON structure');
            return [];
        }

        return geojson.features.map((feature: any, index: number) => {
            const geometry = feature.geometry;
            const properties = feature.properties || {};

            // Ensure we have a Point
            if (geometry.type !== 'Point') {
                return null;
            }

            const [lng, lat] = geometry.coordinates;

            return {
                id: `facility-${type}-${Date.now()}-${index}`,
                name: properties.name || properties.label || properties.Name || `${type} ${index + 1}`,
                type: type,
                location: { lat, lng },
                properties: properties
            };
        }).filter((f: any): f is MapFacility => f !== null);
    }
};
