'use client';

import { useRef, useState } from 'react';
import clsx from 'clsx';
import { Pointer } from 'lucide-react';
import { Button } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import type { Gender } from '@/lib/i18n/core/i18n-core';
import VideoPlayer, { type VideoTier } from '../visual-assessment/VideoPlayer';
import type { UserDemographics } from '../../types/visual-assessment.types';
import QuizV3Header from './QuizV3Header';
import QuizProgressRow from './QuizProgressRow';
import SliderSideCard from './SliderSideCard';
import LevelChip from './LevelChip';
import { useStepExerciseName } from './useStepExerciseName';
import {
  isQuizV3Group,
  moveSelection,
  skillIcon,
  sliderCards,
  swipeDirection,
  type ProgressItem,
} from './quiz-v3-model';

export interface SliderV3ViewProps {
  category: string;
  gender: Gender;
  demographics: UserDemographics;
  lang: string;
  progress: ProgressItem[];
  fillPercent: number;
  steps: number[];
  /** VisualSlider's sliderVal (a step index). */
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  tiers: VideoTier[];
  activeTierId: string | null;
  exerciseLabel: string | null;
  repsLabel: string | null;
  level: number;
  contentFading: boolean;
  /** Skill sliders: the existing "not yet" escape, now the first card. */
  onNotYet?: () => void;
  onConfirm: () => void;
  onBack?: () => void;
}

