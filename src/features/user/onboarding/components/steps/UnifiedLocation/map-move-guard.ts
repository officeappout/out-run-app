/**
 * Was this map camera event caused by the user's own gesture?
 *
 * Mapbox GL attaches `originalEvent` (the DOM mouse/touch/wheel/key event)
 * to movestart/moveend fired by its gesture handlers — drag, inertia,
 * scroll/pinch zoom, double-tap, keyboard. Programmatic camera moves —
 * fitBounds on the hero route, flyTo/easeTo, and the jumpTo react-map-gl
 * performs when the controlled `viewState` changes (GPS fix, precise
 * refinement, city pick) — carry no `originalEvent`.
 *
 * Only user moves may re-pin the location to the map centre; otherwise the
 * hero-route fitBounds lands on the route's bounding-box centre and the saved
 * location drifts away from the GPS fix.
 */
export function isUserCameraMove(evt?: { originalEvent?: unknown } | null): boolean {
  return !!evt?.originalEvent;
}
