import { NextResponse } from 'next/server';

/**
 * Smart GIS Proxy for Tel Aviv Municipality ArcGIS REST API
 * Standardizes different formats (GeoJSON/EsriJSON) into a clean GeoJSON FeatureCollection
 */
/**
 * Universal GIS Proxy
 * Standardizes different formats (GeoJSON/EsriJSON) into a clean GeoJSON FeatureCollection
 * Accepts target URL as ?url=...
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
        return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    try {
        console.log(`[GIS-Proxy] Fetching from: ${targetUrl}`);

        // Strategy A: Try with f=geojson if not specified
        const urlObj = new URL(targetUrl);
        if (!urlObj.searchParams.has('f')) {
            urlObj.searchParams.set('f', 'geojson');
        }
        if (!urlObj.searchParams.has('outSR')) {
            urlObj.searchParams.set('outSR', '4326');
        }

        let response = await fetch(urlObj.toString());

        if (!response.ok) {
            throw new Error(`GIS API returned ${response.status}`);
        }

        let data = await response.json();

        // Strategy B: If the server returned GeoJSON, return as is
        if (data.type === 'FeatureCollection') {
            console.log('[GIS-Proxy] Received direct GeoJSON');
            return NextResponse.json(data);
        }

        // Strategy C: If server returned EsriJSON, convert to GeoJSON
        if (data.features) {
            console.log('[GIS-Proxy] Received EsriJSON, converting to GeoJSON...');

            const featureCollection = {
                type: 'FeatureCollection',
                features: data.features.map((f: any) => {
                    // Coordinates conversion
                    let geometry = f.geometry;
                    let geojsonGeometry = null;

                    if (geometry?.paths) {
                        geojsonGeometry = {
                            type: 'LineString',
                            coordinates: geometry.paths[0]
                        };
                    } else if (geometry?.x && geometry?.y) {
                        geojsonGeometry = {
                            type: 'Point',
                            coordinates: [geometry.x, geometry.y]
                        };
                    } else if (geometry?.rings) {
                        geojsonGeometry = {
                            type: 'Polygon',
                            coordinates: geometry.rings
                        };
                    }

                    return {
                        type: 'Feature',
                        properties: f.attributes || {},
                        geometry: geojsonGeometry
                    };
                }).filter((f: any) => f.geometry !== null)
            };

            return NextResponse.json(featureCollection);
        }

        throw new Error('Unsupported response format from GIS server');

    } catch (error: any) {
        console.error('[GIS-Proxy] Error:', error.message);
        return NextResponse.json(
            { error: 'Failed to fetch GIS data', details: error.message },
            { status: 500 }
        );
    }
}
