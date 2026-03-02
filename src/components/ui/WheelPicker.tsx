'use client';

import React, { useRef, useEffect, useCallback, useMemo } from 'react';

interface WheelPickerProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  label?: string;
}

const ITEM_HEIGHT = 48;
const VISIBLE_COUNT = 5;
const RENDER_BUFFER = 7;

export default function WheelPicker({
  value,
  onChange,
  min = 40,
  max = 150,
  step = 1,
  unit = 'ק״ג',
  label,
}: WheelPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const startIndexRef = useRef(0);
  const lastIndexDeltaRef = useRef(0);

  const values = useMemo(() => {
    const arr: number[] = [];
    for (let i = Math.max(1, min); i <= Math.max(min, max); i += Math.max(1, step)) {
      arr.push(i);
    }
    return arr;
  }, [min, max, step]);

  const safeIndex = useMemo(() => {
    const idx = values.indexOf(value);
    if (idx >= 0) return idx;
    return values.reduce((bestIdx, v, i) =>
      Math.abs(v - value) < Math.abs(values[bestIdx] - value) ? i : bestIdx, 0);
  }, [value, values]);

  const halfVisible = Math.floor(VISIBLE_COUNT / 2);
  const renderStart = Math.max(0, safeIndex - RENDER_BUFFER);
  const renderEnd = Math.min(values.length - 1, safeIndex + RENDER_BUFFER);

  const clampAndEmit = useCallback((newIndex: number) => {
    const clamped = Math.max(0, Math.min(values.length - 1, newIndex));
    if (values[clamped] !== undefined && values[clamped] !== value) {
      onChange(values[clamped]);
    }
  }, [onChange, value, values]);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    clampAndEmit(safeIndex + (e.deltaY > 0 ? 1 : -1));
  }, [safeIndex, clampAndEmit]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = true;
    startYRef.current = e.clientY;
    startIndexRef.current = safeIndex;
    lastIndexDeltaRef.current = 0;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [safeIndex]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const deltaY = startYRef.current - e.clientY;
    const indexDelta = Math.round(deltaY / ITEM_HEIGHT);
    if (indexDelta !== lastIndexDeltaRef.current) {
      lastIndexDeltaRef.current = indexDelta;
      clampAndEmit(startIndexRef.current + indexDelta);
    }
  }, [clampAndEmit]);

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); clampAndEmit(safeIndex - 1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); clampAndEmit(safeIndex + 1); }
  }, [safeIndex, clampAndEmit]);

  return (
    <div className="flex flex-col items-center">
      {label && <div className="text-sm font-bold text-slate-500 mb-3">{label}</div>}

      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative w-40 overflow-hidden select-none touch-none cursor-grab active:cursor-grabbing rounded-3xl bg-white shadow-[0_4px_20px_rgba(91,194,242,0.08)] border border-slate-100/80 focus:outline-none focus:ring-2 focus:ring-[#5BC2F2]/15"
        style={{ height: ITEM_HEIGHT * VISIBLE_COUNT, fontFamily: 'var(--font-simpler)' }}
      >
        {/* Gradient fades */}
        <div className="absolute top-0 left-0 right-0 h-14 bg-gradient-to-b from-white via-white/80 to-transparent z-10 pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-white via-white/80 to-transparent z-10 pointer-events-none" />

        {/* Selection highlight */}
        <div
          className="absolute left-2 right-2 rounded-2xl bg-[#5BC2F2]/5 border border-[#5BC2F2]/30 shadow-[0_0_12px_rgba(91,194,242,0.15)] z-0"
          style={{ top: halfVisible * ITEM_HEIGHT, height: ITEM_HEIGHT }}
        />

        {/* Windowed items */}
        {(() => {
          const items: React.ReactNode[] = [];
          for (let i = renderStart; i <= renderEnd; i++) {
            const v = values[i];
            const offset = i - safeIndex;
            const isSelected = offset === 0;
            const absOffset = Math.abs(offset);
            items.push(
              <div
                key={v}
                role="option"
                aria-selected={isSelected}
                className="absolute left-0 right-0 flex items-center justify-center will-change-transform"
                style={{
                  height: ITEM_HEIGHT,
                  top: (halfVisible + offset) * ITEM_HEIGHT,
                  opacity: isSelected ? 1 : Math.max(0.15, 1 - absOffset * 0.3),
                  transform: `scale(${isSelected ? 1 : Math.max(0.82, 1 - absOffset * 0.06)})`,
                  transition: 'top 180ms ease-out, opacity 180ms ease-out, transform 180ms ease-out',
                }}
                onClick={() => onChange(v)}
              >
                <span
                  className={isSelected ? 'text-3xl text-[#5BC2F2]' : 'text-xl text-slate-500'}
                  style={{ fontWeight: isSelected ? 700 : 500 }}
                >
                  {v}
                </span>
              </div>
            );
          }
          return items;
        })()}

        {/* Unit label */}
        <div className="absolute top-1/2 right-3 -translate-y-1/2 z-20 text-sm text-[#5BC2F2]/70" style={{ fontWeight: 600 }}>
          {unit}
        </div>
      </div>

      {/* Current value readout */}
      <div className="mt-4 text-center" style={{ fontFamily: 'var(--font-simpler)' }}>
        <div className="flex items-baseline justify-center gap-1.5">
          <span className="text-4xl text-[#5BC2F2]" style={{ fontWeight: 700 }}>{value}</span>
          <span className="text-xl text-[#5BC2F2]/70" style={{ fontWeight: 600 }}>{unit}</span>
        </div>
      </div>
    </div>
  );
}
