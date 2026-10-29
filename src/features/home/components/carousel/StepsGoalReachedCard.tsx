'use client';

/**
 * StepsGoalReachedCard — the carousel's steps slot once today's step goal is met (pilot O4/O8,
 * 29.10.2026). Before: the slot fell back to a generic "easy walk" card with no word about the
 * goal, and a separate "goal reached" strip sat above the carousel. Now the one steps card says
 * the goal is done (a full ring with a check, canvas StepsOptions B) and still offers a walk.
 */

import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';
import { formatNumber } from '@/lib/i18n/core/fmt';

interface StepsGoalReachedCardProps {
  steps: number;
  /** Today's strength workout is done too: the title names both goals. */
  strengthDone: boolean;
  onWalkAnyway: () => void;
  isStarting?: boolean;
}

const ORANGE = '#f97316';

export function StepsGoalReachedCard({ steps, strengthDone, onWalkAnyway, isStarting = false }: StepsGoalReachedCardProps) {
  const t = useT(home);
  return (
    <div className="flex h-full w-full items-center justify-center" data-steps-goal-reached="true">
      <div className="w-full rounded-3xl bg-white p-5 text-start shadow-[0_10px_28px_rgba(0,0,0,0.14)]">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ boxShadow: `inset 0 0 0 4px ${ORANGE}` }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-black leading-tight text-gray-900">
              {t(strengthDone ? 'preWorkout.stepsDone.titleBoth' : 'preWorkout.stepsDone.title')}
            </h3>
            <p className="mt-1 text-[13px] font-semibold text-gray-500">
              {t('preWorkout.stepsDone.steps', { steps: formatNumber(steps, t.locale) })}
            </p>
          </div>
        </div>
        <p className="mt-3 text-[13px] font-semibold leading-snug text-gray-600">{t('preWorkout.stepsDone.body')}</p>
        <button
          type="button"
          onClick={onWalkAnyway}
          disabled={isStarting}
          className="mt-4 w-full rounded-full py-2.5 text-[14px] font-black text-white transition-opacity disabled:opacity-60"
          style={{ background: '#00ADEF' }}
        >
          {t('preWorkout.stepsDone.cta')}
        </button>
      </div>
    </div>
  );
}

/** "Walk anyway" after the goal: the route is sized for this many steps (about 1.5 km). */
export const GOAL_MET_BONUS_WALK_STEPS = 2000;
