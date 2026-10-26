'use client';

/** Screen 5a (board SkillUnlock): the skills the measured push / pull levels opened. */
import { Button } from '@/components/ui/v2';
import type { Gender } from '@/lib/i18n/core/i18n-core';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import type { UserDemographics } from '../../types/visual-assessment.types';
import QuizV3Header from './QuizV3Header';
import SkillUnlockCard from './SkillUnlockCard';
import type { QuizV3SkillId, UnlockedSkill } from './skill-unlock';

const LEMUR = '/assets/lemur/lemur-avatar.png';

export interface SkillUnlockScreenProps {
  skills: UnlockedSkill[];
  levels: Partial<Record<QuizV3SkillId, number>>;
  selected: ReadonlySet<QuizV3SkillId>;
  gender: Gender;
  demographics: UserDemographics | null;
  onToggle: (id: QuizV3SkillId) => void;
  /** Absent: no short questionnaire (demographics missing), the link is hidden. */
  onRefine?: (id: QuizV3SkillId) => void;
  onAdd: () => void;
  onLater: () => void;
  onBack?: () => void;
  /**
   * "לכל מפת הסקילים בהתקדמות". Absent = the link is hidden: mid-signup nothing is saved yet, so
   * leaving for the progress tab would drop the assessment. TODO(strength-quiz-v3): open it in a sheet.
   */
  onOpenSkillsMap?: () => void;
}

export default function SkillUnlockScreen({
  skills, levels, selected, gender, demographics, onToggle, onRefine, onAdd, onLater, onBack, onOpenSkillsMap,
}: SkillUnlockScreenProps) {
  const t = useT(onboarding);
  return (
    <div className="flex h-full min-h-0 flex-col bg-v2-surface" data-quiz-v3="skills">
      <QuizV3Header onBack={onBack} fillPercent={92} />
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 pb-3 pt-2 text-v2-ink">
        <div className="flex items-center gap-2.5">
          <img src={LEMUR} alt={t('quizV3.skills.lemurAlt')} className="h-[72px] w-[72px] flex-shrink-0 object-contain" />
          <h1 className="m-0 text-[24px] font-black leading-[30px] tracking-v2-tight">{t('quizV3.skills.title', { gender })}</h1>
        </div>
        <p className="m-0 text-[14px] leading-[21px] text-v2-ink-2">{t('quizV3.skills.body', { count: skills.length, gender })}</p>
        {skills.map((s) => (
          <SkillUnlockCard
            key={s.skillId}
            skill={s}
            level={levels[s.skillId] ?? s.estimatedLevel}
            selected={selected.has(s.skillId)}
            gender={gender}
            demographics={demographics}
            onToggle={() => onToggle(s.skillId)}
            onRefine={onRefine ? () => onRefine(s.skillId) : undefined}
          />
        ))}
        {onOpenSkillsMap && (
          <button type="button" onClick={onOpenSkillsMap} className="self-start text-[13px] font-extrabold text-v2-deep">
            {t('quizV3.skills.fullMap')}
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1 px-5 pb-6 pt-2">
        <Button variant="cta" size="lg" block onClick={onAdd} disabled={selected.size === 0}>
          {t('quizV3.skills.add')}
        </Button>
        <button type="button" onClick={onLater} className="h-11 text-[15px] font-extrabold text-v2-ink-2">
          {t('quizV3.skills.later')}
        </button>
      </div>
    </div>
  );
}
