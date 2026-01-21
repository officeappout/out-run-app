import { Route, MapFacility, FacilityType } from '@/features/map/types/map-objects.type';

export const GISIntegrationService = {
    /**
     * Fetches GIS data from our universal proxy and maps it
     */
    fetchFromArcGIS: async (targetUrl: string, activity: 'cycling' | 'running' = 'cycling'): Promise<Route[]> => {
        try {
            console.log(`[GISService] Syncing from: ${targetUrl}`);
            const encodedUrl = encodeURIComponent(targetUrl);
            const response = await fetch(`/api/integrations/universal-gis-proxy?url=${encodedUrl}`);

            if (!response.ok) {
                throw new Error('Proxy returned error');
            }

            const geojson = await response.json();

            if (!geojson.features) {
                return [];
            }

            return geojson.features.map((feature: any, index: number) => {
                const props = feature.properties;

                // Map common GIS fields (flexible)
                const name = props.t_name || props.shem_rehov || props.Name || props.label || "מסלול עירוני";
                const objectId = props.OBJECTID || props.id || index;

                const route: Route = {
                    id: `gis-${activity}-${objectId}`,
                    name: name,
                    description: `מסלול רשמי - ${name}`,
                    distance: 1.0,
                    duration: activity === 'cycling' ? 5 : 10,
                    score: 50,
                    type: activity,
                    activityType: activity,
                    difficulty: 'easy',
                    path: feature.geometry.coordinates,
                    segments: [],
                    features: {
                        hasGym: false,
                        hasBenches: true,
                        scenic: false,
                        lit: true,
                        terrain: 'asphalt',
                        environment: 'urban',
                        trafficLoad: 'medium',
                        surface: 'road'
                    },
                    source: {
                        type: 'official_api',
                        name: 'מקור GIS חיצוני',
                        externalId: objectId.toString()
                    }
                };

                return route;
            });

        } catch (error) {
            console.error('[GISService] Sync failed:', error);
            throw error;
        }
    }
};
