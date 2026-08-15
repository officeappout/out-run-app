/**
 * Mapbox layer paint, layout & filter definitions — extracted from AppMap
 * so the component file stays lean and these configs are easy to tweak.
 */

// ═══════════════════════════════════════════════════════════════════
// ROUTE LAYERS
// ═══════════════════════════════════════════════════════════════════

const ROUTE_LINE_LAYOUT = {
  'line-join': 'round' as const,
  'line-cap': 'round' as const,
};

export const ROUTES_BACKGROUND = {
  paint: {
    'line-color': '#94a3b8',
    'line-width': 5,
    'line-opacity': 1,
  },
  layout: ROUTE_LINE_LAYOUT,
};

export const ROUTES_ACTIVE_GLOW = {
  filter: ['==', ['get', 'isFocused'], true] as any,
  paint: {
    'line-color': '#00E5FF',
    'line-width': 20,
    'line-opacity': 0.25,
    'line-blur': 14,
  },
  layout: ROUTE_LINE_LAYOUT,
};

// 15.08.2026 route-styling batch: casing strengthened (11→12px) and the
// colored core made slightly thinner (7→6px) — a clearer white border +
// core ratio, Google/Strava-style, so the modality color (see AppMap.tsx's
// routesActivePaint/routesGlowPaint) reads cleanly against the light
// basemap without needing a separate dark-edge layer.
export const ROUTES_ACTIVE_OUTLINE = {
  filter: ['==', ['get', 'isFocused'], true] as any,
  paint: {
    'line-color': '#ffffff',
    'line-width': 12,
    'line-opacity': 0.95,
  },
  layout: ROUTE_LINE_LAYOUT,
};

export const ROUTES_ACTIVE = {
  filter: ['==', ['get', 'isFocused'], true] as any,
  paint: {
    // Overridden per-focused-route by modality (aerobic/strength) in
    // AppMap.tsx's routesActivePaint — this default only applies before a
    // route is focused / as a structural fallback.
    'line-color': '#00E5FF',
    'line-width': 6,
    'line-opacity': 1,
  },
  layout: ROUTE_LINE_LAYOUT,
};

// ═══════════════════════════════════════════════════════════════════
// ACTIVE WORKOUT PATH LAYERS
// ═══════════════════════════════════════════════════════════════════

// ── GHOST PATH — the planned route still ahead (the goal) ──────────
// Vibrant cyan at full opacity, rendered ON TOP of the trace.
export const GHOST_PATH_GLOW = {
  paint: {
    'line-color': '#00E5FF',
    'line-width': 26,
    'line-opacity': 0.18,
    'line-blur': 16,
  },
  layout: ROUTE_LINE_LAYOUT,
};

export const GHOST_PATH_LINE = {
  paint: {
    'line-color': '#00E5FF',
    'line-width': 7,
    'line-opacity': 1.0,
  },
  layout: ROUTE_LINE_LAYOUT,
};

// ── TRACE PATH — where the user has already been (the history) ─────
// Faint slate-blue, no glow, rendered BELOW the ghost path.
export const TRACE_PATH_LINE = {
  paint: {
    'line-color': '#7dd3fc', // sky-300 — cool, subtle
    'line-width': 5,
    'line-opacity': 0.28,
  },
  layout: ROUTE_LINE_LAYOUT,
};

// ── FREE-RUN FADING TRAIL — live trail when there is NO planned route ─
// line-gradient over line-progress: 0 = oldest sample → 1 = newest, so the
// trail reads as a comet tail (new segment bright → old transparent).
// REQUIRES lineMetrics: true on the 'live-path' Source — without it Mapbox
// silently ignores line-gradient. Alpha lives in the gradient stops, so no
// line-opacity here (they multiply).
export const TRAIL_FADE_LINE = {
  paint: {
    'line-gradient': [
      'interpolate', ['linear'], ['line-progress'],
      0,    'rgba(0, 229, 255, 0)',
      0.55, 'rgba(0, 229, 255, 0.35)',
      1,    'rgba(0, 229, 255, 0.95)',
    ],
    'line-width': 5,
  },
  layout: ROUTE_LINE_LAYOUT,
};

// ── ROUTE PASSED SLICE — the planned-route part already behind the user ─
// Faded gray drawn under the bright ghost-path (the remaining slice), same
// width family so the split point reads as one continuous line.
export const ROUTE_PASSED_LINE = {
  paint: {
    'line-color': '#9aa3a1',
    'line-width': 5,
    'line-opacity': 0.45,
  },
  layout: ROUTE_LINE_LAYOUT,
};

