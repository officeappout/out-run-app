'use client';

import React, { useRef, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';

interface HorizontalPickerProps {
  min?: number;
  max?: number;
  targetValue: number;
  value: number;
  onChange: (value: number) => void;
  unitType: 'reps' | 'time';
}

const BOX_H = 46;

function fmtMMSS(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function blendColor(p: number): string {
  if (p >= 0.95) return '#000000';
  if (p < 0.3) return 'rgb(203,213,225)';
  const t = Math.min(1, (p - 0.3) / 0.65);
  const curve = t * t;
  const r = Math.round(203 * (1 - curve));
  const g = Math.round(213 * (1 - curve));
  const b = Math.round(225 * (1 - curve));
  return `rgb(${r},${g},${b})`;
}

export default function HorizontalPicker({
  min = 1,
  max = 50,
  targetValue,
  value,
  onChange,
  unitType,
}: HorizontalPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemEls = useRef<(HTMLDivElement | null)[]>([]);
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);
  const lastEmittedValue = useRef<number | null>(null);
  const mountScrollDone = useRef(false);
  const hasInitialScrolled = useRef(false);
  const isTouching = useRef(false);
  const hasTouched = useRef(false);
  const revealTs = useRef(0);

  const visibleCount = unitType === 'time' ? 3 : 5;

  const [itemW, setItemW] = useState(0);
  const [ready, setReady] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const prevItemW = useRef(0);
  const roRafId = useRef(0);

  const range = useMemo(() => {
    const start = Math.max(0, min);
    const end = Math.max(max, targetValue + (unitType === 'time' ? 30 : 10));
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [min, max, targetValue, unitType]);

  const indexOfValue = useCallback(
    (v: number) => {
      const idx = range.indexOf(v);
      if (idx >= 0) return idx;
      let closest = 0;
      let minDiff = Math.abs(range[0] - v);
      for (let i = 1; i < range.length; i++) {
        const diff = Math.abs(range[i] - v);
        if (diff < minDiff) { minDiff = diff; closest = i; }
      }
      return closest;
    },
    [range],
  );

  // ResizeObserver: measure itemW from the STABLE container width.
  // Sanitized: reject widths > screen width (junk values during drawer animation).
  // Debounced: waits 2 rAF frames so we only act on stable geometry.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      if (roRafId.current) cancelAnimationFrame(roRafId.current);

      roRafId.current = requestAnimationFrame(() => {
        roRafId.current = requestAnimationFrame(() => {
          for (const entry of entries) {
            const w = entry.contentRect.width;
            if (w <= 0) continue;
            const screenW = typeof window !== 'undefined' ? window.innerWidth : 500;
            if (w > screenW) continue;

            const newItemW = w / visibleCount;
            setItemW((prev) => {
              if (Math.abs(prev - newItemW) < 1) return prev;
              return newItemW;
            });
          }
        });
      });
    });

    ro.observe(el);
    return () => {
      ro.disconnect();
      if (roRafId.current) cancelAnimationFrame(roRafId.current);
    };
  }, [visibleCount]);

  // Initial scroll — invisible teleport on mount.
  // Uses direct property assignment (el.scrollLeft) instead of scrollTo() to
  // avoid silent failures on WebKit. Keeps scroll-snap disabled and opacity-0
  // until the position is confirmed stable via rAF + reveal timer.
  useLayoutEffect(() => {
    if (!itemW || hasInitialScrolled.current) return;
    const el = scrollRef.current;
    if (!el) return;

    const parentDir = el.parentElement ? getComputedStyle(el.parentElement).direction : 'unknown';
    const selfDir = getComputedStyle(el).direction;
    console.log(`[Picker RTL Check] parentDirection=${parentDir}, selfDirection=${selfDir} (forced ltr), scrollLeft=${el.scrollLeft}`);

    const snapTo = (value > 0) ? value : (targetValue > 0 ? targetValue : 1);
    const idx = indexOfValue(snapTo);

    if (idx === 0 && snapTo !== range[0]) {
      console.warn(
        `[HorizontalPicker] Abort initial scroll: idx=0 but snapTo=${snapTo} ≠ range[0]=${range[0]}. Waiting for valid measurement.`,
      );
      return;
    }

    const targetLeft = idx * itemW;

    lastEmittedValue.current = snapTo;
    mountScrollDone.current = false;
    hasInitialScrolled.current = true;
    prevItemW.current = itemW;

    el.style.scrollSnapType = 'none';
    el.scrollLeft = targetLeft;
    console.log(`[Picker Init] targetLeft=${targetLeft}, actual scrollLeft=${el.scrollLeft}, snapTo=${snapTo}, idx=${idx}, itemW=${itemW}`);

    requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      console.log(`[Picker Init rAF] scrollLeft after rAF=${scrollRef.current.scrollLeft}, expected=${targetLeft}`);
      applyVisuals(scrollRef.current);
    });

    const revealTimer = setTimeout(() => {
      if (!scrollRef.current) return;

      // Force-correct with direct assignment — no scrollTo
      scrollRef.current.style.scrollSnapType = 'none';
      const beforeCorrect = scrollRef.current.scrollLeft;
      scrollRef.current.scrollLeft = targetLeft;
      console.log(`[Picker Reveal] before=${beforeCorrect}, after=${scrollRef.current.scrollLeft}, expected=${targetLeft}`);

      // Double-check centered value after forced assignment
      const centered = readCenteredValue();
      if (centered !== null && centered !== snapTo) {
        const correctLeft = indexOfValue(snapTo) * itemW;
        scrollRef.current.scrollLeft = correctLeft;
        console.warn(`[Picker Reveal] Force-corrected: centered=${centered} → snapTo=${snapTo}, scrollLeft=${scrollRef.current.scrollLeft}`);
      }

      // Lock emitted value to snapTo so async scroll events can't override
      lastEmittedValue.current = snapTo;

      requestAnimationFrame(() => {
        if (!scrollRef.current) return;
        applyVisuals(scrollRef.current);
        scrollRef.current.style.scrollSnapType = 'x mandatory';
        mountScrollDone.current = true;
        revealTs.current = Date.now();
        setIsVisible(true);
        setReady(true);
      });
    }, 50);

    return () => clearTimeout(revealTimer);
  }, [itemW]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-scroll when itemW changes significantly AFTER initial scroll.
  // This catches the transition from a hallucinated width (e.g. 474px) to the real one (~130px).
  useEffect(() => {
    if (!itemW || !hasInitialScrolled.current || !ready) return;
    const el = scrollRef.current;
    if (!el) return;

    const drift = Math.abs(itemW - prevItemW.current);
    prevItemW.current = itemW;
    if (drift < 2) return;

    const currentVal = lastEmittedValue.current ?? value;
    if (currentVal <= 0) return;
    const idx = indexOfValue(currentVal);
    const targetLeft = idx * itemW;

    el.style.scrollSnapType = 'none';
    el.scrollLeft = targetLeft;
    el.style.scrollSnapType = 'x mandatory';
    applyVisuals(el);
  }, [itemW]); // eslint-disable-line react-hooks/exhaustive-deps

  // Timer sync: if value prop changes after mount, scroll to it smoothly.
  useEffect(() => {
    if (!ready || !itemW) return;
    if (value === 0 || value == null) return;
    const el = scrollRef.current;
    if (!el) return;

    if (value > 0 && value !== lastEmittedValue.current) {
      const idx = indexOfValue(value);
      el.style.scrollSnapType = 'none';
      el.scrollTo({ left: idx * itemW, behavior: 'smooth' });
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.style.scrollSnapType = 'x mandatory';
      });
      lastEmittedValue.current = value;
      onChange(value);
    }
  }, [value, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const boxW = itemW || 140;
  const maxDist = itemW * Math.floor(visibleCount / 2);

  // ── Zero-lag DOM-direct visual updates ─────────────────────────────────────

  const applyVisuals = useCallback((scrollEl: HTMLDivElement) => {
    const viewportCenter = scrollEl.scrollLeft + scrollEl.clientWidth / 2;
    const isTime = unitType === 'time';
    const baseFontSize = isTime ? 14 : 18;
    const maxFontSize = isTime ? 22 : 28;
    const dist_limit = maxDist;

    for (let i = 0; i < itemEls.current.length; i++) {
      const el = itemEls.current[i];
      if (!el) continue;

      const elCenter = el.offsetLeft + el.offsetWidth / 2;
      const dist = Math.abs(viewportCenter - elCenter);
      const proximity = Math.max(0, 1 - dist / dist_limit);

      const scale = 1.0 + proximity * 0.4;
      const color = blendColor(proximity);
      const weight = proximity > 0.9 ? 900 : Math.round(500 + proximity * 470);
      const fontSize = baseFontSize + proximity * (maxFontSize - baseFontSize);

      el.style.transform = `scale(${scale})`;

      const span = el.firstElementChild as HTMLElement | null;
      if (span) {
        span.style.color = color;
        span.style.fontWeight = String(weight);
        span.style.fontSize = `${fontSize}px`;
      }
    }
  }, [unitType, maxDist, visibleCount]);

  const readCenteredValue = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !itemW) return null;
    const idx = Math.round(el.scrollLeft / itemW);
    const clamped = Math.min(Math.max(idx, 0), range.length - 1);
    return range[clamped];
  }, [range, itemW]);

  const emitValue = useCallback((v: number) => {
    if (v <= 0) return;
    if (!mountScrollDone.current || !isVisible) {
      console.log(`[Picker emitValue] BLOCKED v=${v} — mountDone=${mountScrollDone.current}, isVisible=${isVisible}`);
      return;
    }
    const userIsInteracting = isTouching.current || isDragging.current;
    const msSinceReveal = Date.now() - revealTs.current;
    if (!userIsInteracting && msSinceReveal < 1000) {
      console.log(`[Picker emitValue] BLOCKED v=${v} — no gesture, msSinceReveal=${msSinceReveal}`);
      return;
    }
    if (v !== lastEmittedValue.current) {
      console.trace(`[Picker emitValue] EMIT v=${v}, prev=${lastEmittedValue.current}, gesture=${userIsInteracting}, msSinceReveal=${msSinceReveal}`);
      lastEmittedValue.current = v;
      onChange(v);
    }
  }, [onChange, isVisible]);

  // Scroll listener: only attaches AFTER ready
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !itemW || !ready) return;
    const hasNativeScrollend = 'onscrollend' in window;

    const onScroll = () => {
      const centered = readCenteredValue();
      const isUserGesture = isDragging.current || isTouching.current;
      const msSinceReveal = Date.now() - revealTs.current;
      console.log(`[Picker Scroll] scrollLeft=${el.scrollLeft}, val=${centered}, isUserGesture=${isUserGesture}, mountDone=${mountScrollDone.current}`);

      // Ghost scroll guard: only active BEFORE the user has ever touched the picker.
      // Once hasTouched is true, allow all scroll momentum freely.
      if (!isUserGesture && !hasTouched.current && msSinceReveal > 2000 && lastEmittedValue.current !== null) {
        const expected = lastEmittedValue.current;
        if (centered !== null && centered !== expected) {
          console.warn(`[Picker Ghost Guard] phantom jump to ${centered}, snapping back to ${expected}`);
          const correctIdx = indexOfValue(expected);
          el.style.scrollSnapType = 'none';
          el.scrollLeft = correctIdx * itemW;
          requestAnimationFrame(() => {
            if (scrollRef.current) {
              scrollRef.current.style.scrollSnapType = 'x mandatory';
              applyVisuals(scrollRef.current);
            }
          });
          return;
        }
      }

      applyVisuals(el);

      if (!hasNativeScrollend) {
        if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
        scrollEndTimer.current = setTimeout(() => {
          const final = readCenteredValue();
          if (final !== null) emitValue(final);
        }, 80);
      }
    };

    const onScrollEnd = () => {
      const centered = readCenteredValue();
      console.log(`[Picker ScrollEnd] scrollLeft=${el.scrollLeft}, val=${centered}, isUserGesture=${isDragging.current || isTouching.current}`);
      applyVisuals(el);
      const final = readCenteredValue();
      if (final !== null) emitValue(final);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    if (hasNativeScrollend) el.addEventListener('scrollend', onScrollEnd);

    return () => {
      el.removeEventListener('scroll', onScroll);
      if (hasNativeScrollend) el.removeEventListener('scrollend', onScrollEnd);
      if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    };
  }, [itemW, ready, applyVisuals, readCenteredValue, emitValue]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragScrollLeft.current = el.scrollLeft;
    el.style.cursor = 'grabbing';
    el.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      e.preventDefault();
      const el = scrollRef.current;
      if (el) {
        el.scrollLeft = dragScrollLeft.current - (e.clientX - dragStartX.current);
      }
    };
    const onUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      const el = scrollRef.current;
      if (el) {
        el.style.cursor = 'grab';
        el.style.userSelect = '';
      }
      const final = readCenteredValue();
      if (final !== null) emitValue(final);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [readCenteredValue, emitValue]);

  if (!itemW) return <div ref={containerRef} className="w-full h-[72px]" />;

  const isTime = unitType === 'time';

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[72px] flex items-center justify-center overflow-hidden pointer-events-auto"
      onPointerDownCapture={(e) => e.stopPropagation()}
      style={{
        touchAction: 'pan-x',
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 120ms ease-out',
      }}
    >
      <div className="absolute inset-y-0 left-0 w-8 z-20 pointer-events-none bg-gradient-to-r from-white dark:from-[#0F172A] to-transparent" />
      <div className="absolute inset-y-0 right-0 w-8 z-20 pointer-events-none bg-gradient-to-l from-white dark:from-[#0F172A] to-transparent" />

      <div
        className="absolute left-1/2 -translate-x-1/2 z-0 pointer-events-none rounded-xl bg-white dark:bg-slate-800"
        style={{
          width: boxW,
          height: BOX_H,
          border: '0.5px solid #E0E9FF',
          boxShadow: '0 4px 16px rgba(0,0,0,0.10), 0 1.5px 4px rgba(0,0,0,0.06)',
        }}
      />

      <div
        ref={scrollRef}
        className="relative z-10 flex h-full w-full items-center overflow-x-scroll pointer-events-auto scrollbar-hide"
        onMouseDown={handleMouseDown}
        onTouchStart={() => { isTouching.current = true; hasTouched.current = true; }}
        onTouchEnd={() => { isTouching.current = false; }}
        dir="ltr"
        style={{
          direction: 'ltr',
          touchAction: 'pan-x',
          WebkitOverflowScrolling: 'touch',
          scrollSnapType: 'none',
          cursor: 'grab',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          overflow: '-moz-scrollbars-none' as string,
        }}
      >
        <div className="flex-none" style={{ width: itemW * Math.floor(visibleCount / 2) }} />

        {range.map((num, idx) => (
          <div
            key={num}
            ref={(el) => { itemEls.current[idx] = el; }}
            className="flex-none flex items-center justify-center snap-center"
            style={{ width: itemW, transition: 'none', willChange: 'transform' }}
          >
            <span
              className="tabular-nums"
              style={{
                fontFamily: 'var(--font-simpler)',
                lineHeight: 1.15,
                color: 'rgb(148,163,184)',
                fontWeight: 500,
                fontSize: isTime ? 14 : 18,
              }}
            >
              {isTime ? fmtMMSS(num) : num}
            </span>
          </div>
        ))}

        <div className="flex-none" style={{ width: itemW * Math.floor(visibleCount / 2) }} />
      </div>
    </div>
  );
}
