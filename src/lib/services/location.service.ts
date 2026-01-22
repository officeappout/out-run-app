/**
 * Location Service - Industry-standard GPS tracking
 * Implements watchPosition with accuracy filtering and proper options
 */

export interface LocationPoint {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

export interface LocationWatchOptions {
  enableHighAccuracy?: boolean;
  maximumAge?: number;
  timeout?: number;
  accuracyThreshold?: number; // Only accept positions with accuracy <= this value (meters)
}

const DEFAULT_OPTIONS: Required<LocationWatchOptions> = {
  enableHighAccuracy: true,
  maximumAge: 1000, // Accept cached positions up to 1 second old
  timeout: 10000, // Wait up to 10 seconds for a position
  accuracyThreshold: 25, // Only accept positions accurate to 25 meters or better
};

/**
 * Start watching position with industry-standard settings
 * Returns a watch ID that can be used to stop watching
 */
export function watchPosition(
  onSuccess: (location: LocationPoint) => void,
  onError?: (error: GeolocationPositionError) => void,
  options: LocationWatchOptions = {}
): number | null {
  if (typeof window === 'undefined' || !('geolocation' in navigator)) {
    console.warn('[LocationService] Geolocation not available');
    if (onError) {
      onError({
        code: 0,
        message: 'Geolocation not available',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError);
    }
    return null;
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      const accuracy = position.coords.accuracy;
      
      // Filter: Only accept positions with accuracy <= threshold
      if (accuracy > opts.accuracyThreshold) {
        console.warn(`[LocationService] Position rejected: accuracy ${accuracy.toFixed(1)}m > threshold ${opts.accuracyThreshold}m`);
        return; // Skip this position
      }

      const location: LocationPoint = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: accuracy,
        timestamp: position.timestamp || Date.now(),
      };

      onSuccess(location);
    },
    (error) => {
      console.error('[LocationService] GPS error:', error.code, error.message);
      if (onError) {
        onError(error);
      }
    },
    {
      enableHighAccuracy: opts.enableHighAccuracy,
      maximumAge: opts.maximumAge,
      timeout: opts.timeout,
    }
  );

  return watchId;
}

/**
 * Stop watching position
 */
export function clearWatch(watchId: number | null): void {
  if (watchId !== null && typeof window !== 'undefined' && 'geolocation' in navigator) {
    navigator.geolocation.clearWatch(watchId);
  }
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in meters
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
}
