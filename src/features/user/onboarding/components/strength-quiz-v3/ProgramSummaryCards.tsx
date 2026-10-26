'use client';

/**
 * Board Done: the program cards as on the progress tab (ProgramsSection v2: brand arc on a hairline
 * track via CircularProgress). Full-body master card, then one row per muscle group.
 */
import CircularProgress from '@/components/CircularProgress';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import { GROUP_ICON } from './quiz-v3-model';
import type { ProgramSummary } from './quiz-v3-summary';

const FULL_BODY_ICON = '/icons/programs/full_body.svg';

export default function ProgramSummaryCards({ summary }: { summary: ProgramSummary }) {
  const t = useT(onboarding);
  const { master, rows } = summary;
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-4 rounded-[28px] bg-white p-[18px] shadow-v2-card" data-quiz-v3-master>
        <CircularProgress percentage={master.percent} size={92} strokeWidth={8} colorClass="text-v2-accent" trackClass="text-v2-hairline" className="shrink-0">
          <span className="flex flex-col items-center">
            <img src={FULL_BODY_ICON} alt="" className="w-7" />
            <span className="text-[12px] font-black text-v2-deep tabular-nums">{t('quizV3.done.percent', { percent: master.percent })}</span>
          </span>
        </CircularProgress>
        <div className="flex flex-col gap-0.5">
          <span className="text-[19px] font-black text-v2-ink">{t('quizV3.done.fullBody')}</span>
          <span className="text-[14px] font-extrabold text-v2-deep">{t('quizV3.done.level', { level: master.level })}</span>
          <span className="text-[12.5px] text-v2-muted">{t('quizV3.done.masterNote', { count: master.groupCount })}</span>
        </div>
      </div>

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((r) => (
          <li key={r.group} className="flex items-center gap-3 rounded-[20px] bg-white px-3 py-2.5 shadow-v2-ring" data-quiz-v3-row={r.group}>
            <CircularProgress percentage={r.percent} size={44} strokeWidth={4} colorClass="text-v2-accent" trackClass="text-v2-hairline" className="shrink-0">
              <img src={GROUP_ICON[r.group]} alt="" className="w-[22px]" />
            </CircularProgress>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-extrabold text-v2-ink">{t('quizV3.group.name', { group: r.group })}</span>
              <span className="text-[12.5px] font-bold text-v2-muted tabular-nums">{t('quizV3.done.level', { level: r.level })}</span>
            </span>
            <span className="text-[13px] font-extrabold text-v2-deep tabular-nums">{t('quizV3.done.percent', { percent: r.percent })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
