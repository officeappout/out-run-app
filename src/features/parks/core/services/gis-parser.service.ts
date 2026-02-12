import shp from 'shpjs';
import JSZip from 'jszip';
import { Route, ActivityType } from '../types/route.types';
import { MapFacility, FacilityType } from '../types/facility.types';

interface GISClassification {
    activity: ActivityType;
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
            const text = await file.text();
            return JSON.parse(text);
        }

        // 2. Handle ZIP (Shapefiles) with robust sanitization
        if (fileName.endsWith('.zip')) {
            try {
                const buffer = await file.arrayBuffer();

                // Sanitize ZIP using JSZip to remove junk like __MACOSX
                const zip = await JSZip.loadAsync(buffer);
                const cleanZip = new JSZip();
                let hasShapefile = false;

                // Only keep actual shapefile components, ignore __MACOSX and hidden files
                const entries = Object.entries(zip.files);
                for (const [path, zipFile] of entries) {
                    const name = path.toLowerCase();
                    if (name.includes('__macosx') || zipFile.dir || path.startsWith('.')) continue;

                    // Common shapefile extensions
                    if (name.endsWith('.shp') || name.endsWith('.dbf') ||
                        name.endsWith('.shx') || name.endsWith('.prj') ||
                        name.endsWith('.cpg') || name.endsWith('.json')) {

                        const content = await zipFile.async('arraybuffer');
                        // Use the basename to avoid deep nested folder issues in some shpjs versions
                        const basename = path.split('/').pop() || path;
                        cleanZip.file(basename, content);
                        hasShapefile = true;
                    }
                }

                if (!hasShapefile) {
                    throw new Error('No valid Shapefile found in the ZIP. Ensure it contains .shp, .shx, and .dbf files.');
                }

                // Generate a "clean" ZIP buffer
                const cleanBuffer = await cleanZip.generateAsync({ type: 'arraybuffer' });
                const result = await shp(cleanBuffer);

                // Normalize: shpjs might return a FeatureCollection or an array of them
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
                    throw new Error('The ZIP file format is non-standard. Please try extracting and re-zipping only the .shp, .shx, and .dbf files manually.');
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

            // Ensure we have a LineString or MultiLineString
            if (geometry.type !== 'LineString' && geometry.type !== 'MultiLineString') {
                return null;
            }

            // Extract coordinates (handling MultiLineString by taking the first segment or flattening)
            let path: [number, number][] = [];
            if (geometry.type === 'LineString') {
                path = geometry.coordinates;
            } else {
                path = geometry.coordinates[0]; // Simplified: take first segment
            }

            // Calculate an approximate distance if not provided in properties
            // (Using a simple 0-value placeholder for now as Mapbox or Parks service usually recalculates)
            const distanceMetres = properties.length || properties.distance || 0;
            const distanceKm = Number((distanceMetres / 1000).toFixed(2)) || 1.0;

            // Extract name from properties (common GIS fields)
            const name = properties.name || properties.label || properties.Name || `Section ${index + 1}`;

            // Auto-map rating: if source provides a rating, normalize to 1–5
            const rawRating = properties.rating ?? properties.Rating ?? properties.score ?? properties.Score;
            let normalizedRating = 0;
            if (rawRating != null && typeof rawRating === 'number' && rawRating > 0) {
                // If source is 1–10, divide by 2; if already 1–5, keep as is
                normalizedRating = rawRating > 5 ? Number((rawRating / 2).toFixed(1)) : Number(rawRating.toFixed(1));
                // Clamp to [1, 5]
                normalizedRating = Math.max(1, Math.min(5, normalizedRating));
            }

            // Auto-detect infrastructure mode from GIS properties
            const infraMode = detectInfrastructureMode(properties, classification.activity);

            const route: Route = {
                id: `gis-${classification.activity}-${Date.now()}-${index}`,
                name: name,
                description: properties.description || `מסלול ${classification.activity === 'cycling' ? 'רכיבה' : 'ריצה'} בתוואי ${classification.terrain === 'asphalt' ? 'סלול' : 'שטח'}`,
                distance: distanceKm,
                duration: Math.round(distanceKm * (classification.activity === 'cycling' ? 3 : 6)), // Rough estimate
                score: Math.round(distanceKm * 10),
                rating: normalizedRating,
                calories: Math.round(distanceKm * (classification.activity === 'cycling' ? 30 : 65)),
                type: classification.activity,
                activityType: classification.activity,
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
