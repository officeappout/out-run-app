'use client';

/**
 * "הידעת?" (board Done): where the user stands against people of the same gender and age.
 * Renders nothing without a real norms source (isRenderableNormsFact). None is wired yet:
 * TODO(strength-quiz-v3): pass a fact once a norms table (ACSM / OUT data) exists. Never invent numbers.
 */
import type { Gender } from '@/lib/i18n/core/i18n-core';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import { isRenderableNormsFact, type NormsFact } from './quiz-v3-summary';

export default function NormsFactBubble({ fact, gender }: { fact?: NormsFact | null; gender: Gender }) {
  const t = useT(onboarding);
  if (!isRenderableNormsFact(fact)) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-[20px] bg-[#fff8e8] px-3.5 py-3 shadow-[0_0_0_1px_rgba(180,95,6,0.18)]" data-quiz-v3-fact>
      <span className="grid h-[30px] w-[30px] flex-shrink-0 place-items-center rounded-full bg-v2-gold text-[15px] font-black text-v2-on-gold" aria-hidden>
        ?
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[14px] font-black text-v2-on-gold">{t('quizV3.done.factTitle')}</span>
        <span className="text-[14px] leading-[21px] text-v2-ink">
          {t('quizV3.done.fact', { gender, group: fact.group, percentile: Math.round(fact.percentile) })}
        </span>
        <span className="text-[12px] text-v2-on-gold">{t('quizV3.done.factSource', { source: fact.source })}</span>
      </span>
    </div>
  );
}
