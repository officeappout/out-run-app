/**
 * Simulated on-screen keyboard (pure). A headless browser has no soft keyboard, so the `keyboard`
 * tool shrinks the viewport by a phone keyboard's height (~40% of the screen, like iOS with the
 * suggestion bar) — the "resize" behaviour. It shows whether the focused field and its continue
 * button still fit above the keyboard; it does NOT reproduce iOS's visual-viewport overlay
 * (that stays a real-device check).
 */
export const KEYBOARD_SHARE = 0.4;

export function keyboardViewport(v: { width: number; height: number }): { width: number; height: number } {
  return { width: v.width, height: Math.max(200, v.height - Math.round(v.height * KEYBOARD_SHARE)) };
}
