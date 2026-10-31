'use client';

import { useCallback, useRef, type RefObject } from 'react';
import { dragLook, lookStyle, SETTLE_MS, type CardLook } from './carousel-drag';

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const SETTLE = `transform ${SETTLE_MS}ms ${EASE}, opacity ${SETTLE_MS}ms ${EASE}`;

function apply(el: HTMLElement | null, transform: string, opacity: string, transition: string) {
  if (!el) return;
  el.style.transition = transition;
  el.style.transform = transform;
  el.style.opacity = opacity;
}

/**
 * AD6: drives the slider's card-switch look straight on the DOM (no re-render per pointer move).
 * `track(dx)` while the finger moves, `settle()` when it lifts, `pulse()` after a tap on a side card.
 * Reduced motion: all three do nothing; the cards just swap.
 */
export function useCarouselDrag(
  cardsRef: RefObject<HTMLElement | null>,
  rowRef: RefObject<HTMLElement | null>,
  rtl: boolean,
  reduce: boolean,
) {
  const frame = useRef<number | null>(null);

  const parts = useCallback(() => {
    const root = cardsRef.current;
    return {
      row: rowRef.current,
      center: root?.querySelector<HTMLElement>('[data-center-card]') ?? null,
      easier: root?.querySelector<HTMLElement>('[data-side-card="easier"]') ?? null,
      harder: root?.querySelector<HTMLElement>('[data-side-card="harder"]') ?? null,
    };
  }, [cardsRef, rowRef]);

  const track = useCallback((dx: number) => {
    if (reduce) return;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const p = parts();
      const l = dragLook(dx, rtl);
      const set = (el: HTMLElement | null, c: CardLook) => {
        const s = lookStyle(c);
        apply(el, s.transform, s.opacity, 'none');
      };
      apply(p.row, `translateX(${l.rowX}px)`, '', 'none');
      set(p.center, l.center);
      set(p.easier, l.easier);
      set(p.harder, l.harder);
    });
  }, [reduce, rtl, parts]);

  /** Back to the resting look (the classes), animated. */
  const settle = useCallback(() => {
    if (reduce) return;
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; }
    const p = parts();
    for (const el of [p.row, p.center, p.easier, p.harder]) apply(el, '', '', SETTLE);
  }, [reduce, parts]);

  /**
   * A swipe switched cards (AH9: it used to jump). Called right before the selection changes: it
   * measures how far the incoming side card sits from the centre, then, once React has swapped the
   * cards, starts the row from where that card visually was and slides it to rest, so the card the
   * finger pulled in keeps moving instead of popping into the middle.
   */
  const commit = useCallback((dx: number) => {
    if (reduce) return;
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; }
    const before = parts();
    const towardEnd = rtl ? dx < 0 : dx > 0;
    const incoming = towardEnd ? before.easier : before.harder;
    const c = before.center?.getBoundingClientRect();
    const s = incoming?.getBoundingClientRect();
    if (!c || !s) { settle(); return; }
    const offset = (s.left + s.width / 2) - (c.left + c.width / 2) + dragLook(dx, rtl).rowX;
    const grownFrom = lookStyle(dragLook(dx, rtl)[towardEnd ? 'easier' : 'harder']);
    requestAnimationFrame(() => {
      const p = parts();
      apply(p.row, `translateX(${offset}px)`, '', 'none');
      apply(p.center, grownFrom.transform, grownFrom.opacity, 'none');
      for (const el of [p.easier, p.harder]) apply(el, '', '', 'none');
      requestAnimationFrame(() => { for (const el of [p.row, p.center]) apply(el, '', '', SETTLE); });
    });
  }, [reduce, rtl, parts, settle]);

  /** A tap switched cards: the new centre card grows in from the side-card size. */
  const pulse = useCallback(() => {
    if (reduce) return;
    const { center } = parts();
    if (!center) return;
    const s = lookStyle(dragLook(0, rtl).easier);
    apply(center, s.transform, s.opacity, 'none');
    requestAnimationFrame(() => apply(center, '', '', SETTLE));
  }, [reduce, rtl, parts]);

  return { track, settle, pulse, commit };
}
