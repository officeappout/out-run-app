'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  firstOutroScreen,
  nextOutroScreen,
  prevOutroScreen,
  skipExplainers,
  type OutroScreen,
} from './quiz-v3-outro';
import { unlockedSkills, type ChosenSkill, type QuizV3SkillId, type UnlockedSkill } from './skill-unlock';

export interface QuizV3Outro {
  screen: OutroScreen;
  skills: UnlockedSkill[];
  selected: ReadonlySet<QuizV3SkillId>;
  skillLevels: Partial<Record<QuizV3SkillId, number>>;
  toggle: (id: QuizV3SkillId) => void;
  refine: (id: QuizV3SkillId) => void;
  /** The short skill questionnaire settled on a level (the "not yet" card = level 1, the prep work). */
  skillLevelChosen: (id: QuizV3SkillId, level: number) => void;
  add: () => void;
  later: () => void;
  next: () => void;
  skip: () => void;
  /** false = the outro has nothing left to go back to (the page returns to the last slider). */
  back: () => boolean;
}

/**
 * State of the screens after the assessment (enable_strength_quiz_v3). `onFinish` runs once, on the
 * last explainer's CTA, with the skills the user chose to add (empty for "אולי אחר כך" / none unlocked).
 */
export function useQuizV3Outro(
  levels: Partial<Record<string, number>>,
  onFinish: (chosen: ChosenSkill[]) => void,
  opts: {
    /** Reopened after the hand-off (failed save, no user): straight to the last explainer. */
    resume?: boolean;
    /** The choice made before the hand-off, kept so a resumed outro saves it again. */
    initialChosen?: ChosenSkill[];
    /** Caps each estimate at the skill program's top questionnaire level. */
    maxLevels?: Partial<Record<QuizV3SkillId, number>>;
  } = {},
): QuizV3Outro {
  const { resume = false, initialChosen = [], maxLevels } = opts;
  const planche = maxLevels?.planche;
  const frontLever = maxLevels?.front_lever;
  const skills = useMemo(
    () => unlockedSkills({ push: levels.push, pull: levels.pull }, { planche, front_lever: frontLever }),
    [levels.push, levels.pull, planche, frontLever],
  );
  const hasSkills = skills.length > 0;
  const [screen, setScreen] = useState<OutroScreen>(() => (resume ? skipExplainers() : firstOutroScreen(hasSkills)));
  // Board SkillUnlock: the first card comes selected.
  const [selected, setSelected] = useState<Set<QuizV3SkillId>>(() =>
    new Set(resume ? initialChosen.map((c) => c.skillId) : skills.slice(0, 1).map((s) => s.skillId)));
  const [skillLevels, setSkillLevels] = useState<Partial<Record<QuizV3SkillId, number>>>({});
  const [chosen, setChosen] = useState<ChosenSkill[]>(initialChosen);

  const levelOf = useCallback(
    (id: QuizV3SkillId) => skillLevels[id] ?? skills.find((s) => s.skillId === id)?.estimatedLevel ?? 1,
    [skillLevels, skills],
  );

  const commit = useCallback((ids: Iterable<QuizV3SkillId>, override?: Partial<Record<QuizV3SkillId, number>>) => {
    setChosen(Array.from(ids, (id) => ({ skillId: id, level: override?.[id] ?? levelOf(id) })));
    setScreen({ kind: 'done' });
  }, [levelOf]);

  const toggle = useCallback((id: QuizV3SkillId) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);

  const skillLevelChosen = useCallback((id: QuizV3SkillId, level: number) => {
    const lvl = Math.max(1, Math.round(level));
    setSkillLevels((prev) => ({ ...prev, [id]: lvl }));
    const ids = new Set(selected).add(id);
    setSelected(ids);
    commit(ids, { [id]: lvl });
  }, [selected, commit]);

  const next = useCallback(() => {
    const n = nextOutroScreen(screen);
    if (n) setScreen(n); else onFinish(chosen);
  }, [screen, chosen, onFinish]);

  const back = useCallback(() => {
    const p = prevOutroScreen(screen, hasSkills);
    if (!p) return false;
    setScreen(p);
    return true;
  }, [screen, hasSkills]);

  return {
    screen,
    skills,
    selected,
    skillLevels,
    toggle,
    refine: useCallback((id: QuizV3SkillId) => setScreen({ kind: 'skillSlider', skillId: id }), []),
    skillLevelChosen,
    add: useCallback(() => commit(selected), [commit, selected]),
    later: useCallback(() => commit([]), [commit]),
    next,
    skip: useCallback(() => setScreen(skipExplainers()), []),
    back,
  };
}
