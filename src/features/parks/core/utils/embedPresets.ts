import type { MapEmbedPreset } from '../context/MapModeContext';

/**
 * Single source of truth for what a /embed/map preset unlocks. Every gate in
 * MapShell/DiscoverLayer/ParkDetailSheet checks `embedPreset` directly against
 * this table instead of hardcoding feature names — add a preset here first.
 */
const PRESET_FEATURES: Record<MapEmbedPreset, readonly string[]> = {
  route: ['browse', 'routeGeneration', 'realLocation'],
};

/** True when `preset` unlocks `feature`. `preset === null` (no embed) allows everything. */
export function presetAllows(preset: MapEmbedPreset | null, feature: string): boolean {
  if (!preset) return true;
  return PRESET_FEATURES[preset].includes(feature);
}
