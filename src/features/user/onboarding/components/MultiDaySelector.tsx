"use client";

import React from 'react';

interface MultiDaySelectorProps {
  value: string[];
  onChange: (days: string[]) => void;
  maxSelections?: number;
}

const HEBREW_DAYS = [
  { id: 'א', label: 'א', name: 'ראשון' },
  { id: 'ב', label: 'ב', name: 'שני' },
  { id: 'ג', label: 'ג', name: 'שלישי' },
  { id: 'ד', label: 'ד', name: 'רביעי' },
  { id: 'ה', label: 'ה', name: 'חמישי' },
  { id: 'ו', label: 'ו', name: 'שישי' },
  { id: 'ש', label: 'ש', name: 'שבת' },
];

export default function MultiDaySelector({
  value = [],
  onChange,
  maxSelections,
}: MultiDaySelectorProps) {
  const toggleDay = (dayId: string) => {
    if (value.includes(dayId)) {
      // הסרה
      onChange(value.filter(d => d !== dayId));
    } else {
      // הוספה (אם לא הגענו למקסימום)
      if (!maxSelections || value.length < maxSelections) {
        onChange([...value, dayId]);
      }
    }
  };

  return (
    <div className="w-full">
      <div className="flex gap-2 justify-center flex-wrap">
        {HEBREW_DAYS.map((day) => {
          const isSelected = value.includes(day.id);
          return (
            <button
              key={day.id}
              onClick={() => toggleDay(day.id)}
              className={`
                w-12 h-12 rounded-2xl
                font-bold text-lg
                transition-all duration-200
                active:scale-95
                ${isSelected
                  ? 'bg-[#00E5FF] text-white shadow-md shadow-[#00E5FF]/30'
                  : 'bg-white text-gray-700 border-2 border-gray-200 hover:border-gray-300'
                }
              `}
              title={day.name}
            >
              {day.label}
            </button>
          );
        })}
      </div>

      {/* מצב בחירה */}
      {maxSelections && value.length > 0 && (
        <p className="text-sm text-orange-500 mt-3 text-center">
          נבחרו {value.length}/{maxSelections} ימים
        </p>
      )}
    </div>
  );
}
