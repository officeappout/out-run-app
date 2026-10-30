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

  /** A tap switched cards: the new centre card grows in from the side-card size. */
  const pulse = useCallback(() => {
    if (reduce) return;
    const { center } = parts();
    if (!center) return;
    const s = lookStyle(dragLook(0, rtl).easier);
    apply(center, s.transform, s.opacity, 'none');
    requestAnimationFrame(() => apply(center, '', '', SETTLE));
  }, [reduce, rtl, parts]);

  return { track, settle, pulse };
}
