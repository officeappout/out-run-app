'use client';

/**
 * enable_strength_quiz_v3, after the assessment: 5a skills → 5b short skill questionnaire → 6 summary
 * → 7 to 9 explainers. Mounted by assessment-visual/page.tsx in place of the legacy result screen;
 * `onFinish` hands back the chosen skills and the page saves + moves on to the health declaration.
 */
import { useMemo, type ReactNode } from 'react';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import type { Gender } from '@/lib/i18n/core/i18n-core';
import type { UserDemographics } from '../../types/visual-assessment.types';
import ExplainLayout from './ExplainLayout';
import ExplainLevelMap from './ExplainLevelMap';
import ExplainRing from './ExplainRing';
import ExplainSchedule from './ExplainSchedule';
import ProgramSummaryScreen from './ProgramSummaryScreen';
import SkillUnlockScreen from './SkillUnlockScreen';
import { explainGroup, weekPreview } from './quiz-v3-outro';
import { buildProgramSummary, skillSummaryRows, tracksFromLevels } from './quiz-v3-summary';
import type { ChosenSkill, QuizV3SkillId } from './skill-unlock';
import { useQuizV3Outro } from './useQuizV3Outro';

export interface SkillSliderSlot {
  skillId: QuizV3SkillId;
  initialLevel: number;
  onConfirm: (level: number) => void;
  /** The "not yet" card: start from the prep work (level 1). */
  onNotYet: () => void;
  onBack: () => void;
}

export interface QuizV3OutroProps {
  levels: Partial<Record<string, number>>;
  /** The assessment's own full-body level (result.average). */
  masterLevel: number;
  gender: Gender;
  demographics: UserDemographics | null;
  onFinish: (chosen: ChosenSkill[]) => void;
  /** Back from the first outro screen: the page returns to the last slider. */
  onExitBack: () => void;
  /** 5b: the page mounts its VisualSlider (existing single-skill questionnaire) for the skill. */
  renderSkillSlider: (slot: SkillSliderSlot) => ReactNode;
  /** The save failed: open on the last explainer, show the error and (when given) the skip escape. */
  saveError?: string | null;
  onSkipSave?: () => void;
  initialChosen?: ChosenSkill[];
  /** Back after a hand-off (failed save, no user): open on the last explainer. */
  resume?: boolean;
  /** false = the save leads to the add-track week (declaration already signed), not the declaration. */
  finishesAtHealth?: boolean;
  /** false (no demographics yet): "לדייק" is hidden, the estimate is used as is. */
  skillSliderAvailable?: boolean;
  /** The skill programs' top questionnaire levels (caps the estimate). */
  maxSkillLevels?: Partial<Record<QuizV3SkillId, number>>;
}

export default function QuizV3Outro({
  levels, masterLevel, gender, demographics, onFinish, onExitBack, renderSkillSlider, saveError, onSkipSave,
  initialChosen, resume = false, finishesAtHealth = true, skillSliderAvailable = true, maxSkillLevels,
}: QuizV3OutroProps) {
  const t = useT(onboarding);
  const o = useQuizV3Outro(levels, onFinish, { resume: resume || !!saveError, initialChosen, maxLevels: maxSkillLevels });
  const summary = useMemo(() => buildProgramSummary(tracksFromLevels(levels), masterLevel), [levels, masterLevel]);
  const skillRows = useMemo(() => skillSummaryRows(levels, o.chosen), [levels, o.chosen]);
  const explained = useMemo(() => explainGroup(levels), [levels]);
  const days = useMemo(() => weekPreview(levels), [levels]);
  const back = () => { if (!o.back()) onExitBack(); };
  const s = o.screen;

  if (s.kind === 'skills') {
    return (
      <SkillUnlockScreen
        skills={o.skills}
        levels={o.skillLevels}
        selected={o.selected}
        gender={gender}
        demographics={demographics}
        onToggle={o.toggle}
        onRefine={skillSliderAvailable ? o.refine : undefined}
        onAdd={o.add}
        onLater={o.later}
        onBack={back}
      />
    );
  }
  if (s.kind === 'skillSlider') {
    const est = o.skills.find((x) => x.skillId === s.skillId)?.estimatedLevel ?? 1;
    return (
      <>
        {renderSkillSlider({
          skillId: s.skillId,
          initialLevel: o.skillLevels[s.skillId] ?? est,
          onConfirm: (level) => o.skillLevelChosen(s.skillId, level),
          onNotYet: () => o.skillLevelChosen(s.skillId, 1),
          onBack: back,
        })}
      </>
    );
  }
  if (s.kind === 'done') {
    return <ProgramSummaryScreen summary={summary} skills={skillRows} gender={gender} onNext={o.next} onBack={back} />;
  }
  const last = s.index === 3;
  return (
    <ExplainLayout
      index={s.index}
      onNext={o.next}
      onSkip={last ? undefined : o.skip}
      onBack={back}
      ctaLabel={last ? t(finishesAtHealth ? 'quizV3.explain3.cta' : 'quizV3.explain3.ctaWeek') : t('quizV3.explain.next')}
      ctaVariant={last ? 'cta' : 'dark'}
    >
      {s.index === 1 && explained && (
        <ExplainLevelMap group={explained.group} level={explained.level} gender={gender} demographics={demographics} />
      )}
      {s.index === 2 && <ExplainRing level={explained?.level ?? Math.round(masterLevel)} gender={gender} />}
      {s.index === 3 && <ExplainSchedule days={days} gender={gender} />}
      {last && saveError && (
        <div className="flex flex-col items-center gap-1" role="alert">
          <p className="m-0 text-center text-[14px] font-bold text-v2-down">{saveError}</p>
          {onSkipSave && (
            <button type="button" onClick={onSkipSave} className="h-10 text-[14px] font-extrabold text-v2-ink-2">
              {t('result.skipSave')}
            </button>
          )}
        </div>
      )}
    </ExplainLayout>
  );
}
