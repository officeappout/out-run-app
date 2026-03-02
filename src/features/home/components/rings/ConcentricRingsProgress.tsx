"use client";

/**
 * ConcentricRingsProgress Component
 * 
 * Apple Watch-style activity rings showing daily progress across
 * three categories: Strength, Cardio, and Maintenance.
 * 
 * Ring Order: Determined by ActivityPriorityService based on user's program.
 * - Athletes/Strength users: Strength (outer) → Cardio → Maintenance (inner)
 * - Runners: Cardio (outer) → Strength → Maintenance (inner)
 * - Lifestyle: Cardio (outer) → Maintenance → Strength (inner)
 * 
 * Features:
 * - Animated progress fill on mount
 * - Gradient strokes for visual appeal
 * - Center display showing total minutes or dominant percentage
 * - Category legend with current values
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useDailyActivity } from '@/features/activity';
import { 
  ACTIVITY_COLORS, 
  ACTIVITY_LABELS,
  type ActivityCategory,
  type RingData,
} from '@/features/activity/types/activity.types';

// ============================================================================
// TYPES
// ============================================================================

interface ConcentricRingsProgressProps {
  /** Size of the component (width = height) */
  size?: number;
  /** Stroke width for the rings */
  strokeWidth?: number;
  /** Show center text */
  showCenter?: boolean;
  /** Center display mode */
  centerMode?: 'percentage' | 'minutes' | 'primary';
  /** Show category legend below */
  showLegend?: boolean;
  /** Custom ring data (overrides auto-fetch) */
  ringData?: RingData[];
  /** Animation duration in seconds */
  animationDuration?: number;
  /** Custom className */
  className?: string;
  /** Compact mode (smaller, no legend) */
  compact?: boolean;
  /**
   * Dynamic dominant color: when true, the center text and glow
   * shift color to match the category with the most logged minutes.
   * This creates a "chameleon" effect — more Cardio = Lime center,
   * more Strength = Cyan center, etc.
   */
  dynamicCenterColor?: boolean;
}

// ============================================================================
// RING COMPONENT
// ============================================================================

interface RingProps {
  /** Radius of this ring's center line */
  radius: number;
  /** Stroke width */
  strokeWidth: number;
  /** Progress percentage (0-100) */
  percentage: number;
  /** Ring color (hex) */
  color: string;
  /** Animation delay */
  delay: number;
  /** Animation duration */
  duration: number;
  /** Center of the SVG */
  center: number;
  /** Gradient ID for this ring */
  gradientId: string;
}

function Ring({
  radius,
  strokeWidth,
  percentage,
  color,
  delay,
  duration,
  center,
  gradientId,
}: RingProps) {
  // Calculate circumference and stroke dash values
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(percentage, 100);
  const strokeDashoffset = circumference - (circumference * progress) / 100;
  
  return (
    <>
      {/* Background ring (track) */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={`${color}20`}
        strokeWidth={strokeWidth}
        className="transition-all"
      />
      
      {/* Progress ring */}
      <motion.circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset }}
        transition={{ 
          duration, 
          delay,
          ease: "easeOut",
        }}
        style={{
          transform: 'rotate(-90deg)',
          transformOrigin: `${center}px ${center}px`,
        }}
      />
    </>
  );
}

// ============================================================================
// LEGEND COMPONENT
// ============================================================================

interface LegendItemProps {
  color: string;
  label: string;
  value: number;
  max: number;
  percentage: number;
}

