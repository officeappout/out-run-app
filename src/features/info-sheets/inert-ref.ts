/**
 * Marks a demo inert (no focus, no taps) — React 18 has no `inert` prop, so it is set on the
 * element directly. The demos are visual only; the steps under them carry the explanation.
 */
export function inertRef(el: HTMLElement | null): void {
  el?.setAttribute('inert', '');
}
