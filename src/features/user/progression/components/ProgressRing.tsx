/**
 * Progress Ring Component
 * Circular progress indicator for level/XP progress
 * Placeholder for future implementation
 */

'use client';

import React from 'react';

interface ProgressRingProps {
  progress: number; // 0-100
  size?: 'small' | 'medium' | 'large';
  color?: string;
  children?: React.ReactNode;
}

export default function ProgressRing({
  progress,
  size = 'medium',
  color = '#00E5FF',
  children,
}: ProgressRingProps) {
  const sizeMap = {
    small: { container: 'w-16 h-16', stroke: 3 },
    medium: { container: 'w-24 h-24', stroke: 4 },
    large: { container: 'w-32 h-32', stroke: 5 },
  };

  const { container, stroke } = sizeMap[size];
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className={`relative ${container}`}>
      <svg className="transform -rotate-90" viewBox="0 0 100 100">
        {/* Background circle */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          className="text-gray-200 dark:text-gray-700"
        />
        {/* Progress circle */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      {/* Center content */}
      {children && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}
