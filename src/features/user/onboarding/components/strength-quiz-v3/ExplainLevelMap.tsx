'use client';

/**
 * Explainer 7 (board Explain1): "what is level N in <group>", on the user's weakest group. Owner 28.10
 * (Y7): the progress tab's real map (QuizV3TreeMap). Until it loads (or with no map data) the
 * questionnaire's own short ladder stands in (~5 nodes: locked, next goal, current, two done).
 */
import clsx from 'clsx';
import type { Gender } from '@/lib/i18n/core/i18n-core';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import type { UserDemographics } from '../../types/visual-assessment.types';
import type { LadderNode } from './quiz-v3-outro';
import type { SummaryGroup } from './quiz-v3-summary';
import { useQuizV3Ladder } from './useQuizV3Ladder';
import { useGroupSkillTree } from './useGroupSkillTree';
import QuizV3TreeMap from './QuizV3TreeMap';
import { RevealBlock, RevealText } from './Reveal';
import { revealEnd } from './reveal-timing';

const LEMUR_BUBBLE = '/assets/lemur/lemur_curious_peek.png';
const LEMUR_HERE = '/assets/lemur/lemur-avatar.png';

const CHECK = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#04222b" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
const LOCK = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

function Node({ node, name, gender }: { node: LadderNode; name: string | null; gender: Gender }) {
  const t = useT(onboarding);
  const level = node.level;
  if (node.state === 'current') {
    return (
      <li className="relative -mx-2 my-0.5 flex items-center gap-3 rounded-[18px] bg-v2-tint p-2" data-ladder="current">
        <span className="grid h-10 w-10 flex-shrink-0 place-items-center overflow-hidden rounded-full bg-v2-accent">
          <img src={LEMUR_HERE} alt="" className="h-9 w-9 object-contain" />
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] font-black text-v2-deep">{t('quizV3.explain1.here', { level, gender })}</span>
          {name && (
            <span className="self-start rounded-full bg-white px-2.5 py-0.5 text-[12.5px] font-extrabold shadow-v2-ring">{name}</span>
          )}
        </span>
      </li>
    );
  }
  const circle = {
    locked: 'bg-[#eef2f5]',
    next: 'bg-[#fff1db] shadow-[0_0_0_2px_#b45f06] text-[14px] font-black text-[#8a4b00]',
    done: 'bg-v2-accent',
  }[node.state];
  return (
    <li className={clsx('relative flex items-center gap-3 py-1.5', node.state === 'locked' && 'opacity-55')} data-ladder={node.state}>
      <span className={clsx('grid h-10 w-10 flex-shrink-0 place-items-center rounded-full', circle)}>
        {node.state === 'locked' ? LOCK : node.state === 'done' ? CHECK : level}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={clsx('text-[13px] font-extrabold', node.state === 'next' ? 'text-[#8a4b00]' : node.state === 'done' ? 'text-v2-ink-2' : 'text-v2-muted')}>
          {node.state === 'next' ? t('quizV3.explain1.nextGoal') : t('quizV3.explain1.level', { level })}
        </span>
        {name && <span className="truncate text-[14px] font-bold">{name}</span>}
      </span>
    </li>
  );
}

export interface ExplainLevelMapProps {
  group: SummaryGroup;
  level: number;
  gender: Gender;
  demographics: UserDemographics | null;
}

export default function ExplainLevelMap({ group, level, gender, demographics }: ExplainLevelMapProps) {
  const t = useT(onboarding);
  const tree = useGroupSkillTree(group);
  const ladder = useQuizV3Ladder(tree ? null : group, level, demographics);
  const bubble = t('quizV3.explain1.bubble', { level, group });
  const body = t('quizV3.explain1.body', { group });
  // Y4: the bubble, then the body type in; the map and the footer follow.
  const bodyAt = revealEnd(bubble, 0.1);
  const mapAt = revealEnd(body, bodyAt);
  return (
    <>
      <div className="flex items-end gap-2.5">
        <img src={LEMUR_BUBBLE} alt={t('quizV3.explain1.lemurAlt')} className="h-[72px] w-[72px] flex-shrink-0 object-contain" />
        <RevealText
          text={bubble}
          delay={0.1}
          className="m-0 rounded-[22px] rounded-ee-[6px] bg-white px-3.5 py-3 text-[15px] font-bold leading-[22px] shadow-v2-ring"
        />
      </div>
      <RevealText text={body} delay={bodyAt} className="m-0 text-[15px] leading-[23px] text-v2-ink-2" />
      <RevealBlock delay={mapAt}>
        {tree ? (
          <QuizV3TreeMap tree={tree} level={level} label={body} />
        ) : (
          <ol className="relative m-0 flex list-none flex-col rounded-[28px] bg-white p-4 shadow-v2-card" aria-busy={ladder.loading}>
            <span className="absolute bottom-[34px] top-[34px] w-1 rounded-full bg-v2-pill-border start-[34px]" aria-hidden />
            {ladder.nodes.map((n) => (
              <Node key={n.level} node={n} name={ladder.names[n.level] ?? null} gender={gender} />
            ))}
          </ol>
        )}
      </RevealBlock>
      <RevealBlock delay={mapAt + 0.3}>
        <p className="m-0 text-[13px] leading-5 text-v2-ink-2">{t('quizV3.explain1.footer', { gender })}</p>
      </RevealBlock>
    </>
  );
}