function LegendItem({ color, label, value, max, percentage }: LegendItemProps) {
  return (
    <div className="flex items-center gap-2">
      <div 
        className="w-3 h-3 rounded-full"
        style={{ backgroundColor: color }}
      />
      <div className="flex flex-col">
        <span className="text-xs font-bold text-gray-700 dark:text-gray-200">
          {label}
        </span>
        <span className="text-[10px] text-gray-400">
          {value}/{max} דק' ({Math.round(percentage)}%)
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ConcentricRingsProgress({
  size = 160,
  strokeWidth = 12,
  showCenter = true,
  centerMode = 'percentage',
  showLegend = true,
  ringData: customRingData,
  animationDuration = 1,
  className = '',
  compact = false,
  dynamicCenterColor = false,
}: ConcentricRingsProgressProps) {
  // Fetch ring data from activity store
  const { ringData: storeRingData, totalMinutesToday, isLoading } = useDailyActivity();
  
  // Use custom data or store data
  const rings = customRingData || storeRingData;
  
  // Calculate dimensions — respect explicit size prop; compact only affects text sizing
  const actualSize = size;
  const actualStrokeWidth = strokeWidth;
  const center = actualSize / 2;

  // Proportional padding & gap: at large sizes (80+) use generous spacing;
  // at small/medium sizes (≤50) flush rings with 0px gap for a solid disc look.
  const isSmall = actualSize <= 50;
  const padding = isSmall
    ? actualStrokeWidth / 2
    : actualStrokeWidth / 2 + 4;
  const ringGap = isSmall
    ? actualStrokeWidth
    : actualStrokeWidth + 4;

  // Ring radii (outermost to innermost)
  const ringRadii = useMemo(() => {
    const maxRadius = center - padding;
    return [
      maxRadius,                    // Outer ring
      maxRadius - ringGap,          // Middle ring
      maxRadius - ringGap * 2,      // Inner ring
    ].map(r => Math.max(r, 1));     // Clamp to ≥1 to prevent negatives
  }, [center, padding, ringGap]);
  
  // Dynamic dominant color: pick the hex color of the ring with the most logged minutes
  const dominantRingColor = useMemo(() => {
    if (!dynamicCenterColor || rings.length === 0) return undefined;
    const sorted = [...rings].sort((a, b) => b.value - a.value);
    // Only apply if the dominant ring has non-zero value
    return sorted[0]?.value > 0 ? sorted[0].color : undefined;
  }, [dynamicCenterColor, rings]);

  // Calculate center display value
  const centerValue = useMemo(() => {
    if (rings.length === 0) return { main: '0', sub: '' };
    
    switch (centerMode) {
      case 'minutes':
        return { main: `${totalMinutesToday}`, sub: 'דק\'' };
      case 'primary':
        return { main: `${Math.round(rings[0]?.percentage || 0)}`, sub: '%' };
      case 'percentage':
      default:
        const avgPercentage = rings.reduce((sum, r) => sum + r.percentage, 0) / rings.length;
        return { main: `${Math.round(avgPercentage)}`, sub: '%' };
    }
  }, [rings, centerMode, totalMinutesToday]);
  
  // Loading state
  if (isLoading && !customRingData) {
    return (
      <div 
        className={`flex items-center justify-center ${className}`}
        style={{ width: actualSize, height: actualSize }}
      >
        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-full" 
          style={{ width: actualSize * 0.8, height: actualSize * 0.8 }}
        />
      </div>
    );
  }
  
  // Ensure we have exactly 3 rings (pad with empty if needed)
  const displayRings = useMemo(() => {
    const result = [...rings];
    while (result.length < 3) {
      result.push({
        id: `empty-${result.length}` as ActivityCategory,
        label: '',
        value: 0,
        max: 30,
        percentage: 0,
        color: '#E2E8F0',
        colorClass: 'text-gray-200',
        order: result.length,
        icon: '',
      });
    }
    return result.slice(0, 3);
  }, [rings]);

  return (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      {/* SVG Rings */}
      <div className="relative" style={{ width: actualSize, height: actualSize }}>
        <svg 
          width={actualSize} 
          height={actualSize}
          viewBox={`0 0 ${actualSize} ${actualSize}`}
          className={isSmall ? '' : 'overflow-visible'}
        >
          {/* Gradient definitions */}
          <defs>
            {displayRings.map((ring, idx) => {
              const baseColor = ring.color || ACTIVITY_COLORS[ring.id as ActivityCategory]?.hex || '#06B6D4';
              return (
                <linearGradient 
                  key={`gradient-${idx}`}
                  id={`ring-gradient-${idx}`}
                  x1="0%" y1="0%" x2="100%" y2="100%"
                >
                  <stop offset="0%" stopColor={baseColor} />
                  <stop offset="100%" stopColor={baseColor} stopOpacity="0.7" />
                </linearGradient>
              );
            })}
            
            {/* Glow filter */}
            <filter id="ringGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          
          {/* Render rings (outermost first) */}
          {displayRings.map((ring, idx) => (
            <Ring
              key={ring.id}
              radius={ringRadii[idx]}
              strokeWidth={actualStrokeWidth}
              percentage={ring.percentage}
              color={ring.color}
              delay={idx * 0.15}
              duration={animationDuration}
              center={center}
              gradientId={`ring-gradient-${idx}`}
            />
          ))}
        </svg>
        
        {/* Center content */}
        {showCenter && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.3 }}
            className="absolute inset-0 flex flex-col items-center justify-center"
          >
            <span
              className={`font-black leading-none ${compact ? 'text-xl' : 'text-3xl'} ${
                dominantRingColor ? '' : 'text-gray-900 dark:text-white'
              }`}
              style={dominantRingColor ? { color: dominantRingColor } : undefined}
            >
              {centerValue.main}
            </span>
            {centerValue.sub && (
              <span
                className={`font-bold ${compact ? 'text-[10px]' : 'text-xs'} ${
                  dominantRingColor ? '' : 'text-gray-400'
                }`}
                style={dominantRingColor ? { color: dominantRingColor, opacity: 0.7 } : undefined}
              >
                {centerValue.sub}
              </span>
            )}
          </motion.div>
        )}
      </div>
      
      {/* Legend */}
      {showLegend && !compact && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex items-center justify-center gap-4 flex-wrap"
        >
          {displayRings.filter(r => r.label).map((ring) => (
            <LegendItem
              key={ring.id}
              color={ring.color}
              label={ring.label}
              value={ring.value}
              max={ring.max}
              percentage={ring.percentage}
            />
          ))}
        </motion.div>
      )}
    </div>
  );
}

// ============================================================================
// COMPACT VARIANT EXPORT
// ============================================================================

interface CompactRingsProgressProps {
  ringData?: RingData[];
  className?: string;
  /** Override the default size (80px) */
  size?: number;
  /** Override the default stroke width (6px) */
  strokeWidth?: number;
}

export function CompactRingsProgress({ 
  ringData,
  className = '',
  size = 80,
  strokeWidth = 6,
}: CompactRingsProgressProps) {
  return (
    <ConcentricRingsProgress
      size={size}
      strokeWidth={strokeWidth}
      showCenter={size >= 50}
      centerMode="percentage"
      showLegend={false}
      ringData={ringData}
      animationDuration={0.6}
      className={className}
      compact={size <= 100}
    />
  );
}

export { ConcentricRingsProgress };
