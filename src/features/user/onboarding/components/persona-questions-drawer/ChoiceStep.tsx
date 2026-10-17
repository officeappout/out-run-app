'use client';

import React from 'react';
import { Check } from 'lucide-react';
import type { ChoiceQuestionConfig } from '@/types/persona-question.types';

interface ChoiceStepProps {
  config: ChoiceQuestionConfig;
  value?: string;
  onSelect: (value: string) => void;
  /** enable_home_v2 look. Optional, default false = today's UI. */
  v2?: boolean;
}

/**
 * Fully generic — every future persona's simple closed-answer-set question
 * renders through this exact component, driven only by `config`. No code
 * change is ever needed here to support a new 'choice' question; that's
 * the whole point of the type (see persona-question.types.ts's header).
 */
export default function ChoiceStep({ config, value, onSelect, v2 = false }: ChoiceStepProps) {
  if (v2) {
    return (
      <div className="px-5 py-4" dir="rtl">
        <h3 className="mb-1 text-[17px] font-black !tracking-[-0.01em] text-v2-ink">{config.label}</h3>
        {config.helperText && <p className="mb-3 text-[12.5px] font-bold text-v2-muted">{config.helperText}</p>}
        <div className="mt-3 flex flex-col gap-2.5 p-0.5">
          {config.options.map((option) => {
            const selected = value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onSelect(option.value)}
                aria-pressed={selected}
                className={`flex h-14 min-w-0 items-center justify-between gap-3 rounded-[18px] bg-white px-4 text-right transition-[transform,box-shadow] duration-150 ease-v2 active:scale-[0.97] ${
                  selected ? 'shadow-v2-card ring-2 ring-v2-accent' : 'shadow-v2-ring'
                }`}
              >
                <span className="min-w-0 truncate whitespace-nowrap text-[15px] font-extrabold text-v2-ink">{option.label}</span>
                <span
                  className={`grid h-6 w-6 flex-shrink-0 place-items-center rounded-full ${
                    selected ? 'bg-v2-accent' : 'bg-v2-surface ring-[1.5px] ring-inset ring-v2-pill-border'
                  }`}
                >
                  {selected && <Check size={14} strokeWidth={3} className="text-white" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }
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
