/**
 * Map layer toggles (enable_map_polish_v1 adds "גינות כושר" / "מסלולים" to the
 * layers panel). Pure. A hidden Mapbox layer keeps its id (click handlers query
 * 'park-pins' / 'park-clusters' by id, and querying a missing layer throws) —
 * only its layout `visibility` flips. Visible → the layout object unchanged
 * (same reference), or one stable empty object when the layer has none.
 */

export type LayerLayout = Record<string, unknown>;

/**
 * Pilot AJ17: a visible layer with no layout gets this (one stable object), never `undefined`.
 * react-map-gl spreads its props into addLayer, so `layout: undefined` reaches Mapbox as a
 * present key, which rejects the whole layer ("layout: object expected, undefined found",
 * an 'error' event, not a throw). That silently dropped both park-cluster circle layers
 * since #663, leaving bare count numbers on the map.
 */
const EMPTY_LAYOUT: LayerLayout = Object.freeze({}) as LayerLayout;

export function withLayerVisibility<L extends LayerLayout | undefined>(layout: L, visible: boolean): LayerLayout | (LayerLayout & { visibility: 'none' }) {
  if (visible) return layout ?? EMPTY_LAYOUT;
  return { ...(layout ?? {}), visibility: 'none' };
}

/** A layer id from the panel is on (missing list → everything on, as before). */
export function isLayerOn(visibleLayers: readonly string[] | null | undefined, id: string): boolean {
  return !visibleLayers || visibleLayers.includes(id);
}
