'use client';

/**
 * ParkCoachAnchor — one invisible DOM marker on the park pin nearest the screen centre, so the
 * map tour's "פארקים" step points at a real park (see park-coach-anchor.ts). Rendered by AppMap
 * inside <Map> only while a tour asks for it; pointer-events none, aria-hidden, no visuals.
 * Re-picks the pin when the camera settles; no pin rendered → no anchor (the step is dropped).
 */
import { useEffect, useState } from 'react';
import { Marker, useMap } from 'react-map-gl';
import { nearestToCenter } from './park-coach-anchor';

const PIN_LAYER = 'park-pins';
const RETRY_MS = 500;
const MAX_TRIES = 12;

export default function ParkCoachAnchor() {
  const { current: mapRef } = useMap();
  const [spot, setSpot] = useState<{ lng: number; lat: number } | null>(null);

  useEffect(() => {
    const map = mapRef?.getMap?.();
    if (!map) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pick = () => {
      if (!map.getLayer?.(PIN_LAYER)) return false;
      const features = map.queryRenderedFeatures(undefined, { layers: [PIN_LAYER] });
      const canvas = map.getCanvas();
      const center = { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
      const items = features
        .filter((f) => f.geometry?.type === 'Point')
        .map((f) => {
          const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
          return { lng, lat, point: map.project([lng, lat]) };
        });
      const best = nearestToCenter(items, center);
      if (best) setSpot({ lng: best.lng, lat: best.lat });
      return !!best;
    };
    const retry = () => {
      if (pick() || ++tries >= MAX_TRIES) return;
      timer = setTimeout(retry, RETRY_MS);
    };
    retry();
    const onIdle = () => { pick(); };
    map.on('moveend', onIdle);
    return () => {
      if (timer) clearTimeout(timer);
      map.off('moveend', onIdle);
    };
  }, [mapRef]);

  if (!spot) return null;
  return (
    <Marker longitude={spot.lng} latitude={spot.lat} anchor="bottom">
      <div data-coach="map-park" aria-hidden className="pointer-events-none" style={{ width: 40, height: 48 }} />
    </Marker>
  );
}
