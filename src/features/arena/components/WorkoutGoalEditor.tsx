'use client';

import type { ReactNode } from 'react';
import type { SessionGoalSpec } from '@/types/community.types';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

interface WorkoutGoalEditorProps {
  value: SessionGoalSpec | undefined;
  onChange: (goal: SessionGoalSpec | undefined) => void;
  variant?: 'admin' | 'app';
}

const PILL_TYPES = [null, 'distance', 'time'] as const;
type PillType = (typeof PILL_TYPES)[number];

export function WorkoutGoalEditor({ value, onChange, variant = 'app' }: WorkoutGoalEditorProps) {
  const t = useT(community);
  const goalType = value?.type ?? null;

  function handlePillClick(type: PillType) {
    if (type === null) {
      onChange(undefined);
      return;
    }
    onChange({
      kind: 'goal',
      type,
      value: value?.type === type ? value.value : type === 'distance' ? 5 : 30 * 60,
    });
  }

  const valueText = value
    ? t('goalEditor.value', {
        type: value.type,
        value: value.type === 'distance' ? value.value.toFixed(1) : String(Math.round(value.value / 60)),
      })
    : '';

  if (variant === 'app') {
    return (
      <div>
        <p className="text-xs font-bold text-gray-500 mb-2">
          {t.rich('goalEditor.title', {
            muted: (chunks: ReactNode) => <span className="font-normal text-gray-400">{chunks}</span>,
          })}
        </p>
        <div className="flex gap-2 mb-3">
          {PILL_TYPES.map((type) => (
            <button
              key={String(type)}
              type="button"
              onClick={() => handlePillClick(type)}
              className={`flex-1 py-2.5 rounded-2xl text-xs font-black transition-all active:scale-95 ${
                goalType === type
                  ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {type === null ? t('goalEditor.none') : type === 'distance' ? t('goalEditor.pill.distance') : t('goalEditor.pill.time')}
            </button>
          ))}
        </div>
        {value && (
          <div className="bg-gray-50 rounded-2xl px-4 py-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">
                {value.type === 'distance' ? t('goalEditor.label.distance') : t('goalEditor.label.time')}
              </span>
              <span className="text-base font-black text-emerald-600 tabular-nums">
                {valueText}
              </span>
            </div>
            <input
              type="range"
              min={value.type === 'distance' ? 1 : 15 * 60}
              max={value.type === 'distance' ? 20 : 120 * 60}
              step={value.type === 'distance' ? 0.5 : 5 * 60}
              value={value.value}
              onChange={(e) => onChange({ ...value, value: Number(e.target.value) })}
              className="w-full accent-emerald-500"
            />
          </div>
        )}
      </div>
    );
  }

  // Admin variant — compact desktop styling. Admin copy stays Hebrew-only (PLAN decision 1).
  return (
    <div>
      <label className="text-[10px] font-bold text-gray-500 mb-1 block">
        יעד אימון <span className="text-gray-300 font-normal">(ברירת מחדל לכל משתתף)</span>
      </label>
      <div className="flex gap-1 mb-2">
        {PILL_TYPES.map((type) => (
          <button
            key={String(type)}
            type="button"
            onClick={() => handlePillClick(type)}
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-all ${
              goalType === type
                ? 'bg-emerald-500 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {type === null ? 'ללא יעד' : type === 'distance' ? 'מרחק' : 'זמן'}
          </button>
        ))}
      </div>
      {value && (
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={value.type === 'distance' ? 1 : 15 * 60}
            max={value.type === 'distance' ? 20 : 120 * 60}
            step={value.type === 'distance' ? 0.5 : 5 * 60}
            value={value.value}
            onChange={(e) => onChange({ ...value, value: Number(e.target.value) })}
            className="flex-1 accent-emerald-500"
          />
          <span className="text-xs font-bold text-emerald-600 w-16 text-center tabular-nums">
            {valueText}
          </span>
        </div>
      )}
    </div>
  );
}
