"use client";

import React from 'react';
import { getTranslation, DictionaryKey } from '@/lib/i18n/dictionaries';
import { useAppStore } from '@/store/useAppStore';
import { QuestionOption } from '../types';

interface SimpleSelectionProps {
  options: QuestionOption[];
  value: any;
  onChange: (value: any, optionId: string) => void;
  columns?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

export default function SimpleSelection({
  options,
  value,
  onChange,
  columns = 1,
}: SimpleSelectionProps) {
  const { language } = useAppStore();

  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-6',
    7: 'grid-cols-7',
  }[columns];

  return (
    <div className={`grid ${gridCols} gap-3 w-full`}>
      {options.map((option) => {
        const isSelected = value === option.value;
        const label = typeof option.labelKey === 'string' && option.labelKey.startsWith('onboarding.')
          ? getTranslation(option.labelKey as DictionaryKey, language)
          : option.labelKey;

        return (
          <button
            key={option.id}
            onClick={() => onChange(option.value, option.id)}
            className={`
              px-4 py-3 rounded-2xl
              font-semibold text-base
              transition-all duration-200
              active:scale-95
              ${isSelected
                ? 'bg-[#00E5FF] text-white shadow-md shadow-[#00E5FF]/30'
                : 'bg-white text-gray-700 border-2 border-gray-200 hover:border-gray-300'
              }
            `}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
