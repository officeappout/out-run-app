import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Universal GIS Proxy — standardizes GeoJSON/EsriJSON into a clean
 * GeoJSON FeatureCollection. Accepts a target URL as ?url=...
 *
 * SECURITY (C1): admin-only + strict host allowlist. This closes the SSRF
 * vector — the proxy can no longer be pointed at internal services or the
 * cloud metadata endpoint (169.254.169.254).
 */
const ALLOWED_GIS_HOST_SUFFIXES = [
  '.gov.il',     // Israeli government & municipal GIS (e.g. gisn.tel-aviv.gov.il)
  '.muni.il',    // some Israeli municipalities
  '.arcgis.com', // Esri ArcGIS Online
] as const;

function isAllowedGisUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  // Reject IP literals (blocks 127.0.0.1, 169.254.169.254, ::1, etc.).
  if (/^[0-9.]+$/.test(host) || host.includes(':')) return false;
  return ALLOWED_GIS_HOST_SUFFIXES.some(
    (suffix) => host === suffix.slice(1) || host.endsWith(suffix),
  );
}

export async function GET(request: NextRequest) {
    const denied = await requireAdminApi(request);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
        return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    if (!isAllowedGisUrl(targetUrl)) {
        return NextResponse.json({ error: 'Target URL host is not allowed' }, { status: 403 });
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
