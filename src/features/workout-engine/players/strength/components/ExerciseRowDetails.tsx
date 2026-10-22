'use client';

/**
 * ExerciseRowDetails — enable_strength_drawer_v1: an exercise row's
 * "פרטי התרגיל" in the session list. Collapsed by default; open = the same
 * ExerciseDetailContent the live card shows (muscles, cues, goal, equipment)
 * in its compact variant, plus "הסבר מלא בווידאו" when the exercise has a
 * long-form tutorial (the same fullscreen overlay as the video's chip,
 * portalled to <body> so the list's transforms never trap it).
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, PlayCircle } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import { useUiGender } from '@/hooks/useUiGender';
import ExerciseDetailContent from './ExerciseDetailContent';
import FullTutorialOverlay from './FullTutorialOverlay';
import { toRowDetails, type RowDetailsSource } from '../logic/exercise-row-details';

export interface ExerciseRowDetailsProps {
  exercise: RowDetailsSource;
  workoutLocation?: string | null;
  className?: string;
}

export default function ExerciseRowDetails({ exercise, workoutLocation, className = '' }: ExerciseRowDetailsProps) {
  const t = useT(player);
  const gender = useUiGender();
  const [open, setOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const d = toRowDetails(exercise, gender);
  if (!d.hasAny) return null;

  return (
    <div dir="rtl" className={className} style={{ fontFamily: 'var(--font-simpler)' }} data-exercise-row-details="">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-expanded={open}
        aria-label={t('strength.details.toggleAria')}
        className="flex w-full items-center justify-between gap-2 py-1.5 text-[13px] font-extrabold text-v2-deep"
      >
        <span>{t('strength.details.toggle')}</span>
        <ChevronDown size={16} aria-hidden className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="-mx-1">
          {d.tutorial && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setTutorialOpen(true); }}
              className="mb-1 inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-[13px] font-extrabold text-v2-ink shadow-v2-ring active:scale-[0.97] transition-transform duration-150"
            >
              <PlayCircle size={16} aria-hidden className="text-v2-deep" />
              {t('strength.tutorial.rowItem')}
            </button>
          )}
          <ExerciseDetailContent
            exerciseName={d.name}
            videoUrl={null}
            hideHeroVideo
            hideTitle
            compact
            primaryMuscle={d.primaryMuscle}
            secondaryMuscles={d.secondaryMuscles}
            cues={d.cues}
            goal={d.goal}
            equipment={d.equipment}
            workoutLocation={workoutLocation ?? undefined}
          />
        </div>
      )}
      {tutorialOpen && d.tutorial && typeof document !== 'undefined' &&
        createPortal(
          <FullTutorialOverlay video={d.tutorial} exerciseName={d.name} onClose={() => setTutorialOpen(false)} />,
          document.body,
        )}
    </div>
  );
}
