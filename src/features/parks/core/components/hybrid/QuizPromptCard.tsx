'use client';

/**
 * QuizPromptCard — the map carousel's questionnaire card, new look (enable_map_tutorial_v1, board M8,
 * pilot note L11): the gradient card of the home "what first?" drawer, with the lemur. Same onArm /
 * consumeArmed anti-ghost-click contract as AssessmentPromptCard; the whole card is the tap target.
 */
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';

export default function QuizPromptCard({ onSelect, onArm, consumeArmed }: {
  onSelect: () => void;
  onArm: () => void;
  consumeArmed: () => boolean;
}) {
  const t = useT(map);
  return (
    <button
      type="button"
      onPointerDown={onArm}
      onClick={(e) => {
        e.stopPropagation();
        if (!consumeArmed()) return;
        onSelect();
      }}
      className="relative flex w-full flex-col items-start gap-1 overflow-hidden rounded-[22px] p-4 text-start text-white transition-transform duration-150 ease-v2 active:scale-[0.99]"
      style={{ background: 'linear-gradient(135deg, #0cf2e3, #00baf7)', boxShadow: '0 14px 30px rgba(32,198,214,.35)' }}
    >
      <span className="rounded-full bg-white/25 px-2.5 py-0.5 text-[11.5px] font-extrabold">{t('mapTutorial.quiz.tag')}</span>
      <span className="text-[18px] font-black">{t('mapTutorial.quiz.title')}</span>
      <span className="max-w-[230px] text-[13px] opacity-95">{t('mapTutorial.quiz.sub')}</span>
      <span className="mt-1.5 rounded-full bg-white px-3.5 py-1.5 text-[13px] font-black text-[#04222b]">{t('mapTutorial.quiz.cta')}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/lemur/lemur_curious_peek.png" alt="" aria-hidden className="pointer-events-none absolute bottom-2 end-2.5 w-[70px]" />
    </button>
  );
}