/** Boards Slider / SliderSkill: three cards (easier, the chosen one, harder), swipe or tap a side. */
export default function SliderV3View(props: SliderV3ViewProps) {
  const {
    category, gender, demographics, lang, progress, fillPercent, steps, selectedIndex, onSelectIndex,
    tiers, activeTierId, exerciseLabel, repsLabel, level, contentFading, onNotYet, onConfirm, onBack,
  } = props;
  const t = useT(onboarding);
  const isGroup = isQuizV3Group(category);
  const hasNotYet = !isGroup && !!onNotYet;
  const [notYet, setNotYet] = useState(hasNotYet);
  const [hintVisible, setHintVisible] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  // A mouse swipe that starts on a side card also clicks it: that click must not move again.
  const justSwiped = useRef(false);
  const cardsRef = useRef<HTMLDivElement>(null);

  const selected = notYet ? -1 : selectedIndex;
  const cards = sliderCards(steps.length, selected, hasNotYet);
  const firstExercise = useStepExerciseName(category, hasNotYet ? steps[0] ?? null : null, demographics, lang);
  const skillName = t('quiz.slider.category', { category: category.toLowerCase(), name: category });

  const move = (dir: -1 | 1) => {
    setHintVisible(false);
    const next = moveSelection(steps.length, selected, dir, hasNotYet);
    if (next === selected) return;
    if (next < 0) { setNotYet(true); return; }
    setNotYet(false);
    if (next !== selectedIndex) onSelectIndex(next);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const rtl = cardsRef.current ? getComputedStyle(cardsRef.current).direction === 'rtl' : true;
    const dir = swipeDirection(e.clientX - start.x, e.clientY - start.y, rtl);
    if (dir !== 0) { justSwiped.current = true; move(dir); }
  };

  const pressSide = (dir: -1 | 1) => {
    if (justSwiped.current) { justSwiped.current = false; return; }
    move(dir);
  };

  const levelLine = repsLabel
    ? t('quiz.v3.slider.levelWithMax', { level, max: repsLabel })
    : t('quiz.v3.slider.levelLine', { level });

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-v2-surface" data-quiz-v3-slider={category}>
      <QuizV3Header onBack={onBack} fillPercent={fillPercent} />
      <div className="flex flex-shrink-0 flex-col gap-3 px-5 pt-1">
        {isGroup
          ? <QuizProgressRow items={progress} size="sm" />
          : <QuizProgressRow items={[]} single={{ icon: skillIcon(category), label: skillName }} />}
        <div className="flex flex-col gap-1">
          <h1 className="text-[24px] font-black leading-[30px] tracking-v2-tight text-v2-ink">
            {isGroup ? t('quiz.v3.slider.title', { gender }) : t('quiz.v3.skill.title', { gender, skill: skillName })}
          </h1>
          <p className="text-[14px] leading-[21px] text-v2-ink-2">
            {isGroup ? t('quiz.v3.slider.subtitle', { group: category }) : t('quiz.v3.skill.subtitle', { gender })}
          </p>
        </div>
      </div>

      <div
        ref={cardsRef}
        className="relative flex min-h-[220px] flex-1 touch-pan-y items-center justify-center gap-2.5 px-2 py-2"
        onPointerDown={(e) => { justSwiped.current = false; swipeStart.current = { x: e.clientX, y: e.clientY }; }}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { swipeStart.current = null; }}
      >
        <SliderSideCard
          kind="easier"
          hidden={!cards.easier}
          label={cards.easier === 'notYet' ? t('quiz.v3.skill.notYet', { gender }) : t('quiz.slider.easier')}
          ariaLabel={t('quiz.v3.slider.cardAria', { kind: 'easier' })}
          onPress={() => pressSide(-1)}
        />

        <div
          className="flex h-full max-h-[372px] w-[50%] max-w-[220px] flex-shrink-0 flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_0_0_3px_#00baf7,0_28px_56px_-24px_rgba(9,30,50,0.45)]"
          data-center-card={cards.center}
        >
          {cards.center === 'notYet' ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3.5 p-5 text-center">
              <span className="grid h-24 w-24 place-items-center rounded-full bg-v2-tint">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={skillIcon(category)} alt="" className="w-16" />
              </span>
              <span className="text-[18px] font-black leading-6 text-v2-ink">
                {t('quiz.v3.skill.notYet', { gender })}
                {firstExercise && <><br />{firstExercise}</>}
              </span>
              <span className="text-[13px] leading-[19px] text-v2-ink-2">{t('quiz.v3.skill.notYetBody')}</span>
            </div>
          ) : (
            <>
              <div className="relative min-h-0 flex-1 bg-[#dfe7ed]">
                <VideoPlayer tiers={tiers} activeTierId={activeTierId} className="h-full w-full" />
                <LevelChip kind="mine" label={t('quiz.slider.myLevel')} className="absolute start-2.5 top-2.5 z-10" />
              </div>
              <div className={clsx('flex flex-col gap-0.5 px-3.5 py-3 text-start transition-opacity', contentFading && 'opacity-40')}>
                <span className="truncate text-[16px] font-black text-v2-ink">
                  {exerciseLabel ?? t('quiz.slider.category', { category: category.toLowerCase(), name: category })}
                </span>
                <span className="truncate text-[13px] text-v2-ink-2">{levelLine}</span>
              </div>
            </>
          )}
        </div>

        <SliderSideCard
          kind="harder"
          hidden={!cards.harder}
          label={cards.center === 'notYet' ? firstExercise : t('quiz.slider.harder')}
          ariaLabel={t('quiz.v3.slider.cardAria', { kind: 'harder' })}
          onPress={() => pressSide(1)}
        />

        {hintVisible && (
          <div
            className="pointer-events-none absolute bottom-[12%] left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-[rgba(14,20,25,0.86)] px-3.5 py-2.5 text-white"
            data-swipe-hint
          >
            <Pointer size={22} strokeWidth={2} aria-hidden />
            <span className="text-[14px] font-extrabold">{t('quiz.v3.slider.swipeHint', { gender })}</span>
          </div>
        )}
      </div>

      <div className="flex flex-shrink-0 justify-center gap-1.5 pb-2" aria-hidden>
        {Array.from({ length: cards.dotCount }, (_, i) => (
          <span key={i} className={clsx('h-1.5 rounded-full', i === cards.activeDot ? 'w-[18px] bg-v2-accent' : 'w-1.5 bg-v2-pill-border')} />
        ))}
      </div>

      {isGroup && (
        <p className="mx-5 flex-shrink-0 rounded-2xl bg-v2-tint px-3.5 py-2.5 text-[13px] leading-5 text-v2-ink">
          {t('quiz.v3.slider.notSure', { gender })}
        </p>
      )}

      <div className="flex flex-shrink-0 flex-col gap-1 px-5 pb-3 pt-3">
        <Button variant="cta" size="lg" block onClick={notYet && onNotYet ? onNotYet : onConfirm}>
          {hasNotYet ? t('quiz.v3.skill.cta') : t('quiz.slider.cta.myLevel')}
        </Button>
        <button
          type="button"
          onClick={() => { setHintVisible(true); setHelpOpen(true); }}
          className="flex h-10 items-center justify-center gap-1.5 text-[13px] font-extrabold text-v2-deep"
          data-help-link
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" />
          </svg>
          {t('quiz.v3.slider.help', { gender })}
        </button>
      </div>

      {helpOpen && (
        // Stub help (owner: "opens the existing tutorial / hint again"): the slider tutorial's own lines.
        <div className="absolute inset-x-4 bottom-28 z-30 rounded-3xl bg-white p-5 shadow-v2-float" role="dialog" data-help-card>
          <div className="space-y-3 text-center text-[15px] font-medium leading-snug text-v2-ink">
            <p>{t('quiz.slider.tutorial.drag', { gender })}</p>
            <p>{t('quiz.slider.tutorial.checkMin', { gender })}</p>
            <p className="text-[13px] font-normal text-v2-muted">{t('quiz.slider.tutorial.notSure', { gender })}</p>
          </div>
          <Button variant="dark" size="md" block className="mt-4" onClick={() => setHelpOpen(false)}>
            {t('quiz.v3.slider.helpClose')}
          </Button>
        </div>
      )}
    </div>
  );
}
