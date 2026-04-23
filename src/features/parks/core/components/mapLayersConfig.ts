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

export const ROUTES_ACTIVE_OUTLINE = {
  filter: ['==', ['get', 'isFocused'], true] as any,
  paint: {
    'line-color': '#ffffff',
    'line-width': 11,
    'line-opacity': 0.95,
  },
  layout: ROUTE_LINE_LAYOUT,
};

export const ROUTES_ACTIVE = {
  filter: ['==', ['get', 'isFocused'], true] as any,
  paint: {
    'line-color': '#00E5FF',
    'line-width': 7,
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

// ── Legacy live-path paint kept for zone-coloured planned runs ──────
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
