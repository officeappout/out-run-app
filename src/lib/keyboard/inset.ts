/**
 * Pure keyboard-inset maths (no DOM access) — shared by the keyboard inset
 * controller (`keyboardInsetController.ts`) and unit-tested on its own.
 *
 * "Inset" = how many CSS px at the bottom of the LAYOUT viewport are covered
 * by the on-screen keyboard. `position: fixed` elements are laid out against
 * the layout viewport, so `bottom: var(--kb-inset)` puts them exactly on top
 * of the keyboard.
 */

/** Below this, a visualViewport shrink is browser chrome (URL bar, QuickType
 *  toggle on web Safari), not a keyboard. */
export const MIN_KEYBOARD_INSET_PX = 60;

export interface InsetInput {
  /** Keyboard height reported by the native Keyboard plugin (iOS shell), or
   *  null when we only have the web visualViewport to go on. */
  nativeKeyboardHeight: number | null;
  /** window.innerHeight — the layout viewport. */
  layoutHeight: number;
  /** visualViewport.height (falls back to layoutHeight when unsupported). */
  visualHeight: number;
  /** visualViewport.offsetTop — how far iOS panned the visual viewport. */
  visualOffsetTop: number;
}

function finite(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/**
 * Resolve the keyboard inset in CSS px (integer, ≥ 0).
 *
 * Native path: the keyboard's top edge in layout coordinates is
 * `layoutHeight - nativeHeight`; if iOS panned the visual viewport up by
 * `offsetTop`, fixed elements visually move up with it, so the needed lift is
 * `nativeHeight - offsetTop`.
 *
 * Web path: the keyboard's top edge is `offsetTop + visualHeight`, so the
 * covered part of the layout viewport is `layoutHeight - visualHeight -
 * offsetTop`. On Android (WebView itself resizes) this is ~0 — correct, the
 * layout viewport already ends at the keyboard.
 */
export function resolveKeyboardInset(input: InsetInput): number {
  const offsetTop = Math.max(0, finite(input.visualOffsetTop));
  if (input.nativeKeyboardHeight !== null) {
    const native = Math.max(0, finite(input.nativeKeyboardHeight));
    if (native === 0) return 0;
    return Math.max(0, Math.round(native - offsetTop));
  }
  const raw = finite(input.layoutHeight) - finite(input.visualHeight) - offsetTop;
  if (raw < MIN_KEYBOARD_INSET_PX) return 0;
  return Math.round(raw);
}

export interface RevealInput {
  /** Focused element's rect (viewport coordinates). */
  elTop: number;
  elBottom: number;
  /** Scroll container's rect (viewport coordinates). */
  containerTop: number;
  containerBottom: number;
  /** window.innerHeight. */
  layoutHeight: number;
  /** Current keyboard inset. */
  inset: number;
  /** Breathing room kept around the element. */
  margin?: number;
}

/**
 * How far (px, signed) a scroll container must scroll so the focused element
 * sits in the middle of the part of the container that is NOT under the
 * keyboard. Returns 0 when the element is already comfortably visible, so a
 * focus change between two visible fields never moves anything.
 */
export function computeRevealDelta(input: RevealInput): number {
  const margin = input.margin ?? 16;
  const viewTop = Math.max(input.containerTop, 0);
  const viewBottom = Math.min(input.containerBottom, input.layoutHeight - Math.max(0, input.inset));
  if (viewBottom - viewTop <= 0) return 0;

  const fullyVisible =
    input.elTop >= viewTop + margin && input.elBottom <= viewBottom - margin;
  if (fullyVisible) return 0;

  const elHeight = input.elBottom - input.elTop;
  const viewHeight = viewBottom - viewTop;
  // Taller than the visible area (e.g. a big textarea): align its top.
  if (elHeight + margin * 2 >= viewHeight) {
    return Math.round(input.elTop - (viewTop + margin));
  }
  const elCenter = (input.elTop + input.elBottom) / 2;
  const viewCenter = (viewTop + viewBottom) / 2;
  return Math.round(elCenter - viewCenter);
}

/** Input types that do NOT open a text keyboard. */
const NON_TEXT_INPUT_TYPES = new Set([
  'button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit',
]);

/** Whether focusing an element with this tag/type opens a text keyboard. */
export function opensKeyboard(tagName: string, type: string | null, isContentEditable: boolean, readOnly = false): boolean {
  if (readOnly) return false;
  if (isContentEditable) return true;
  const tag = tagName.toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag !== 'INPUT') return false;
  return !NON_TEXT_INPUT_TYPES.has((type ?? 'text').toLowerCase());
}

/**
 * Whether a change of the keyboard inset should re-reveal the focused field
 * once the keyboard settles. True when the keyboard opens AND when an already
 * open keyboard grows — e.g. the birth-year field (iOS number pad) auto-
 * advancing to the name field (taller text keyboard + QuickType bar): the
 * focus-time reveal ran against the shorter pad, so the name field would end
 * up under the taller keyboard. Shrinking / closing never moves anything.
 */
export function insetChangeNeedsReveal(prevInset: number, nextInset: number): boolean {
  const prev = Math.max(0, finite(prevInset));
  const next = Math.max(0, finite(nextInset));
  return next > 0 && next > prev;
}
