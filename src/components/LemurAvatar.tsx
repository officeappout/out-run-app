'use client';

import React from 'react';
import Image from 'next/image';

interface LemurAvatarProps {
  level: number; // 1-10 (or higher, will default to highest available)
  state?: 'idle' | 'active' | 'walking' | 'working'; // For future use
  size?: 'small' | 'medium' | 'large'; // Size variants
  className?: string; // Additional CSS classes
}

/**
 * LemurAvatar Component
 * Displays a level-based lemur character avatar
 * 
 * Level images should be placed in /public/assets/lemur/level1.png through level10.png
 * If a level image doesn't exist, it will fallback to the closest available level
 */
export default function LemurAvatar({ 
  level, 
  state = 'idle',
  size = 'medium',
  className = '' 
}: LemurAvatarProps) {
  // Clamp level between 1 and 10 (or use highest available)
  const clampedLevel = Math.max(1, Math.min(level, 10));
  
  // Image path for the lemur based on level
  const imagePath = `/assets/lemur/level${clampedLevel}.png`;
  
  // Size classes
  const sizeClasses = {
    small: 'w-8 h-8',
    medium: 'w-12 h-12',
    large: 'w-16 h-16',
  };
  
  return (
    <div className={`relative ${sizeClasses[size]} ${className}`}>
      {/* Placeholder/Loading State */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center border-2 border-white shadow-lg">
        {/* If image fails to load, show level number as fallback */}
        <span className="text-white text-xs font-bold">{clampedLevel}</span>
      </div>
      
      {/* Lemur Image */}
      <Image
        src={imagePath}
        alt={`Lemur Level ${clampedLevel}`}
        width={size === 'small' ? 32 : size === 'medium' ? 48 : 64}
        height={size === 'small' ? 32 : size === 'medium' ? 48 : 64}
        className="rounded-full object-cover border-2 border-white shadow-lg relative z-10"
        onError={(e) => {
          // If image doesn't exist, keep the placeholder visible
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
      
      {/* Level Badge (optional, can be removed if not needed) */}
      {size !== 'small' && (
        <div className="absolute -bottom-1 -right-1 bg-yellow-400 rounded-full w-5 h-5 border-2 border-white flex items-center justify-center shadow-md z-20">
          <span className="text-[8px] font-black text-yellow-900">{clampedLevel}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Empty State Lemur Component
 * Used when no parks/results are found
 */
export function EmptyStateLemur({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="relative w-24 h-24 mb-4">
        {/* Empty state lemur - uses level 1 as default */}
        <LemurAvatar level={1} size="large" className="opacity-50" />
      </div>
      {message && (
        <p className="text-slate-600 font-medium font-simpler text-sm mt-2" dir="rtl">
          {message}
        </p>
      )}
    </div>
  );
}
