'use client';

/**
 * TriadBreakdown — "פירוט" section of the exercise page for handstand / HSPU
 * exercises (owner idea, 31.10.2026): how much the exercise is strength,
 * balance and shoulder mobility, each on the 1-15 scale, plus a one-line
 * "mostly …" summary. Renders nothing for an unscored exercise.
 * Shown only while HANDSTAND_TRIAD_ENABLED (gated by the parent).
 */
import type { Exercise } from '../../core/exercise.types';
import { getTriadScores, primaryAxis } from '@/features/workout-engine/logic/handstand-triad/triad-scores';
import { TRIAD_AXES, TRIAD_MAX } from '@/features/workout-engine/logic/handstand-triad/triad.types';
import type { LibraryT } from '@/messages/ns/library';

const BAR_CLASS: Record<(typeof TRIAD_AXES)[number], string> = {
  strength: 'bg-indigo-500',
  balance: 'bg-purple-500',
  mobility: 'bg-emerald-500',
};

export default function TriadBreakdown({
  exercise,
  t,
  headingClass,
  headingStyle,
}: {
  exercise: Pick<Exercise, 'targetPrograms'>;
  t: LibraryT;
  headingClass: string;
  headingStyle?: React.CSSProperties;
}) {
  const scores = getTriadScores(exercise);
  if (!scores) return null;
  return (
    <section className="mb-6" data-testid="triad-breakdown">
      <h3 className={headingClass} style={headingStyle}>
        {t('exercises.detail.triad.title')}
      </h3>
      <ul className="space-y-2">
        {TRIAD_AXES.map((axis) => (
          <li key={axis} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-start text-[14px] text-slate-700">
              {t(`exercises.detail.triad.${axis}`)}
            </span>
            <span
              className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"
              role="meter"
              aria-valuemin={1}
              aria-valuemax={TRIAD_MAX}
              aria-valuenow={scores[axis]}
              aria-label={t(`exercises.detail.triad.${axis}`)}
            >
              <span
                className={`block h-full rounded-full ${BAR_CLASS[axis]}`}
                style={{ width: `${(scores[axis] / TRIAD_MAX) * 100}%` }}
              />
            </span>
            <span className="w-6 shrink-0 text-end text-[14px] tabular-nums text-slate-700">{scores[axis]}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-start text-[13px] text-slate-500">
        {t('exercises.detail.triad.mostly', { axis: primaryAxis(scores) })}
      </p>
    </section>
  );
}
