import mapboxgl from 'mapbox-gl';

// ── Fitness-relevant POI classes to preserve ─────────────────────────────────
// All other POI layers are hidden. Water fountains and toilets are rendered as
// React <Marker> components by AppMap, so they don't need base-map coverage.
export const ALLOWED_POI_CLASSES = new Set([
  'park', 'garden', 'playground', 'stadium', 'pitch',
  'swimming_pool', 'swimming-pool', 'sports_centre',
]);

// ── Exact layer IDs confirmed by the diagnostic audit (streets-v12) ──────────
// These are the literal layer IDs returned by map.getStyle().layers on the
// streets-v12 style. Using exact IDs is safer than pattern-matching because
// it won't accidentally catch unrelated layers in future style updates.
const HIDE_EXACT: ReadonlySet<string> = new Set([
  'poi-label',         // all POI icon + text (commercial, food, amenity, etc.)
  'transit-label',     // bus stops, metro stations, tram stops
  'road-label-small',  // residential / service / alley names
  'road-label-minor',  // secondary minor roads (variant ID in some tile versions)
  'street-label',      // pedestrian-street names
]);

// ── Layer ID substrings that reliably identify noise layers ──────────────────
// Used as a second-pass safety net for renamed / versioned layer IDs.
const HIDE_PATTERNS: readonly string[] = [
  '-poi',              // catches poi-label-* variants
  'amenity-',          // amenity icon layers
  'pedestrian-polygon',// pedestrian-area fill labels
];

// ── Nuclear label-keep list ─────────────────────────────────────────────────
// During the nuclear pass we walk EVERY layer in the live style and hide
// anything with `label` in its ID UNLESS the ID also contains one of these
// tokens. This is intentionally permissive — runners benefit from:
//   • park / natural  — green labels for orientation
//   • water / waterway — river / sea labels
//   • place           — city / neighbourhood names
//   • road            — major-road labels (already filtered + muted in the
//                       per-layer iteration; we don't want the nuclear pass
//                       to undo that work by hiding them outright)
// Anything else (poi-label, transit-label, building-label, address-label,
// the streets-v12 "settlement-subdivision-label" oddities, etc.) gets
// hidden. This is the catch-all that keeps the map clean even when Mapbox
// renames a layer in a future style version.
const NUCLEAR_LABEL_KEEP_TOKENS: readonly string[] = [
  'park',
  'natural',
  'water',
  'waterway',
  'place',
  'road',
];

// ── Road classes worth labelling for runner orientation ──────────────────────
// Motorway → tertiary: visible arteries that help runners know their area.
// Residential / service / track / path / ferry: hidden — pure noise.
const MAJOR_ROAD_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'];

// ── Our own GeoJSON layer prefixes — never touch these ───────────────────────
const CUSTOM_LAYER_PREFIXES: readonly string[] = [
  'park-cluster', 'park-pin', 'park-minor',
  'routes-',
  'live-path',
  'ghost-path',
  'walk-to-route',
  'sim-walk',
  'presence-',
];

function isOurLayer(id: string): boolean {
  return CUSTOM_LAYER_PREFIXES.some(p => id.startsWith(p));
}

function shouldHideByPattern(id: string): boolean {
  return HIDE_PATTERNS.some(p => id.includes(p));
}

/**
 * Applies runner-focused declutter on top of the streets-v12 base style.
 *
 * Called from AppMap.tsx via rawMap.on('style.load', runDeclutter) — guaranteed
 * to fire only after the style is fully parsed (timing fix).
 *
 * What changes:
 *   1. POI & transit   — hidden completely (exact IDs + pattern pass)
 *   2. Road labels     — minor roads hidden; major roads filtered + muted
 *   3. Nature fills    — parks vivid green, water sky-blue
 *   4. Custom layers   — never touched
 *
 * What does NOT change:
 *   Land, roads, buildings, place labels — streets-v12 defaults are clean.
 */
