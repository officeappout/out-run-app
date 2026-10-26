'use client';

import { Button } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import type { Gender } from '@/lib/i18n/core/i18n-core';
import QuizV3Header from './QuizV3Header';
import QuizProgressRow from './QuizProgressRow';
import { muscleIcon, type ProgressItem, type TransitionModel } from './quiz-v3-model';

const LEMUR_PEEK = '/assets/lemur/lemur_curious_peek.png';

interface GroupTransitionProps {
  model: TransitionModel;
  progress: ProgressItem[];
  gender: Gender;
  fillPercent: number;
  onNext: () => void;
  onBack?: () => void;
}

function SavedCard({ model }: { model: TransitionModel }) {
  const t = useT(onboarding);
  const saved = model.saved;
  if (!saved) return null;
  return (
    <div className="flex items-center gap-2.5 rounded-[20px] bg-white px-3.5 py-3 shadow-v2-ring" data-quiz-v3-saved>
      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-[#e7fbf9]" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00877f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
      <span className="flex min-w-0 flex-col text-start">
        <span className="text-[15px] font-extrabold text-v2-ink">{t('quizV3.transition.saved', { group: saved.group })}</span>
        <span className="truncate text-[13px] text-v2-ink-2">
          {saved.exerciseName
            ? t('quizV3.transition.savedDetail', { exercise: saved.exerciseName, level: saved.level })
            : t('quizV3.transition.savedLevel', { level: saved.level })}
        </span>
      </span>
    </div>
  );
}

/** Boards Push / Pull: the screen before each muscle group's slider. Content is top-aligned. */
export default function GroupTransition({ model, progress, gender, fillPercent, onNext, onBack }: GroupTransitionProps) {
  const t = useT(onboarding);
  const cols = model.muscles.length >= 3 ? 'grid-cols-3' : model.muscles.length === 2 ? 'grid-cols-2' : 'grid-cols-1';
  return (
    <div className="flex h-full min-h-0 flex-col bg-v2-surface" data-quiz-v3-transition={model.group}>
      <QuizV3Header onBack={onBack} fillPercent={fillPercent} />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-3 pt-2">
        <QuizProgressRow items={progress} size="lg" />
        <div className="flex flex-col justify-start gap-[18px] pt-3">
          <SavedCard model={model} />
          <span className="self-start rounded-full bg-v2-tint px-3 py-1.5 text-[13px] font-extrabold text-v2-deep">
            {t('quizV3.transition.groupOf', { current: model.groupNumber, total: model.groupTotal })}
          </span>
          <h1 className="text-[34px] font-black leading-[40px] tracking-v2-tighter text-v2-ink">
            {t('quizV3.transition.title', { group: model.group })}
          </h1>
          <p className="text-[16px] leading-6 text-v2-ink-2">{t('quizV3.transition.body', { group: model.group })}</p>
          <div className={`grid gap-2.5 ${cols}`}>
            {model.muscles.map((m) => (
              <div key={m} className="flex flex-col items-center gap-2 rounded-[20px] bg-white px-2 pb-3 pt-4 shadow-v2-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={muscleIcon(m)} alt="" className="h-11" />
                <span className="text-[14px] font-extrabold text-v2-ink">{t('quizV3.transition.muscle', { muscle: m })}</span>
              </div>
            ))}
          </div>
          {model.showLemur && (
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LEMUR_PEEK} alt={t('quizV3.transition.lemurAlt')} className="h-16 w-16 object-contain" />
              <p className="rounded-[18px] rounded-ee-[6px] bg-white px-3.5 py-2.5 text-[14px] leading-[21px] text-v2-ink shadow-v2-ring">
                {t('quizV3.transition.lemur', { gender })}
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="flex-shrink-0 px-5 pb-3 pt-2">
        <Button variant="cta" size="lg" block onClick={onNext}>
          {model.isFirst ? t('quizV3.transition.ctaFirst') : t('quizV3.transition.ctaNext', { group: model.group })}
        </Button>
      </div>
    </div>
  );
}
