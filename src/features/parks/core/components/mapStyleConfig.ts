import mapboxgl from 'mapbox-gl';

export const ALLOWED_POI_CLASSES = new Set([
  'park', 'garden', 'playground', 'stadium', 'pitch',
  'swimming_pool', 'swimming-pool', 'sports_centre',
]);

/**
 * Prefixes belonging to our own react-map-gl layers — never touch these
 * when restyling the base map.
 */
const CUSTOM_LAYER_PREFIXES = [
  'park-cluster', 'park-pin', 'park-minor',
  'routes-',
  'live-path',
  'sim-walk',
];

function isOurLayer(id: string): boolean {
  return CUSTOM_LAYER_PREFIXES.some(p => id.startsWith(p));
}

/**
 * Fitness-focused map styling — nuclear POI cleanup, bright white/ice-blue
 * theme, lush green parks, sky-blue water, faded labels.
 *
 * Parks/Water fix: iterates ALL fill layers and checks `source-layer`
 * instead of guessing Mapbox layer IDs.
 */
export function applyFitnessMapStyle(map: mapboxgl.Map) {
  try {
    if (!map.isStyleLoaded()) return;
    const style = map.getStyle();
    if (!style?.layers) return;

    for (const layer of style.layers) {
      const id = layer.id;

      if (isOurLayer(id)) continue;

      // ── 1. NUCLEAR POI CLEANUP — whitelist only ──
      if (id.includes('poi') || id.includes('food') || id.includes('shop') || id.includes('business')) {
        try {
          map.setFilter(id, [
            'in', ['get', 'class'], ['literal', Array.from(ALLOWED_POI_CLASSES)],
          ]);
        } catch {
          try { map.setLayoutProperty(id, 'visibility', 'none'); } catch { /* */ }
        }
        continue;
      }

      // ── 2. FILL LAYERS — source-layer based coloring ──
      try {
        if (layer.type === 'fill') {
          const srcLayer: string = (layer as any)['source-layer'] ?? '';

          if (srcLayer === 'landuse' || srcLayer === 'landuse_overlay') {
            map.setPaintProperty(id, 'fill-color', [
              'match', ['get', 'class'],
              'park',          '#c8e6c9',
              'national_park', '#b2dfb0',
              'pitch',         '#c8e6c9',
              'playground',    '#d4edda',
              'garden',        '#d4edda',
              'wood',          '#d4edda',
              'grass',         '#e8f5e9',
              '#f5f5f5',
            ]);
            map.setPaintProperty(id, 'fill-opacity', [
              'match', ['get', 'class'],
              'park',          0.8,
              'national_park', 0.85,
              'pitch',         0.75,
              'playground',    0.7,
              'garden',        0.7,
              'wood',          0.65,
              'grass',         0.6,
              0.2,
            ]);
          } else if (srcLayer === 'water') {
            map.setPaintProperty(id, 'fill-color', '#7dd3fc');
            map.setPaintProperty(id, 'fill-opacity', 1);
          } else if (id === 'land') {
            map.setPaintProperty(id, 'fill-color', '#fafafa');
          } else if (id === 'landcover') {
            map.setPaintProperty(id, 'fill-color', '#f0fdf0');
            map.setPaintProperty(id, 'fill-opacity', 0.5);
          } else if (id === 'building' || id === 'building-outline') {
            map.setPaintProperty(id, 'fill-color', '#eeeeee');
            map.setPaintProperty(id, 'fill-opacity', 0.35);
          }
        }

        // Background layer (special type, not 'fill')
        if ((layer as any).type === 'background' && id === 'background') {
          map.setPaintProperty(id, 'background-color', '#fcfcfc');
        }

        // Waterway lines
        if (layer.type === 'line') {
          const srcLayer: string = (layer as any)['source-layer'] ?? '';
          if (srcLayer === 'waterway' || id === 'waterway') {
            map.setPaintProperty(id, 'line-color', '#7dd3fc');
          }
        }
      } catch { /* */ }

      // ── 3. ROADS — visible but subdued street grid ──
      try {
        if (id.startsWith('road') && !id.includes('label') && layer.type === 'line') {
          map.setPaintProperty(id, 'line-color', '#e2e8f0');
          map.setPaintProperty(id, 'line-opacity', 0.85);
        }
        if (id.startsWith('bridge') && layer.type === 'line') {
          map.setPaintProperty(id, 'line-color', '#e2e8f0');
          map.setPaintProperty(id, 'line-opacity', 0.6);
        }
        if (id.startsWith('tunnel') && layer.type === 'line') {
          map.setPaintProperty(id, 'line-opacity', 0.3);
        }
      } catch { /* */ }

      // ── 4. LABELS — subtle orientation ──
      try {
        if (layer.type === 'symbol') {
          const isRoadLabel = id.includes('road-label') || id.includes('path-label');
          const isPlaceLabel = id.startsWith('place-') || id.startsWith('settlement-') || id.includes('town') || id.includes('city');
          const isTransit = id.includes('transit') || id.includes('rail') || id.includes('ferry');

          if (isRoadLabel) {
            map.setPaintProperty(id, 'text-opacity', 0.4);
            map.setPaintProperty(id, 'text-color', '#c0c0c0');
          } else if (isPlaceLabel) {
            map.setPaintProperty(id, 'text-opacity', 0.55);
            map.setPaintProperty(id, 'text-color', '#9ca3af');
          } else if (isTransit) {
            map.setLayoutProperty(id, 'visibility', 'none');
          }
        }
      } catch { /* */ }
    }
  } catch (err) {
    console.warn('[FitnessMapStyle] Failed to apply:', err);
  }
}
