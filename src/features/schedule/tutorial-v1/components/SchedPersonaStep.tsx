'use client';

/**
 * ל2 (board SchedPersona): the existing routine question (PersonaStep, its own store writes and CTA)
 * with the tutorial's progress line and the lemur's "mark everything that fits" tip.
 */
import type { ReactNode } from 'react';
import { useT } from '@/hooks/useT';
import { schedule } from '@/messages/ns/schedule';
import PersonaStep from '@/features/user/onboarding/components/steps/PersonaStep';
import LemurNote from './LemurNote';

export default function SchedPersonaStep({ step, total, onNext }: { step: number; total: number; onNext: () => void }) {
  const t = useT(schedule);
  const b = (c: ReactNode) => <b>{c}</b>;
  return (
    <div className="flex h-full flex-col px-4 pb-4 pt-3">
      <p className="mb-2 text-center text-[13px] font-extrabold text-v2-ink-2">{t('tutorial.progress', { step, total })}</p>
      <div className="min-h-0 flex-1">
        <PersonaStep onNext={onNext} coach={<LemurNote>{t.rich('tutorial.persona.coach', { b })}</LemurNote>} />
      </div>
    </div>
  );
}
