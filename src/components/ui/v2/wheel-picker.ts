/**
 * WheelPicker (v2) — pure logic, unit-tested (see __tests__/wheel-picker.test.ts).
 * The component (WheelPicker.tsx) only wires these to scroll / key events.
 */

/** Default row height (px) and visible rows (odd — the middle row is the selection). */
export const WHEEL_ITEM_HEIGHT = 40;
export const WHEEL_VISIBLE_COUNT = 5;

export function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(index)));
}

/** The row sitting in the centre band for a given scrollTop (padding = the half-window above row 0). */
export function wheelIndexFromScroll(scrollTop: number, itemHeight: number, count: number): number {
  if (!(itemHeight > 0)) return 0;
  return clampIndex(scrollTop / itemHeight, count);
}

/** The scrollTop that centres row `index`. */
export function wheelScrollTop(index: number, itemHeight: number): number {
  return Math.max(0, index) * itemHeight;
}

/** Vertical padding so the first / last rows can reach the centre band. */
export function wheelPadding(itemHeight: number, visibleCount: number): number {
  return Math.floor(visibleCount / 2) * itemHeight;
}

/**
 * Keyboard → next index (spinbutton / listbox conventions). Returns null for
 * keys the wheel does not handle, so the caller leaves them alone.
 */
export function nextWheelIndex(key: string, index: number, count: number, page = 5): number | null {
  switch (key) {
    case 'ArrowUp': return clampIndex(index - 1, count);
    case 'ArrowDown': return clampIndex(index + 1, count);
    case 'PageUp': return clampIndex(index - page, count);
    case 'PageDown': return clampIndex(index + page, count);
    case 'Home': return 0;
    case 'End': return clampIndex(count - 1, count);
    default: return null;
  }
}

/** Index of `value` in the options, or 0 when it is missing (the wheel then shows row 0). */
export function wheelValueIndex<V>(values: readonly V[], value: V): number {
  const i = values.indexOf(value);
  return i < 0 ? 0 : i;
}
