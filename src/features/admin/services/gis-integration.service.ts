import { Route } from '@/features/parks';
import { MapFacility, FacilityType } from '@/features/parks';
import axios from 'axios';

/**
 * GIS Integration Service
 * Handles external GIS API integrations for importing routes and facilities
 */

interface UniversalGISResponse {
  routes?: Route[];
  facilities?: MapFacility[];
  source: string;
}

/**
 * Fetch data from Universal GIS Proxy
 * @param city - City name in Hebrew or English
 * @param dataType - Type of data to fetch ('routes' | 'facilities' | 'all')
 */
export async function fetchFromUniversalGIS(
  city: string,
  dataType: 'routes' | 'facilities' | 'all' = 'all'
): Promise<UniversalGISResponse> {
  try {
    const response = await axios.get('/api/integrations/universal-gis-proxy', {
      params: { city, dataType }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error fetching from Universal GIS:', error);
    throw error;
  }
}

/**
 * Import routes from external GIS systems
 */
export async function importRoutesFromGIS(city: string): Promise<Route[]> {
  const data = await fetchFromUniversalGIS(city, 'routes');
  return data.routes || [];
}

/**
 * Import facilities from external GIS systems
 */
export async function importFacilitiesFromGIS(city: string): Promise<MapFacility[]> {
  const data = await fetchFromUniversalGIS(city, 'facilities');
  return data.facilities || [];
}
