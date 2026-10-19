'use client';

/**
 * TimedRepsPanel — "כמה חזרות הספקת?" (board A-2d: the regular reps picker,
 * for the cut item only; A-4d: a minute that ended without "סיימתי").
 * Takes the bottom card's place, so the screen keeps ONE gradient CTA.
 */
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/v2';
import HorizontalPicker from '../../components/HorizontalPicker';
import { itemUnit } from '../logic/timed-labels';
import { promptEyebrow, promptInitialValue, type TimedPrompt } from '../logic/timed-prompt';
import TimedCardShell from './TimedCardShell';

export interface TimedRepsPanelProps {
  prompt: TimedPrompt;
  onSave: (reps: number) => void;
  onSkip: () => void;
}

export default function TimedRepsPanel({ prompt, onSave, onSkip }: TimedRepsPanelProps) {
  const unit = itemUnit(prompt.item);
  const target = prompt.item.targetReps ?? prompt.item.targetHoldSec ?? 10;
  const promptKey = prompt.kind === 'amrap_partial' ? `a-${prompt.round}-${prompt.itemIndex}` : `e-${prompt.minuteIndex}`;
  const [value, setValue] = useState(() => promptInitialValue(prompt));
  useEffect(() => setValue(promptInitialValue(prompt)), [promptKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <TimedCardShell eyebrow={promptEyebrow(prompt)}>
      <h3 className="mb-2 text-center text-[20px] font-black !tracking-[-0.02em] text-v2-ink">
        {unit === 'time' ? 'כמה שניות הספקת?' : 'כמה חזרות הספקת?'}
      </h3>
      <div className="mb-3">
        <HorizontalPicker min={0} max={Math.max(target * 2, 30)} targetValue={target} value={value} onChange={setValue} unitType={unit} />
      </div>
      <Button variant="cta" size="lg" block onClick={() => onSave(value)} className="mb-2">
        שמירה
      </Button>
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onSkip}
          className="whitespace-nowrap rounded-full bg-white px-5 py-2 text-[14px] font-extrabold text-v2-ink-2 shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          {prompt.kind === 'amrap_partial' ? 'לא הספקתי חזרות' : 'דלג'}
        </button>
      </div>
    </TimedCardShell>
  );
}
