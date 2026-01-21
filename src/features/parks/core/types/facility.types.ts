/**
 * Facility Types
 * Map facilities like water fountains, toilets, parking, etc.
 */

export type FacilityType = 'water' | 'toilet' | 'gym' | 'parking';

export interface MapFacility {
  id: string;
  name: string;
  type: FacilityType;
  location: { lat: number; lng: number };
  properties?: any;
}
