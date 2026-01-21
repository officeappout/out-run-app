"use client";

import React, { useState, useRef, useCallback } from 'react';
import { getTranslation, DictionaryKey } from '@/lib/i18n/dictionaries';
import { useAppStore } from '@/store/useAppStore';

interface DatePickerProps {
  value?: Date;
  onChange: (date: Date) => void;
  minAge?: number;
  descriptionKey?: DictionaryKey;
}

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
];

export default function DatePicker({
  value,
  onChange,
  minAge = 14,
  descriptionKey,
}: DatePickerProps) {
  const { language } = useAppStore();
  const description = descriptionKey ? getTranslation(descriptionKey, language) : null;

  // אתחול ישיר מ-props - פונקציה מותחלת רק פעם אחת
  // שימוש בפונקציית אתחול כדי למנוע קריאות חוזרות
  const [day, setDay] = useState(() => value?.getDate() || '');
  const [month, setMonth] = useState(() => (value ? value.getMonth() + 1 : ''));
  const [year, setYear] = useState(() => value?.getFullYear() || '');

  // שימוש ב-ref כדי למנוע dependency loop
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const currentYear = new Date().getFullYear();
  const minYear = currentYear - 100;
  const maxYear = currentYear - minAge;

  // פונקציה לעדכון התאריך - נקראת רק כשהמשתמש משנה ערך
  // ללא value ב-dependencies כדי למנוע infinite loops
  const updateDate = useCallback((newDay: string | number, newMonth: string | number, newYear: string | number) => {
    if (newDay && newMonth && newYear) {
      const dayNum = parseInt(newDay.toString());
      const monthNum = parseInt(newMonth.toString());
      const yearNum = parseInt(newYear.toString());

      if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= minYear && yearNum <= maxYear) {
        try {
          const date = new Date(yearNum, monthNum - 1, dayNum);
          // וידוא שהתאריך נוצר כראוי
          if (date.getDate() === dayNum && date.getMonth() === monthNum - 1 && date.getFullYear() === yearNum) {
            // קריאה ל-onChange דרך ref (ללא dependencies)
            onChangeRef.current(date);
          }
        } catch (e) {
          // תאריך לא תקין - לא מעדכן
        }
      }
    }
  }, [minYear, maxYear]);

  return (
    <div className="w-full">
      {description && (
        <p className="text-sm text-gray-600 mb-4 text-center">
          {description}
        </p>
      )}

      <div className="flex gap-3 justify-center">
        {/* יום */}
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-2 text-center">
            יום
          </label>
          <input
            type="number"
            min="1"
            max="31"
            value={day}
            onChange={(e) => {
              const newDay = e.target.value ? parseInt(e.target.value) : '';
              setDay(newDay);
              if (newDay && month && year) {
                updateDate(newDay, month, year);
              }
            }}
            placeholder="יום"
            className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 focus:border-[#00E5FF] focus:outline-none text-center text-lg font-semibold"
          />
        </div>

        {/* חודש */}
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-2 text-center">
            חודש
          </label>
          <select
            value={month}
            onChange={(e) => {
              const newMonth = e.target.value ? parseInt(e.target.value) : '';
              setMonth(newMonth);
              if (day && newMonth && year) {
                updateDate(day, newMonth, year);
              }
            }}
            className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 focus:border-[#00E5FF] focus:outline-none text-center text-lg font-semibold appearance-none bg-white"
          >
            <option value="">חודש</option>
            {HEBREW_MONTHS.map((monthName, index) => (
              <option key={index + 1} value={index + 1}>
                {monthName}
              </option>
            ))}
          </select>
        </div>

        {/* שנה */}
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-2 text-center">
            שנה
          </label>
          <input
            type="number"
            min={minYear}
            max={maxYear}
            value={year}
            onChange={(e) => {
              const newYear = e.target.value ? parseInt(e.target.value) : '';
              setYear(newYear);
              if (day && month && newYear) {
                updateDate(day, month, newYear);
              }
            }}
            placeholder="שנה"
            className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 focus:border-[#00E5FF] focus:outline-none text-center text-lg font-semibold"
          />
        </div>
      </div>
    </div>
  );
}
