'use client';

/**
 * Board Done: the program cards as on the progress tab (ProgramsSection v2: brand arc on a hairline
 * track via CircularProgress). Full-body master card, one row per muscle group, then the skill
 * programs (owner 28.10, Y11). Y10: the rows come in one by one, the parent card last.
 */
import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import CircularProgress from '@/components/CircularProgress';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import { GROUP_ICON, skillIcon } from './quiz-v3-model';
import { cardEnterDelays, type ProgramSummary, type SkillSummaryRow } from './quiz-v3-summary';

function Enter({ delay, reduce, children, ...rest }: { delay: number; reduce: boolean; children: ReactNode; className?: string; [k: `data-${string}`]: string }) {
  if (reduce) return <li {...rest}>{children}</li>;
  return (
    <motion.li
      {...rest}
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 320, damping: 26 }}
    >
      {children}
    </motion.li>
  );
}

const FULL_BODY_ICON = '/icons/programs/full_body.svg';

export default function ProgramSummaryCards({ summary, skills = [] }: { summary: ProgramSummary; skills?: SkillSummaryRow[] }) {
  const t = useT(onboarding);
  const reduce = !!useReducedMotion();
  const { master, rows } = summary;
  const delays = cardEnterDelays(rows.length + skills.length);
  const row = 'flex items-center gap-3 rounded-[20px] bg-white px-3 py-2.5 shadow-v2-ring';
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      <Enter delay={delays.master} reduce={reduce} className="mb-1.5 flex items-center gap-4 rounded-[28px] bg-white p-[18px] shadow-v2-card" data-quiz-v3-master="">
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
      </Enter>

      {rows.map((r, i) => (
        <Enter key={r.group} delay={delays.children[i]} reduce={reduce} className={row} data-quiz-v3-row={r.group}>
          <CircularProgress percentage={r.percent} size={44} strokeWidth={4} colorClass="text-v2-accent" trackClass="text-v2-hairline" className="shrink-0">
            <img src={GROUP_ICON[r.group]} alt="" className="w-[22px]" />
          </CircularProgress>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[15px] font-extrabold text-v2-ink">{t('quizV3.group.name', { group: r.group })}</span>
            <span className="text-[12.5px] font-bold text-v2-muted tabular-nums">{t('quizV3.done.level', { level: r.level })}</span>
          </span>
          <span className="text-[13px] font-extrabold text-v2-deep tabular-nums">{t('quizV3.done.percent', { percent: r.percent })}</span>
        </Enter>
      ))}

      {skills.map((s, i) => (
        <Enter key={s.skillId} delay={delays.children[rows.length + i]} reduce={reduce} className={row} data-quiz-v3-skill={s.skillId}>
          <CircularProgress percentage={0} size={44} strokeWidth={4} colorClass="text-v2-accent" trackClass="text-v2-hairline" className="shrink-0">
            <img src={skillIcon(s.skillId)} alt="" className="w-[22px]" />
          </CircularProgress>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[15px] font-extrabold text-v2-ink">{t('quiz.slider.category', { category: s.skillId, name: s.skillId })}</span>
            <span className="text-[12.5px] font-bold text-v2-muted tabular-nums">{t('quizV3.done.level', { level: s.level })}</span>
          </span>
        </Enter>
      ))}
    </ul>
  );
}
