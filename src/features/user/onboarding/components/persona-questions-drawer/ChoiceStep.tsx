'use client';

import React from 'react';
import { Check } from 'lucide-react';
import type { ChoiceQuestionConfig } from '@/types/persona-question.types';

interface ChoiceStepProps {
  config: ChoiceQuestionConfig;
  value?: string;
  onSelect: (value: string) => void;
}

/**
 * Fully generic — every future persona's simple closed-answer-set question
 * renders through this exact component, driven only by `config`. No code
 * change is ever needed here to support a new 'choice' question; that's
 * the whole point of the type (see persona-question.types.ts's header).
 */
export default function ChoiceStep({ config, value, onSelect }: ChoiceStepProps) {
  return (
    <div className="px-5 py-4" dir="rtl">
      <h3 className="text-base font-bold text-slate-900 mb-1">{config.label}</h3>
      {config.helperText && <p className="text-xs text-slate-400 mb-3">{config.helperText}</p>}
      <div className="flex flex-col gap-2 mt-3">
        {config.options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelect(option.value)}
              className={`flex items-center justify-between px-4 py-3 rounded-2xl border-2 text-right transition-all ${
                selected
                  ? 'border-[#00E5FF] bg-cyan-50 text-slate-900'
                  : 'border-slate-200 text-slate-700 active:scale-[0.98]'
              }`}
            >
              <span className="font-semibold">{option.label}</span>
              {selected && <Check size={18} className="text-[#00E5FF]" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