export function applyFitnessMapStyle(map: mapboxgl.Map, source = 'unknown') {
  // ── PROOF-OF-LIFE LOG ────────────────────────────────────────────────────
  // If these lines do not appear in the browser console after a full refresh,
  // the bundler is serving stale code (clear .next cache or hard-reload).
  //
  // The `source` tag lets us see WHICH of the four call paths fired —
  // useful for confirming the declutter actually runs (David's audit
  // request). Expected on first load: a sequence like
  //   declutter:request source=style.load
  //   declutter:request source=watchdog (skipped, already done)
  //   declutter:request source=idle-safety (skipped, already done)
  console.log(`[Map] declutter:request source=${source}`);
  console.log('!!! MAP CLEANUP STARTING !!!');

  try {
    if (!map.isStyleLoaded()) {
      console.warn(`[FitnessMapStyle] Aborted — style not loaded (source=${source})`);
      return;
    }
    const style = map.getStyle();
    if (!style?.layers) return;

    // ── PASS 0: HARDCODED VISIBILITY KILL-LIST ───────────────────────────
    // Brute-force first pass — bypass the iteration logic entirely. If the
    // layer exists, hide it. No filters, no pattern matching, no conditions.
    // This guarantees the user-visible declutter even if the iteration logic
    // below has a regression.
    const HARD_HIDE_IDS = [
      'poi-label',
      'transit-label',
      'road-label-small',
      'road-label-minor',
      'street-label',
    ];
    let hardHiddenCount = 0;
    for (const id of HARD_HIDE_IDS) {
      if (map.getLayer(id)) {
        try {
          map.setLayoutProperty(id, 'visibility', 'none');
          hardHiddenCount++;
        } catch (err) {
          console.warn(`[FitnessMapStyle] Failed to hide ${id}:`, err);
        }
      }
    }
    console.log(`[FitnessMapStyle] Hard-hide pass: ${hardHiddenCount}/${HARD_HIDE_IDS.length} target layers hidden`);

    // ── PASS 0.5: NUCLEAR LABEL SWEEP ────────────────────────────────────
    // The hardcoded HARD_HIDE_IDS only covers the 5 layer names known to
    // exist on streets-v12 today. Any future Mapbox style update that
    // renames or splits a label layer (e.g. `poi-label` → `poi-label-1`,
    // `poi-label-2`) leaves leftover noise on the map. This pass is the
    // catch-all: walk EVERY layer, hide anything with `label` in its ID
    // unless the ID matches a token in NUCLEAR_LABEL_KEEP_TOKENS.
    // Skips our own GeoJSON layers via `isOurLayer`.
    let nuclearHiddenCount = 0;
    let nuclearKeptCount = 0;
    for (const layer of style.layers) {
      const id = layer.id;
      if (!id.includes('label')) continue;
      if (isOurLayer(id)) continue;

      const shouldKeep = NUCLEAR_LABEL_KEEP_TOKENS.some(t => id.includes(t));
      if (shouldKeep) {
        nuclearKeptCount++;
        continue;
      }
      try {
        map.setLayoutProperty(id, 'visibility', 'none');
        nuclearHiddenCount++;
      } catch (err) {
        console.warn(`[FitnessMapStyle] Nuclear sweep failed to hide ${id}:`, err);
      }
    }
    console.log(
      `[FitnessMapStyle] Nuclear sweep: hid ${nuclearHiddenCount} stray label layers ` +
      `(kept ${nuclearKeptCount} matching ${NUCLEAR_LABEL_KEEP_TOKENS.join('/')})`,
    );

    for (const layer of style.layers) {
      const id = layer.id;

      // Never touch our own GeoJSON / route layers
      if (isOurLayer(id)) continue;

      // ── 1. POI & TRANSIT — exact hits ────────────────────────────────────
      if (HIDE_EXACT.has(id)) {
        try { map.setLayoutProperty(id, 'visibility', 'none'); } catch { /* */ }
        continue;
      }

      // ── 2. POI & TRANSIT — pattern pass (catches variant IDs) ────────────
      if (shouldHideByPattern(id)) {
        try { map.setLayoutProperty(id, 'visibility', 'none'); } catch { /* */ }
        continue;
      }

      // ── 3. ROAD LABELS ───────────────────────────────────────────────────
      if (layer.type === 'symbol') {
        const isRoadLabel  = id === 'road-label' || id.includes('road-label');
        const isPathLabel  = id.includes('path-label') || id.includes('track-label');
        const isTransit    = id.includes('transit') || id.includes('rail') || id.includes('ferry');

        if (isTransit) {
          try { map.setLayoutProperty(id, 'visibility', 'none'); } catch { /* */ }
          continue;
        }

        if (isPathLabel) {
          try { map.setLayoutProperty(id, 'visibility', 'none'); } catch { /* */ }
          continue;
        }

        if (isRoadLabel) {
          // Filter the road-label layer to major classes only — residential /
          // service / track labels vanish without removing major-road names.
          try {
            map.setFilter(id, [
              'in', ['get', 'class'], ['literal', MAJOR_ROAD_CLASSES],
            ]);
          } catch { /* filter incompatible with this tile version — opacity muting is enough */ }
          // Mute to light grey so labels don't compete with the route line.
          try { map.setPaintProperty(id, 'text-opacity', 0.30); } catch { /* */ }
          try { map.setPaintProperty(id, 'text-color', '#888888'); } catch { /* */ }
          continue;
        }
      }

      // ── 4. NATURE FILLS — parks green, water blue ────────────────────────
      try {
        if (layer.type === 'fill') {
          const srcLayer: string = (layer as any)['source-layer'] ?? '';

          if (srcLayer === 'landuse' || srcLayer === 'landuse_overlay') {
            // The trailing branch of every `match` MUST be a hardcoded
            // value. The previous default `['get', 'fill-color']` reached
            // into per-feature paint props that don't exist on streets-v12
            // → Mapbox got `null` and logged "Could not parse color from
            // value 'null'" on every render. Use a transparent neutral
            // grey for non-matching land classes so unrecognised classes
            // simply don't tint the map (rather than crashing the parser).
            map.setPaintProperty(id, 'fill-color', [
              'match', ['get', 'class'],
              'park',          '#c8e6c9',
              'national_park', '#b2dfb0',
              'pitch',         '#c8e6c9',
              'playground',    '#d4edda',
              'garden',        '#d4edda',
              'wood',          '#d4edda',
              'grass',         '#e8f5e9',
              'rgba(0,0,0,0)', // safe transparent fallback (never null)
            ]);
            map.setPaintProperty(id, 'fill-opacity', [
              'match', ['get', 'class'],
              'park',          0.75,
              'national_park', 0.80,
              'pitch',         0.70,
              'playground',    0.65,
              'garden',        0.65,
              'wood',          0.60,
              'grass',         0.55,
              0.0,
            ]);
          } else if (srcLayer === 'water') {
            map.setPaintProperty(id, 'fill-color', '#7dd3fc');
            map.setPaintProperty(id, 'fill-opacity', 1);
          }
          // land, landcover, building — left at streets-v12 defaults.
        }

        // Waterway lines — match the water fill colour
        if (layer.type === 'line') {
          const srcLayer: string = (layer as any)['source-layer'] ?? '';
          if (srcLayer === 'waterway') {
            map.setPaintProperty(id, 'line-color', '#7dd3fc');
          }
        }
      } catch { /* */ }
    }

    console.log(`[Map] Declutter complete (source=${source}): Minor roads hidden, POIs removed.`);
  } catch (err) {
    console.warn(`[FitnessMapStyle] Failed to apply (source=${source}):`, err);
  }
}
