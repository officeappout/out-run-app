'use client';

import React, { useState } from 'react';
import { Star } from 'lucide-react';

interface StarRatingWidgetProps {
  value: number;
  onChange: (rating: number) => void;
  size?: number;
  label?: string;
}

export default function StarRatingWidget({ value, onChange, size = 28, label }: StarRatingWidgetProps) {
  const [hovered, setHovered] = useState(0);

  return (
    <div className="flex flex-col items-center gap-2" dir="rtl">
      {label && <p className="text-white/60 text-xs font-bold">{label}</p>}
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => {
          const isActive = star <= (hovered || value);
          return (
            <button
              key={star}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              onClick={() => onChange(star)}
              className="p-0.5 transition-transform active:scale-90"
            >
              <Star
                size={size}
                // Unselected stars must read as a clear 5-star outline on
                // either a light or dark host background — this widget is
                // used inside ParkDetailSheet's light `bg-gray-50` rating
                // panel, where the old `text-white/15` was near-invisible
                // (white outline at 15% opacity on a near-white background).
                // Matches the same empty-star color this file's own
                // read-only review-list stars already use.
                className={`transition-colors ${
                  isActive ? 'text-amber-400' : 'text-gray-300 dark:text-gray-500'
                }`}
                fill={isActive ? '#FBBF24' : 'none'}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
