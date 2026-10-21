/**
 * Map layer toggles (enable_map_polish_v1 adds "גינות כושר" / "מסלולים" to the
 * layers panel). Pure. A hidden Mapbox layer keeps its id (click handlers query
 * 'park-pins' / 'park-clusters' by id, and querying a missing layer throws) —
 * only its layout `visibility` flips. Visible → the layout object unchanged
 * (same reference), so the default map stays byte-identical.
 */

export type LayerLayout = Record<string, unknown>;

export function withLayerVisibility<L extends LayerLayout | undefined>(layout: L, visible: boolean): L | (LayerLayout & { visibility: 'none' }) {
  if (visible) return layout;
  return { ...(layout ?? {}), visibility: 'none' };
}

/** A layer id from the panel is on (missing list → everything on, as before). */
export function isLayerOn(visibleLayers: readonly string[] | null | undefined, id: string): boolean {
  return !visibleLayers || visibleLayers.includes(id);
}
