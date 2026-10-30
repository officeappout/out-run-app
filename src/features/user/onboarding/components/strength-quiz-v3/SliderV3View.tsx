'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { motion, useReducedMotion } from 'framer-motion';
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
import SwipeNudgeHint from './SwipeNudgeHint';
import { useStepPreview } from './useStepExerciseName';
import { useCarouselDrag } from './useCarouselDrag';
import { NUDGE_DURATION_S, NUDGE_REPEAT_DELAY_S, nudgeKeyframes } from './swipe-nudge';
import {
  isQuizV3Group,
  moveSelection,
  neighbourSteps,
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
  const rowRef = useRef<HTMLDivElement>(null);
  const reduce = !!useReducedMotion();
  const [rtl, setRtl] = useState(true);
  useEffect(() => {
    if (cardsRef.current) setRtl(getComputedStyle(cardsRef.current).direction === 'rtl');
  }, []);
  const drag = useCarouselDrag(cardsRef, rowRef, rtl, reduce);

  const selected = notYet ? -1 : selectedIndex;
  const cards = sliderCards(steps.length, selected, hasNotYet);
  const near = neighbourSteps(steps, selected);
  const easierPreview = useStepPreview(category, cards.easier === 'step' ? near.easier : null, demographics, lang);
  const harderPreview = useStepPreview(category, near.harder, demographics, lang);
  const firstExercise = cards.center === 'notYet' ? harderPreview.name : null;
  const nudging = hintVisible && !reduce;
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
    drag.settle();
    const dir = swipeDirection(e.clientX - start.x, e.clientY - start.y, rtl);
    if (dir !== 0) { justSwiped.current = true; move(dir); }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const start = swipeStart.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    drag.track(Math.abs(dx) > Math.abs(e.clientY - start.y) ? dx : 0);
  };

  const pressSide = (dir: -1 | 1) => {
    if (justSwiped.current) { justSwiped.current = false; return; }
    move(dir);
    drag.pulse();
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-v2-surface" data-quiz-v3-slider={category}>
      <QuizV3Header onBack={onBack} fillPercent={fillPercent} />
      <div className="flex flex-shrink-0 flex-col gap-3 px-5 pt-1">
        {isGroup
          ? <QuizProgressRow items={progress} size="sm" />
          : <QuizProgressRow items={[]} single={{ icon: skillIcon(category), label: skillName }} />}
        <div className="flex flex-col gap-1">
          <h1 className="text-[24px] font-black leading-[30px] tracking-v2-tight text-v2-ink">
            {isGroup ? t('quizV3.slider.title', { gender }) : t('quizV3.skill.title', { gender, skill: skillName })}
          </h1>
          <p className="text-[14px] leading-[21px] text-v2-ink-2">
            {isGroup ? t('quizV3.slider.subtitle', { group: category }) : t('quizV3.skill.subtitle', { gender })}
          </p>
        </div>
      </div>

      <div
        ref={cardsRef}
        className="relative flex min-h-[220px] flex-1 touch-pan-y items-center justify-center gap-2.5 px-2 py-2"
        onPointerDown={(e) => { justSwiped.current = false; swipeStart.current = { x: e.clientX, y: e.clientY }; }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { swipeStart.current = null; drag.settle(); }}
      >
        <motion.div
          className="h-full w-full"
          animate={nudging ? { x: nudgeKeyframes(rtl) } : { x: 0 }}
          transition={nudging ? { duration: NUDGE_DURATION_S, ease: 'easeInOut', repeat: Infinity, repeatDelay: NUDGE_REPEAT_DELAY_S } : { duration: 0.2 }}
        >
        <div ref={rowRef} className="flex h-full w-full items-center justify-center gap-2.5" data-card-row>
        <SliderSideCard
          kind="easier"
          hidden={!cards.easier}
          imageUrl={cards.easier === 'step' ? easierPreview.imageUrl : null}
          label={cards.easier === 'notYet' ? t('quizV3.skill.notYet', { gender }) : t('quiz.slider.easier')}
          ariaLabel={t('quizV3.slider.cardAria', { kind: 'easier' })}
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
                {t('quizV3.skill.notYet', { gender })}
                {firstExercise && <><br />{firstExercise}</>}
              </span>
              <span className="text-[13px] leading-[19px] text-v2-ink-2">{t('quizV3.skill.notYetBody')}</span>
            </div>
          ) : (
            <>
              <div className="relative min-h-0 flex-1 bg-[#dfe7ed]">
                <VideoPlayer tiers={tiers} activeTierId={activeTierId} className="h-full w-full" />
                <LevelChip kind="mine" label={t('quiz.slider.myLevel')} className="absolute start-2.5 top-2.5 z-10" />
              </div>
              {/* AD9: long names take two lines; level and reps sit on one line when they fit, else the reps
                  wrap whole onto a second line (never mid-phrase, never over each other). */}
              <div className={clsx('flex flex-col gap-1 px-3.5 py-3 text-start transition-opacity', contentFading && 'opacity-40')}>
                <span className="line-clamp-2 break-words text-[16px] font-black leading-5 text-v2-ink" data-exercise-name>
                  {exerciseLabel ?? t('quiz.slider.category', { category: category.toLowerCase(), name: category })}
                </span>
                <span className="flex flex-wrap items-baseline gap-x-2 text-[13px] leading-[18px] text-v2-ink-2" data-level-line>
                  <span className="whitespace-nowrap font-bold" data-level-part>{t('quizV3.slider.levelLine', { level })}</span>
                  {repsLabel && <span className="min-w-0" data-reps-part>{repsLabel}</span>}
                </span>
              </div>
            </>
          )}
        </div>

        <SliderSideCard
          kind="harder"
          hidden={!cards.harder}
          imageUrl={harderPreview.imageUrl}
          label={cards.center === 'notYet' ? firstExercise : t('quiz.slider.harder')}
          ariaLabel={t('quizV3.slider.cardAria', { kind: 'harder' })}
          onPress={() => pressSide(1)}
        />

        </div>
        </motion.div>

        {hintVisible && cards.center === 'step' && (
          <SwipeNudgeHint label={t('quizV3.slider.swipeHint', { gender })} rtl={rtl} reduce={reduce} />
        )}
      </div>

      <div className="flex flex-shrink-0 justify-center gap-1.5 pb-2" aria-hidden>
        {Array.from({ length: cards.dotCount }, (_, i) => (
          <span key={i} className={clsx('h-1.5 rounded-full', i === cards.activeDot ? 'w-[18px] bg-v2-accent' : 'w-1.5 bg-v2-pill-border')} />
        ))}
      </div>

      {isGroup && (
        <p className="mx-5 flex-shrink-0 rounded-2xl bg-v2-tint px-3.5 py-2.5 text-[13px] leading-5 text-v2-ink">
          {t('quizV3.slider.notSure', { gender })}
        </p>
      )}

      <div className="flex flex-shrink-0 flex-col gap-1 px-5 pb-3 pt-3">
        <Button variant="cta" size="lg" block onClick={notYet && onNotYet ? onNotYet : onConfirm}>
          {hasNotYet ? t('quizV3.skill.cta') : t('quiz.slider.cta.myLevel')}
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
          {t('quizV3.slider.help', { gender })}
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
            {t('quizV3.slider.helpClose')}
          </Button>
        </div>
      )}
    </div>
  );
}
