'use client';

import React from 'react';

// Simple className utility function
const cn = (...classes: (string | undefined | null | false)[]): string => {
  return classes.filter(Boolean).join(' ');
};

interface WorkoutCardWrapperProps {
  children: React.ReactNode;
  statusColor?: string; // Optional color for the vertical bar (e.g., '#00ADEF', '#FF8C00')
  className?: string;
  onClick?: () => void;
}

/**
 * WorkoutCardWrapper - Generic container for workout cards
 * Provides shared styling and optional status color bar
 */
export default function WorkoutCardWrapper({
  children,
  statusColor,
  className,
  onClick,
}: WorkoutCardWrapperProps) {
  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      onClick={onClick}
      className={cn(
        'relative w-full',
        'bg-card-light dark:bg-card-dark',
        'border border-slate-100 dark:border-slate-800',
        'rounded-2xl',
        'shadow-sm',
        'overflow-hidden',
        'text-right',
        className
      )}
      dir="rtl"
    >
      {/* Status Color Bar (Right side in RTL) */}
      {statusColor && (
        <div
          className="absolute top-0 right-0 bottom-0 w-1"
          style={{ backgroundColor: statusColor }}
        />
      )}

      {/* Content */}
      <div className="flex flex-row-reverse items-center">
        {children}
      </div>
    </Component>
  );
}
