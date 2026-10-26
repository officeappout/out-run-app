'use client';

/**
 * The page's mount for the outro (enable_strength_quiz_v3): wires 5b to the existing VisualSlider
 * (the single-skill questionnaire, in its v3 look) so assessment-visual/page.tsx only gains a mount.
 */
import VisualSlider from '../visual-assessment/VisualSlider';
import { getFollowUpMaxLevel, type AssessmentPathConfig } from '../../services/assessment-path-config.service';
import type { UserDemographics } from '../../types/visual-assessment.types';
import type { Gender } from '@/lib/i18n/core/i18n-core';
import QuizV3Outro from './QuizV3Outro';
import type { ChosenSkill } from './skill-unlock';

export interface QuizV3ResultStepProps {
  levels: Partial<Record<string, number>>;
  average: number;
  gender: Gender;
  demographics: UserDemographics | null;
  pathConfig: AssessmentPathConfig | null;
  v2: boolean;
  onFinish: (chosen: ChosenSkill[]) => void;
  onExitBack: () => void;
  /** The save failed: reopen on the last explainer with the error and the legacy "skip" escape. */
  saveError?: string | null;
  onSkipSave?: () => void;
  /** The skills chosen before (kept across a failed save). */
  initialChosen?: ChosenSkill[];
  /** Reopen on the last explainer (the outro already handed off to the save once). */
  resume?: boolean;
  /** The save goes on to the health declaration (else the add-track week, J4). Picks the last CTA label. */
  finishesAtHealth?: boolean;
}

export default function QuizV3ResultStep({ levels, average, gender, demographics, pathConfig, v2, onFinish, onExitBack, saveError, onSkipSave, initialChosen, resume, finishesAtHealth = true }: QuizV3ResultStepProps) {
  return (
    <QuizV3Outro
      levels={levels}
      masterLevel={average}
      gender={gender}
      demographics={demographics}
      onFinish={onFinish}
      onExitBack={onExitBack}
      saveError={saveError}
      onSkipSave={onSkipSave}
      initialChosen={initialChosen}
      resume={resume}
      finishesAtHealth={finishesAtHealth}
      skillSliderAvailable={!!demographics}
      maxSkillLevels={{
        planche: getFollowUpMaxLevel(pathConfig, 'planche'),
        front_lever: getFollowUpMaxLevel(pathConfig, 'front_lever'),
      }}
      renderSkillSlider={(slot) =>
        demographics ? (
          <VisualSlider
            category={slot.skillId}
            initialLevel={slot.initialLevel}
            demographics={demographics}
            onLevelConfirm={slot.onConfirm}
            onEscape={slot.onNotYet}
            onBack={slot.onBack}
            stepIndex={0}
            totalSteps={1}
            minLevel={1}
            maxLevel={getFollowUpMaxLevel(pathConfig, slot.skillId)}
            mode="simple"
            v2={v2}
            quizV3={{ categories: [slot.skillId], categoryIndex: 0, startMiddle: false }}
          />
        ) : null
      }
    />
  );
}
