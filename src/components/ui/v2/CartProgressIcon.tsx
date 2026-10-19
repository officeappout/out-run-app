'use client';

/**
 * CartProgressIcon — the "shopping cart" list button of the v2 live players.
 * A list icon inside a progress ring with one segment per session-list item
 * (coloured by block type, done = solid, rest = tint) and a small black
 * badge with the number of completed items. When the count grows, the
 * badge pops and a "+1" floats up — the "item dropped into the cart" hint
 * from board F-1d. Tapping it opens the session list (the layer behind).
 */

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cartDoneCount, cartRingSegments, type CartRingItem } from './cart-ring';

export interface CartProgressIconProps {
  items: readonly CartRingItem[];
  onClick?: () => void;
  /** Accessible name; defaults to "רשימת האימון · N הושלמו". */
  ariaLabel?: string;
  /** Outer box in px (ring included). Default 54 (≥ 44 touch target). */
  size?: number;
  className?: string;
}

export default function CartProgressIcon({ items, onClick, ariaLabel, size = 54, className = '' }: CartProgressIconProps) {
  const stroke = size >= 50 ? 4.5 : 3.5;
  const segments = cartRingSegments(items, { size, stroke });
  const done = cartDoneCount(items);

  // "+1" drop hint whenever the done count grows (never on first render).
  const prevDone = useRef(done);
  const [dropKey, setDropKey] = useState<number | null>(null);
  useEffect(() => {
    if (done > prevDone.current) setDropKey(Date.now());
    prevDone.current = done;
  }, [done]);
  useEffect(() => {
    if (dropKey === null) return;
    const t = setTimeout(() => setDropKey(null), 1100);
    return () => clearTimeout(t);
  }, [dropKey]);

  const inset = Math.round(size * 0.15);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? `רשימת האימון · ${done} הושלמו`}
      className={`relative shrink-0 active:scale-[0.97] transition-transform duration-150 ease-v2 ${className}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="absolute inset-0">
        {segments.map((s, i) => (
          <path
            key={i}
            d={s.d}
            fill="none"
            stroke={s.color}
            strokeOpacity={s.opacity}
            strokeWidth={stroke}
            strokeLinecap="round"
            style={{ transition: 'stroke-opacity 450ms cubic-bezier(0.23, 1, 0.32, 1)' }}
          />
        ))}
      </svg>
      <span
        className="absolute grid place-items-center rounded-full bg-white shadow-v2-ring"
        style={{ inset }}
      >
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#343434" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 6h12M9 12h12M9 18h12" />
          <circle cx="4" cy="6" r="1" fill="currentColor" />
          <circle cx="4" cy="12" r="1" fill="currentColor" />
          <circle cx="4" cy="18" r="1" fill="currentColor" />
        </svg>
      </span>
      {done > 0 && (
        <motion.span
          key={done}
          initial={{ scale: dropKey ? 1.45 : 1 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          className="absolute -bottom-1 -left-1 grid h-[21px] min-w-[21px] place-items-center rounded-full bg-v2-ink px-[5px] text-[11px] font-black tabular-nums text-white"
          style={{ boxShadow: '0 0 0 2px #fff' }}
        >
          {done}
        </motion.span>
      )}
      <AnimatePresence>
        {dropKey !== null && (
          <motion.span
            key={dropKey}
            initial={{ opacity: 0, y: 6, scale: 0.8 }}
            animate={{ opacity: 1, y: -6, scale: 1 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
            className="pointer-events-none absolute -left-4 top-1/2 text-[13px] font-black text-v2-amber"
            aria-hidden
          >
            +1
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