// ── OFF-ROUTE CONNECTOR — dashed link from the user back to the route ──
// Mounted only while isOffRoute: ties the live position to the route split
// point so the map explains where the planned line continues.
export const ROUTE_DEVIATION_LINE = {
  paint: {
    'line-color': '#9aa3a1',
    'line-width': 3,
    'line-opacity': 0.8,
    'line-dasharray': [2, 2],
  },
  layout: ROUTE_LINE_LAYOUT,
};

// ── Legacy live-path paint kept for zone-coloured planned runs ──────
// ⚠️ The 'live-path' source now has lineMetrics: true (for TRAIL_FADE_LINE).
// Do NOT add a line-gradient to these zone paints: the zone GeoJSON is
// multi-feature, and line-progress restarts at 0 on every feature — a
// gradient here would visibly reset at each zone boundary.
export const LIVE_PATH_OUTLINE = {
  paint: {
    'line-color': '#ffffff',
    'line-width': 9,
    'line-opacity': 0.6,
  },
};

export function getLivePathPaint(hasZones: boolean) {
  return {
    'line-color': hasZones
      ? [
          'match',
          ['get', 'zoneType'],
          'sprint',         '#DC2626',
          'interval_short', '#E11D48',
          'interval_long',  '#0D9488',
          'fartlek_fast',   '#0D9488',
          'tempo',          '#0891B2',
          'fartlek_medium', '#F59E0B',
          'long_run',       '#10B981',
          'easy',           '#34D399',
          'jogging',        '#6EE7B7',
          'recovery',       '#60A5FA',
          'walk',           '#9CA3AF',
          '#2563eb',
        ]
      : '#2563eb',
    'line-width': 6,
    'line-opacity': 1,
  };
}

// ═══════════════════════════════════════════════════════════════════
// SIM WALK TRAIL (debug)
// ═══════════════════════════════════════════════════════════════════

export const SIM_WALK_TRAIL = {
  paint: {
    'line-color': '#f97316',
    'line-width': 4,
    'line-opacity': 0.8,
    'line-dasharray': [2, 2],
  },
  layout: ROUTE_LINE_LAYOUT,
};

// ═══════════════════════════════════════════════════════════════════
// PARK CLUSTER LAYERS
// ═══════════════════════════════════════════════════════════════════

const CLUSTER_FILTER = [
  'all',
  ['has', 'point_count'],
  ['>', ['coalesce', ['get', 'point_count'], 0], 0],
] as any;

export const PARK_CLUSTERS_GLOW = {
  filter: CLUSTER_FILTER,
  paint: {
    'circle-color': '#06b6d4',
    'circle-radius': ['step', ['coalesce', ['get', 'point_count'], 0], 28, 10, 34, 30, 42],
    'circle-opacity': 0.15,
    'circle-blur': 1,
  },
};

export const PARK_CLUSTERS = {
  filter: CLUSTER_FILTER,
  paint: {
    'circle-color': ['step', ['coalesce', ['get', 'point_count'], 0],
      '#06b6d4', 10, '#0891b2', 30, '#0e7490',
    ],
    'circle-radius': ['step', ['coalesce', ['get', 'point_count'], 0],
      18, 10, 22, 30, 28,
    ],
    'circle-opacity': 0.92,
    'circle-stroke-width': 3,
    'circle-stroke-color': 'rgba(255,255,255,0.85)',
  },
};

export const PARK_PINS = {
  filter: ['all', ['!', ['has', 'point_count']], ['!', ['get', 'isMinor']]] as any,
  minzoom: 10,
  layout: {
    'icon-image': ['case', ['get', 'isFunctional'], 'pin-functional', 'pin-default'],
    'icon-size': 1,
    'icon-anchor': 'bottom' as const,
    'icon-allow-overlap': true,
  },
};

export const PARK_MINOR_PINS = {
  filter: ['all', ['!', ['has', 'point_count']], ['get', 'isMinor']] as any,
  minzoom: 15,
  layout: {
    'icon-image': 'pin-minor',
    'icon-size': 0.85,
    'icon-anchor': 'bottom' as const,
    'icon-allow-overlap': true,
  },
};

export const PARK_CLUSTER_COUNT = {
  filter: ['has', 'point_count'] as any,
  layout: {
    'text-field': ['to-string', ['coalesce', ['get', 'point_count'], 0]],
    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
    'text-size': 15,
    'text-anchor': 'center' as const,
    'text-allow-overlap': true,
    'text-ignore-placement': true,
  },
  paint: {
    'text-color': '#ffffff',
    'text-halo-color': 'rgba(0,0,0,0.15)',
    'text-halo-width': 1,
  },
};
