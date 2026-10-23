/**
 * Map attribution helpers (legal compliance: ODbL / Mapbox ToS).
 *
 * Every user-facing Mapbox map rendering `streets-v12` (OpenStreetMap-derived
 * data) must show the style's attribution. The style's own sources already
 * carry "© Mapbox © OpenStreetMap", so we only need to SHOW the control in its
 * compact form (an "i" button) — never add a customAttribution on top (it
 * would duplicate the credit). Never pass `attributionControl={false}` on a
 * user-facing map.
 */

/** Space (px) to lift the bottom-right attribution above a full-width bottom panel. */
export const ATTRIBUTION_PANEL_LIFT_PX = 96;

/** Inline style for the compact attribution control, lifted when a bottom panel covers the map edge. */
export function attributionControlStyle(bottomPanelVisible: boolean): { marginBottom: number } {
  return { marginBottom: bottomPanelVisible ? ATTRIBUTION_PANEL_LIFT_PX : 0 };
}
