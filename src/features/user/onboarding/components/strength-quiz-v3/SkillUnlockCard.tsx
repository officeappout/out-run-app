'use client';

/** One unlocked skill on screen 5a (board SkillUnlock): estimate, selection, and when selected the 3-step mini map. */
import clsx from 'clsx';
import type { Gender } from '@/lib/i18n/core/i18n-core';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import type { UserDemographics } from '../../types/visual-assessment.types';
import { skillIcon } from './quiz-v3-model';
import type { UnlockedSkill } from './skill-unlock';
import { useQuizV3Ladder } from './useQuizV3Ladder';

interface SkillUnlockCardProps {
  skill: UnlockedSkill;
  /** The level shown: the estimate, or what the short questionnaire refined. */
  level: number;
  selected: boolean;
  gender: Gender;
  demographics: UserDemographics | null;
  onToggle: () => void;
  onRefine: () => void;
}

function MapStep({ dot, title, line, tone }: { dot: string; title: string; line: string; tone: 'here' | 'next' | 'goal' }) {
  return (
    <span className="flex flex-1 flex-col items-center gap-1 min-w-0">
      <span className={dot} aria-hidden />
      <span
        className={clsx(
          'text-center text-[11.5px] leading-[15px]',
          tone === 'here' && 'font-extrabold text-v2-ink',
          tone === 'next' && 'font-bold text-v2-ink-2',
          tone === 'goal' && 'font-bold text-[#8a4b00]',
        )}
      >
        {title}
        <br />
        {line}
      </span>
    </span>
  );
}

function MiniMap({ skill, level, gender, demographics }: { skill: UnlockedSkill; level: number; gender: Gender; demographics: UserDemographics | null }) {
  const t = useT(onboarding);
  const ladder = useQuizV3Ladder(skill.skillId, level, demographics);
  const next = ladder.nodes.find((n) => n.state === 'next')?.level ?? null;
  const name = (l: number) => ladder.names[l] ?? t('quizV3.skills.levelOnly', { level: l });
  const link = <span className="mb-[30px] h-0.5 flex-1 bg-v2-hairline" aria-hidden />;
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={t('quizV3.skills.mapAria', { gender })}>
      <MapStep
        tone="here"
        dot="h-3.5 w-3.5 rounded-full bg-v2-accent shadow-[0_0_0_4px_#cdeefb]"
        title={t('quizV3.skills.here', { gender })}
        line={name(level)}
      />
      {next !== null && (
        <>
          {link}
          <MapStep tone="next" dot="h-3 w-3 rounded-full bg-white shadow-[inset_0_0_0_2px_#00baf7]" title={t('quizV3.skills.next')} line={name(next)} />
        </>
      )}
      {link}
      <MapStep
        tone="goal"
        dot="h-3 w-3 rounded-full bg-[#fff1db] shadow-[inset_0_0_0_2px_#b45f06]"
        title={t('quizV3.skills.goal')}
        line={t('quizV3.skills.goalName', { skill: skill.skillId })}
      />
    </div>
  );
}

export default function SkillUnlockCard({ skill, level, selected, gender, demographics, onToggle, onRefine }: SkillUnlockCardProps) {
  const t = useT(onboarding);
  const name = t('quizV3.skills.name', { skill: skill.skillId });
  return (
    <div
      className={clsx(
        'flex flex-col gap-2.5 rounded-[24px] bg-white p-3.5',
        selected ? 'shadow-[0_0_0_2.5px_#00baf7,0_24px_50px_-36px_rgba(9,30,50,0.45)]' : 'shadow-v2-ring',
      )}
      data-quiz-v3-skill={skill.skillId}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        aria-label={t('quizV3.skills.toggle', { name })}
        className="flex items-center gap-2.5 text-start touch-manipulation"
      >
        <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-[14px] bg-v2-tint">
          <img src={skillIcon(skill.skillId)} alt="" className="w-[30px]" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[16px] font-black text-v2-ink">{name}</span>
          <span className="text-[12.5px] text-v2-ink-2">
            {t('quizV3.skills.estimate', { level, source: skill.source })}
          </span>
        </span>
        <span
          className={clsx(
            'grid h-6 w-6 flex-shrink-0 place-items-center rounded-[7px]',
            selected ? 'bg-v2-accent' : 'shadow-[inset_0_0_0_2px_#dfe7ed]',
          )}
          aria-hidden
        >
          {selected && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#04222b" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          )}
        </span>
      </button>
      {selected && (
        <>
          <MiniMap skill={skill} level={level} gender={gender} demographics={demographics} />
          <button type="button" onClick={onRefine} className="self-start text-[13px] font-extrabold text-v2-deep">
            {t('quizV3.skills.refine')}
          </button>
        </>
      )}
    </div>
  );
}
