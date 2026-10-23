'use client';

import React from 'react';
import { TV_CODE_LENGTH } from '../core/constants';
import { normalizeCode } from '../core/code';

/**
 * Six boxes over ONE numeric input (paste, autofill and the OS keyboard all just work).
 * Boxes are LTR: a code reads left to right in every language.
 */
export default function TvCodeInput({ value, onChange, label, invalid }: { value: string; onChange: (v: string) => void; label: string; invalid?: boolean }) {
  return (
    <div className="relative" dir="ltr">
      <input
        value={value}
        onChange={(e) => onChange(normalizeCode(e.target.value))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={TV_CODE_LENGTH * 2}
        aria-label={label}
        aria-invalid={invalid || undefined}
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
      />
      <div className="flex gap-2" aria-hidden="true">
        {Array.from({ length: TV_CODE_LENGTH }, (_, i) => {
          const active = i === Math.min(value.length, TV_CODE_LENGTH - 1);
          return (
            <span
              key={i}
              className={`grid h-14 min-w-0 flex-1 place-items-center rounded-[14px] bg-white text-[26px] font-black ${
                invalid ? 'shadow-[0_0_0_2px_#ef4444]' : active ? 'shadow-[0_0_0_2px_#00baf7]' : 'shadow-[0_0_0_1px_rgba(14,27,42,0.08)]'
              }`}
            >
              {value[i] ?? ''}
            </span>
          );
        })}
      </div>
    </div>
  );
}
