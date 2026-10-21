/**
 * CoachMarks DOM helpers for screens whose header paints over scrolled content
 * (`data-coach-occluder`, e.g. the strength player's RunnerHeader). Pure math lives in
 * coach-placement.ts (coachScrollMarginTop / clipCoachBox); this file only reads the DOM.
 */
import { coachScrollMarginTop } from './coach-placement';

export const COACH_OCCLUDER_ATTR = 'data-coach-occluder';

/** Bottom (viewport px) of the visible header(s) covering `target`'s screen; null = none, or
 *  the target lives INSIDE a header (e.g. the progress bars) — then nothing occludes it. */
export function occluderBottomFor(target: HTMLElement): number | null {
  if (typeof document === 'undefined') return null;
  if (target.closest(`[${COACH_OCCLUDER_ATTR}]`)) return null;
  let bottom: number | null = null;
  document.querySelectorAll<HTMLElement>(`[${COACH_OCCLUDER_ATTR}]`).forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) bottom = Math.max(bottom ?? 0, r.bottom);
  });
  return bottom;
}

function scrollParentTop(el: HTMLElement): number {
  let p = el.parentElement;
  while (p) {
    const oy = window.getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p.getBoundingClientRect().top;
    p = p.parentElement;
  }
  return 0;
}

/**
 * Scroll the target into the clear area — below an occluding header when there is one — and
 * return a cleanup that restores the target's own scroll-margin-top.
 */
export function scrollCoachTargetIntoView(target: HTMLElement): () => void {
  const prev = target.style.scrollMarginTop;
  const occ = occluderBottomFor(target);
  if (occ != null) {
    target.style.scrollMarginTop = `${coachScrollMarginTop({ occluderBottom: occ, scrollerTop: scrollParentTop(target) })}px`;
  }
  target.scrollIntoView?.({ block: 'nearest' });
  return () => { target.style.scrollMarginTop = prev; };
}
