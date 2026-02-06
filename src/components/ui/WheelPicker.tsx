'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';

interface WheelPickerProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  label?: string;
}

/**
 * iOS-style Wheel Picker Component
 * Supports touch/drag gestures for smooth scrolling
 * Uses Simpler Pro font with premium styling
 */
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
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startValue, setStartValue] = useState(value);
  
  // Generate array of values - dynamically from min to max
  const values = useMemo(() => {
    const arr: number[] = [];
    // Ensure min and max are valid
    const safeMin = Math.max(1, min);
    const safeMax = Math.max(safeMin, max);
    const safeStep = Math.max(1, step);
    
    for (let i = safeMin; i <= safeMax; i += safeStep) {
      arr.push(i);
    }
    return arr;
  }, [min, max, step]);
  
  // Item height in pixels
  const ITEM_HEIGHT = 50;
  const VISIBLE_ITEMS = 5;
  
  // Calculate current index - ensure value is within range
  const safeValue = useMemo(() => {
    if (values.includes(value)) return value;
    // Find closest value in the array
    const closest = values.reduce((prev, curr) => 
      Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
    );
    return closest;
  }, [value, values]);
  
  const currentIndex = values.indexOf(safeValue);
  
  // Sync safe value back to parent if different
  useEffect(() => {
    if (safeValue !== value && values.length > 0) {
      onChange(safeValue);
    }
  }, [safeValue, value, onChange, values]);
  
  // Handle wheel event
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const indexDelta = e.deltaY > 0 ? 1 : -1;
    const newIndex = Math.max(0, Math.min(values.length - 1, currentIndex + indexDelta));
    onChange(values[newIndex]);
  }, [currentIndex, onChange, values]);
  
  // Touch/Mouse handlers
  const handleDragStart = (clientY: number) => {
    setIsDragging(true);
    setStartY(clientY);
    setStartValue(value);
  };
  
  const handleDragMove = (clientY: number) => {
    if (!isDragging) return;
    
    const deltaY = startY - clientY;
    const indexDelta = Math.round(deltaY / ITEM_HEIGHT);
    const startIndex = values.indexOf(startValue);
    const newIndex = Math.max(0, Math.min(values.length - 1, startIndex + indexDelta));
    
    if (values[newIndex] !== value) {
      onChange(values[newIndex]);
    }
  };
  
  const handleDragEnd = () => {
    setIsDragging(false);
  };
  
  // Add wheel listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);
  
  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const newIndex = Math.max(0, currentIndex - 1);
      onChange(values[newIndex]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const newIndex = Math.min(values.length - 1, currentIndex + 1);
      onChange(values[newIndex]);
    }
  };
  
  // Calculate visible range
  const halfVisible = Math.floor(VISIBLE_ITEMS / 2);
  
  return (
    <div className="flex flex-col items-center">
      {/* Label */}
      {label && (
        <div className="text-sm font-bold text-slate-500 mb-3">
          {label}
        </div>
      )}
      
      {/* Wheel Container - Premium styling with Simpler Pro */}
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onMouseDown={(e) => handleDragStart(e.clientY)}
        onMouseMove={(e) => handleDragMove(e.clientY)}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
        onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
        onTouchMove={(e) => handleDragMove(e.touches[0].clientY)}
        onTouchEnd={handleDragEnd}
        className="relative w-40 h-[250px] overflow-hidden select-none cursor-grab active:cursor-grabbing rounded-3xl bg-white shadow-[0_4px_20px_rgba(91,194,242,0.08)] border border-slate-100/80 focus:outline-none focus:ring-2 focus:ring-[#5BC2F2]/15"
        style={{ fontFamily: 'var(--font-simpler)' }}
      >
        {/* Top Gradient Fade - Subtle for better visibility */}
        <div className="absolute top-0 left-0 right-0 h-[55px] bg-gradient-to-b from-white via-white/80 to-transparent z-10 pointer-events-none" />
        
        {/* Bottom Gradient Fade - Subtle for better visibility */}
        <div className="absolute bottom-0 left-0 right-0 h-[55px] bg-gradient-to-t from-white via-white/80 to-transparent z-10 pointer-events-none" />
        
        {/* Selection Indicator - Delicate 1px border with 14px radius and subtle glow */}
        <div className="absolute top-1/2 left-2 right-2 -translate-y-1/2 h-[50px] rounded-2xl bg-[#5BC2F2]/5 border border-[#5BC2F2]/30 shadow-[0_0_12px_rgba(91,194,242,0.15)] z-0" />
        
        {/* Values List */}
        <motion.div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{
            y: -(currentIndex - halfVisible) * ITEM_HEIGHT,
          }}
          animate={{
            y: -(currentIndex - halfVisible) * ITEM_HEIGHT,
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          {values.map((v, idx) => {
            const distance = Math.abs(idx - currentIndex);
            const isSelected = idx === currentIndex;
            
            // Premium styling: selected = full opacity, others = 0.2 opacity
            const opacity = isSelected ? 1 : 0.2;
            const scale = isSelected ? 1 : 0.9;
            
            return (
              <motion.div
                key={v}
                className={`h-[50px] flex items-center justify-center w-full transition-all duration-200 ${
                  isSelected ? 'text-[#5BC2F2]' : 'text-slate-500'
                }`}
                style={{
                  opacity,
                  transform: `scale(${scale})`,
                }}
                onClick={() => onChange(v)}
              >
                {/* Bold (700) for selected, Medium (500) for others - Simpler Pro */}
                <span 
                  className={`${isSelected ? 'text-3xl' : 'text-xl'}`}
                  style={{ fontWeight: isSelected ? 700 : 500 }}
                >
                  {v}
                </span>
              </motion.div>
            );
          })}
        </motion.div>
        
        {/* Unit Label - Positioned to the right of numbers, inside selection box */}
        <div 
          className="absolute top-1/2 right-3 -translate-y-1/2 z-20 text-sm text-[#5BC2F2]/70"
          style={{ fontWeight: 600 }}
        >
          {unit}
        </div>
      </div>
      
      {/* Current Value Display - Brand blue styling with Simpler Pro */}
      <div className="mt-4 text-center" style={{ fontFamily: 'var(--font-simpler)' }}>
        <div className="flex items-baseline justify-center gap-1.5">
          <span className="text-4xl text-[#5BC2F2]" style={{ fontWeight: 700 }}>
            {value}
          </span>
          <span className="text-xl text-[#5BC2F2]/70" style={{ fontWeight: 600 }}>{unit}</span>
        </div>
      </div>
    </div>
  );
}
