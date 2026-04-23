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
                className={`transition-colors ${
                  isActive ? 'text-amber-400' : 'text-white/15'
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
