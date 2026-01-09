"use client";
import React, { useEffect, useRef, useMemo, useState } from 'react';
import Map, { Source, Layer, Marker, GeolocateControl, MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// ייבוא נתונים וטיפוסים
import { MOCK_PARKS } from '../data/mock-locations'; 
import { MapPark, Route } from '../types/map-objects.type'; 

// ייבוא Stores
import { useRunStore } from '@/features/run/store/useRunStore';
import { useMapStore } from '@/features/map/store/useMapStore'; 

// שימוש ב-API Key מ-Environment Variables (אם קיים) או fallback
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || 
  'pk.eyJ1IjoiZGF2aWQtb3V0IiwiYSI6ImNtanZpZmJ0djM5MTEzZXF5YXNmcm9zNGwifQ.8MD8s4TZOr0WYYgEpFfpzw'; 

interface Props {
  routes: Route[];
  showCarousel?: boolean;
  onRouteSelect?: (route: Route) => void;
  onRouteFocus?: (route: Route) => void;
  focusedRoute?: Route | null;
  selectedRoute?: Route | null;
}

export default function AppMap({ 
  routes, 
  showCarousel = true, 
  onRouteSelect, 
  onRouteFocus,
  focusedRoute: externalFocusedRoute,
  selectedRoute: externalSelectedRoute 
}: Props) {
  const mapRef = useRef<MapRef>(null); 
  const geoControlRef = useRef<any>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // State מקומי (רק אם לא מועבר מבחוץ)
  const [internalSelectedRoute, setInternalSelectedRoute] = useState<Route | null>(null);
  const [internalFocusedRoute, setInternalFocusedRoute] = useState<Route | null>(null);
  
  // State גלובלי
  const { activeRoutePath } = useRunStore();
  const { setSelectedPark } = useMapStore();
  
  // שימוש ב-props חיצוניים אם קיימים, אחרת state פנימי
  const selectedRoute = externalSelectedRoute ?? (onRouteSelect ? null : internalSelectedRoute);
  const currentFocusedRoute = externalFocusedRoute ?? (onRouteFocus ? null : internalFocusedRoute);

  // --- לוגיקה חכמה לקביעת איזה קו לצייר על המפה ---
  const lineCoordinates = useMemo(() => {
    // 1. עדיפות עליונה: אם יש ריצה פעילה, מראים אותה
    if (activeRoutePath && activeRoutePath.length > 0) return activeRoutePath;
    
    // 2. אם נבחר מסלול (נפתחה מגירה), מראים אותו
    if (selectedRoute?.path) return selectedRoute.path;

    // 3. אם המשתמש גולל בקרוסלה (פוקוס), מראים את המסלול שבמרכז
    if (currentFocusedRoute?.path) return currentFocusedRoute.path;
    
    // 4. ברירת מחדל: המסלול הראשון, רק כדי שהמפה לא תהיה ריקה
    if (routes.length > 0 && routes[0].path) return routes[0].path;
    
    return [];
  }, [activeRoutePath, selectedRoute, currentFocusedRoute, routes]);

  // הכנת הנתונים למפה (GeoJSON)
  const routeData: any = useMemo(() => ({
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: lineCoordinates 
    }
  }), [lineCoordinates]);

  // --- אפקט: מרכוז המפה על המסלול המוצג ---
  useEffect(() => {
    // רק אחרי שהמפה נטענה והקואורדינטות קיימות
    if (lineCoordinates.length > 0 && mapRef.current && mapLoaded) {
      const bounds = lineCoordinates.reduce((bounds, coord) => {
        return [
          Math.min(bounds[0], coord[0]),
          Math.min(bounds[1], coord[1]),
          Math.max(bounds[2], coord[0]),
          Math.max(bounds[3], coord[1])
        ];
      }, [Infinity, Infinity, -Infinity, -Infinity]);

      if (bounds[0] !== Infinity) {
        console.log('AppMap: Fitting bounds to route:', bounds);
        console.log('AppMap: Line coordinates sample (first 3):', lineCoordinates.slice(0, 3));
        
        // השתמש ב-flyTo או fitBounds - fitBounds עדיף
        mapRef.current.fitBounds(
          [
            [bounds[0], bounds[1]], // southwest
            [bounds[2], bounds[3]]  // northeast
          ],
          { 
            padding: { top: 150, bottom: 300, left: 50, right: 50 },
            duration: 1000,
            essential: true // Force this animation
          }
        );
      }
    }
  }, [lineCoordinates, mapLoaded]);

  // אפקט: כפוי התמקדות מיידית כשמסלולים נטענים
  useEffect(() => {
    if (routes.length > 0 && mapRef.current && mapLoaded) {
      const firstRoute = routes[0];
      if (firstRoute?.path && firstRoute.path.length > 0) {
        console.log('AppMap: Auto-focusing on first route immediately (routes loaded)');
        console.log('AppMap: First route path:', firstRoute.path.slice(0, 3), '...', firstRoute.path.length, 'points');
        
        const bounds = firstRoute.path.reduce((acc, coord) => {
          return {
            minLng: Math.min(acc.minLng, coord[0]),
            minLat: Math.min(acc.minLat, coord[1]),
            maxLng: Math.max(acc.maxLng, coord[0]),
            maxLat: Math.max(acc.maxLat, coord[1]),
          };
        }, {
          minLng: Infinity,
          minLat: Infinity,
          maxLng: -Infinity,
          maxLat: -Infinity,
        });

        if (bounds.minLng !== Infinity && bounds.minLng !== bounds.maxLng && bounds.minLat !== bounds.maxLat) {
          // כפו fitBounds מיידית - לא מחכים ל-interaction
          setTimeout(() => {
            if (mapRef.current) {
              mapRef.current.fitBounds(
                [
                  [bounds.minLng, bounds.minLat],
                  [bounds.maxLng, bounds.maxLat]
                ],
                {
                  padding: { top: 150, bottom: 350, left: 50, right: 50 },
                  duration: 1500,
                  essential: true
                }
              );
            }
          }, 300); // קצת delay כדי לוודא שהמפה מוכנה
        } else {
          // אם המסלול הוא נקודה אחת, פשוט נעקוב אחריה
          console.log('AppMap: Route is a single point, using flyTo');
          if (mapRef.current && firstRoute.path[0]) {
            mapRef.current.flyTo({
              center: [firstRoute.path[0][0], firstRoute.path[0][1]],
              zoom: 14,
              duration: 1500
            });
          }
        }
      }
    }
  }, [routes.length, mapLoaded]); // Trigger כשמסלולים נטענים או המפה מוכנה 

  // Debug logs
  console.log('AppMap: Rendering Map with routes:', routes.length);
  console.log('AppMap: First Route Coords:', routes[0]?.path);
  console.log('AppMap: lineCoordinates length:', lineCoordinates.length);
  console.log('AppMap: selectedRoute:', selectedRoute?.name);
  console.log('AppMap: currentFocusedRoute:', currentFocusedRoute?.name);
  console.log('AppMap: routeData:', routeData);

  return (
    <div className="w-full h-full relative">
      <Map
        ref={mapRef}
        initialViewState={{ longitude: 34.7818, latitude: 32.0853, zoom: 14 }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/light-v11" 
        mapboxAccessToken={MAPBOX_TOKEN}
        onLoad={() => { 
          console.log('AppMap: Map loaded');
          setMapLoaded(true);
          if (geoControlRef.current) geoControlRef.current.trigger(); 
        }}
        onClick={() => {
            setSelectedPark(null);
        }}
      >
        <GeolocateControl 
          ref={geoControlRef}
          trackUserLocation={true} 
          showUserHeading={true}
          positionOptions={{ enableHighAccuracy: true }}
          style={{ display: 'none' }}
        />

        {/* הצגת הפארקים */}
        {MOCK_PARKS.map((park) => (
          <Marker key={park.id} longitude={park.location.lng} latitude={park.location.lat}>
            <div 
              onClick={(e) => {
                e.stopPropagation();
                setSelectedPark(park); 
                mapRef.current?.flyTo({ center: [park.location.lng, park.location.lat], zoom: 16 });
              }}
              className="bg-white p-1.5 rounded-full shadow-md border border-gray-100 flex items-center justify-center cursor-pointer hover:scale-110 transition-transform group"
            >
              <span className="material-icons-round text-[#00E5FF] text-[18px] group-hover:text-blue-600">fitness_center</span>
            </div>
          </Marker>
        ))}

        {/* הצגת קו המסלול */}
        {lineCoordinates.length > 0 && (
          <Source id="routeSource" type="geojson" data={routeData}>
            <Layer
              id="routeLayer"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 
                'line-color': '#00C9F2', // Brand Turquoise
                'line-width': 5,
                'line-opacity': 0.9
              }}
            />
          </Source>
        )}
      </Map>
    </div>
  );
}
