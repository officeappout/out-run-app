'use client';

import React, { useState, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  Users,
  GraduationCap,
  BookOpen,
  Briefcase,
  Shield,
  HeartPulse,
  Dumbbell,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';
import AccessCodeGate from '@/components/ui/AccessCodeGate';
import UnitJoinSuccessBanner from '@/components/ui/UnitJoinSuccessBanner';
import type { AccessCodeResult } from '../../services/access-code.service';
import { setOnboardingPref } from '@/lib/onboardingPrefs';
import PersonaQuestionsDrawer from '../PersonaQuestionsDrawer';
import { useOnboardingV2 } from '../../hooks/useOnboardingV2';
import { PERSONA_QUESTIONS } from '@/types/persona-question.types';
import type { PersonaId } from '@/types/persona.types';
import {
  ACCESS_CODE_MILITARY_ENABLED,
  ACCESS_CODE_SCHOOL_ENABLED,
  ACCESS_CODE_UNIVERSITY_ENABLED,
} from '@/config/feature-flags';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useWizardIdentity } from '../../hooks/useWizardIdentity';
import { resolveAccessCodePersonaIds } from '../../utils/persona-access-code';
import {
  ALL_GOAL_OPTIONS,
  resolvePersonaGoalMode,
  type GoalOption,
} from '../../utils/persona-goals';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';

// Personas that open the access-code popup: resolveAccessCodePersonaIds
// (utils/persona-access-code.ts). office_worker is the one vertical whose
// chain produces a league tab today (the CF writes a 'company' affiliation);
// since 19.10.2026 it is behind the runtime flag enable_org_access_code_prompt
// (default off) instead of opening for every user. student/military/pupil keep
// their compile-time ACCESS_CODE_*_ENABLED flags (all false) — they re-join
// once the CF + useArenaAccess are generalized (§5 follow-up b);
// PERSONA_TENANT_TYPE below already holds their mapping for then.

// Persona → org vertical for the code gate. Replaces a hardcoded military/school
// ternary — add a row per persona. Drives the contact-label hint only; the real
// tenantType that decides the affiliation comes from the redeemed code (the CF).
const PERSONA_TENANT_TYPE: Record<string, AccessCodeResult['tenantType']> = {
  student: 'educational',
  pupil: 'educational',
  military: 'military',
  office_worker: 'company',
};

interface PersonaStepProps {
  onNext: () => void;
}

// Lifestyle persona options with gender-specific labels
export interface LifestyleOption {
  id: string;
  labelHeMale: string;
  labelHeFemale: string;
  labelEn: string;
  emoji: string;
  emojiMale?: string;
  emojiFemale?: string;
  tags: string[];
  color: string;
}

/**
 * The single source of the persona emoji + brand color shown on these
 * onboarding cards. Exported so any other surface showing the same
 * personas (e.g. SettingsModal's "הפרסונות שלי" add-picker) uses the exact
 * same assets via this array, not a re-typed copy that can drift.
 */
export const LIFESTYLE_OPTIONS: LifestyleOption[] = [
  {
    id: 'parent',
    labelHeMale: 'אבא', // i18n-allow-hebrew: exported constant (MyPersonasSection imports LIFESTYLE_OPTIONS); this screen renders steps.persona.label
    labelHeFemale: 'אמא', // i18n-allow-hebrew: exported constant (MyPersonasSection imports LIFESTYLE_OPTIONS); this screen renders steps.persona.label
    labelEn: 'Parent',
    emoji: '👨‍👧',
    emojiMale: '👨‍👧',
    emojiFemale: '👩‍👧',
    tags: ['parent', 'busy'],
    color: '#EC4899',
  },
  {
    id: 'student',
    labelHeMale: 'סטודנט', // i18n-allow-hebrew: exported constant (MyPersonasSection imports LIFESTYLE_OPTIONS); this screen renders steps.persona.label
    labelHeFemale: 'סטודנטית', // i18n-allow-hebrew: exported constant (MyPersonasSection imports LIFESTYLE_OPTIONS); this screen renders steps.persona.label
    labelEn: 'Student',
    emoji: '🎓',
    tags: ['student', 'young'],
    color: '#8B5CF6',
  },
  {
    id: 'pupil',
    labelHeMale: 'תלמיד', // i18n-allow-hebrew: exported constant (MyPersonasSection imports LIFESTYLE_OPTIONS); this screen renders steps.persona.label
    labelHeFemale: 'תלמידה', // i18n-allow-hebrew: exported constant (MyPersonasSection imports LIFESTYLE_OPTIONS); this screen renders steps.persona.label
    labelEn: 'Pupil',
    emoji: '📚',
    tags: ['pupil', 'young', 'school'],
    color: '#F59E0B',
  },
  {
    id: 'office_worker',
    labelHeMale: 'עובד משרד', // i18n-allow-hebrew: exported constant (MyPersonasSection imports LIFESTYLE_OPTIONS); this screen renders steps.persona.label
    labelHeFemale: 'עובדת משרד', // i18n-allow-hebrew: exported constant (MyPersonasSection imports LIFESTYLE_OPTIONS); this screen renders steps.persona.label
    labelEn: 'Office Worker',
    emoji: '💼',
    tags: ['office_worker', 'wfh'],
    color: '#3B82F6',
  },
  {
    // 01.09.2026 redefinition: merges the old separate 'reservist'/'soldier'
    // cards into one — status (סדיר/קבע/מילואים) is a follow-up question
    // (Phase 4 drawer, docs/research/military-persona-unified-architecture.md),
    // not a separate top-level persona.
    id: 'military',
    labelHeMale: 'צה"ל', // i18n-allow-hebrew: exported constant (MyPersonasSection imports LIFESTYLE_OPTIONS); this screen renders steps.persona.label
    labelHeFemale: 'צה"ל', // i18n-allow-hebrew: exported constant (MyPersonasSection imports LIFESTYLE_OPTIONS); this screen renders steps.persona.label
    labelEn: 'IDF / Military',
    emoji: '🎖️',
    tags: ['military'],
    color: '#16A34A',
  },
  {
    id: 'vatikim',
    labelHeMale: 'גיל הזהב', // i18n-allow-hebrew: exported constant (MyPersonasSection imports LIFESTYLE_OPTIONS); this screen renders steps.persona.label
    labelHeFemale: 'גיל הזהב', // i18n-allow-hebrew: exported constant (MyPersonasSection imports LIFESTYLE_OPTIONS); this screen renders steps.persona.label
    labelEn: 'Golden Age',
    emoji: '🧓',
    tags: ['vatikim', 'senior', 'health'],
    color: '#F97316',
  },
  {
    id: 'pro_athlete',
    labelHeMale: 'ספורטאי קצה', // i18n-allow-hebrew: exported constant (MyPersonasSection imports LIFESTYLE_OPTIONS); this screen renders steps.persona.label
    labelHeFemale: 'ספורטאית קצה', // i18n-allow-hebrew: exported constant (MyPersonasSection imports LIFESTYLE_OPTIONS); this screen renders steps.persona.label
    labelEn: 'Pro Athlete',
    emoji: '🏋️',
    tags: ['pro_athlete', 'advanced', 'performance'],
    color: '#DC2626',
  },
];

/** Same emoji-selection rule as this screen's own gender toggle — exported
 *  so other surfaces picking an emoji from LIFESTYLE_OPTIONS resolve it
 *  identically instead of re-implementing the male/female fallback. */
export function resolvePersonaEmoji(
  option: LifestyleOption,
  gender?: 'male' | 'female' | 'other',
): string {
  if (gender === 'female' && option.emojiFemale) return option.emojiFemale;
  if (gender === 'male' && option.emojiMale) return option.emojiMale;
  return option.emoji;
}

// Goal chips + when to ask them: utils/persona-goals.ts.
const MAX_GOALS = 2;

/** enable_home_v2 — lucide glyph per persona (v2 shows no emoji). */
const PERSONA_ICONS_V2: Record<string, LucideIcon> = {
  parent: Users,
  student: GraduationCap,
  pupil: BookOpen,
  office_worker: Briefcase,
  military: Shield,
  vatikim: HeartPulse,
  pro_athlete: Dumbbell,
};

export default function PersonaStep({ onNext }: PersonaStepProps) {
  const { updateData, data } = useOnboardingStore();
  const v2 = useOnboardingV2();
  const t = useT(onboarding);
  
  // Gender + first name: the profile first (returning users on /home have no
  // sessionStorage), the signup's sessionStorage answers as the fallback.
  const { gender: userGender, copyGender, firstName: userName } = useWizardIdentity();

  // Org access-code popup — runtime flag, the panel toggle is the one switch
  // (no super-admin override: useFeatureFlags() without isSuperAdmin).
  const { flags } = useFeatureFlags();
  const accessCodePersonaIds = useMemo(
    () =>
      resolveAccessCodePersonaIds({
        officeWorker: flags.enableOrgAccessCodePrompt,
        military: ACCESS_CODE_MILITARY_ENABLED,
        school: ACCESS_CODE_SCHOOL_ENABLED,
        university: ACCESS_CODE_UNIVERSITY_ENABLED,
      }),
    [flags.enableOrgAccessCodePrompt],
  );

  // Goals: skipped when signup already captured them (strength program-path /
  // running q_run_goal); run-only users get running goals if asked.
  const profile = useUserStore((st) => st.profile);
  const goalMode = useMemo(() => resolvePersonaGoalMode(profile), [profile]);
  const askGoals = goalMode.askGoals;
  // Shared ids (routine / fitness / community) read from the shown list first.
  const findGoal = (id: string): GoalOption | undefined =>
    goalMode.options.find((g) => g.id === id) ?? ALL_GOAL_OPTIONS.find((g) => g.id === id);

  // Ref for programmatic smooth-scroll to the goals section
  const goalsSectionRef = useRef<HTMLDivElement>(null);

  // Access Code Gate modal state
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [pendingPersona, setPendingPersona] = useState<LifestyleOption | null>(null);

  // Persona follow-up-questions drawer (Phase 3b) — opens immediately when a
  // persona with configured questions (PERSONA_QUESTIONS) is newly selected.
  // Lives here, not in either host wizard (OnboardingWizard/LifestyleWizard),
  // because PersonaStep is the one component both hosts already render
  // identically — see the entry-point map in docs/research/
  // military-persona-unified-architecture.md §10. Zero changes needed to
  // either host.
  const [drawerPersonaId, setDrawerPersonaId] = useState<PersonaId | null>(null);

  // Local state - multi-select for personas, multi-select (max 2) for goals
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>(() => {
    const storedIds = (data as any).selectedPersonaIds;
    if (Array.isArray(storedIds) && storedIds.length > 0) {
      return storedIds;
    }
    const singleId = data.selectedPersonaId;
    return singleId ? [singleId] : [];
  });
  
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>(() => {
    if (!askGoals) return [];
    // Support migration from single goal to multi
    const storedGoals = (data as any).selectedGoalIds;
    if (Array.isArray(storedGoals) && storedGoals.length > 0) {
      return storedGoals;
    }
    const singleGoal = (data as any).selectedGoal;
    return singleGoal ? [singleGoal] : [];
  });
  
  // Get language
  const savedLanguage: OnboardingLanguage = (typeof window !== 'undefined'
    ? (sessionStorage.getItem('onboarding_language') || 'he')
    : 'he') as OnboardingLanguage;
  const isHebrew = savedLanguage === 'he';
  const direction = isHebrew ? 'rtl' : 'ltr';

  // Can continue: at least one persona, and at least one goal when asked
  const canContinue = selectedPersonaIds.length > 0 && (!askGoals || selectedGoalIds.length > 0);

  // Get label based on gender
  const getPersonaLabel = (option: LifestyleOption): string => {
    if (!isHebrew) return option.labelEn;
    return t('steps.persona.label', { persona: option.id, gender: copyGender });
  };
  
  // Get emoji based on gender
  const getPersonaEmoji = (option: LifestyleOption): string => resolvePersonaEmoji(option, userGender);

  // Collect all lifestyle tags
  const collectAllTags = (personaIds: string[], goalIds: string[]): string[] => {
    const tags: string[] = [];
    personaIds.forEach(id => {
      const option = LIFESTYLE_OPTIONS.find(o => o.id === id);
      if (option) tags.push(...option.tags);
    });
    goalIds.forEach(id => {
      const goal = findGoal(id);
      if (goal) tags.push(goal.tag);
    });
    return Array.from(new Set(tags));
  };

  const applyPersonaToggle = useCallback((option: LifestyleOption) => {
    const isAdding = !selectedPersonaIds.includes(option.id);
    let newSelectedIds: string[];
    if (selectedPersonaIds.includes(option.id)) {
      newSelectedIds = selectedPersonaIds.filter(id => id !== option.id);
    } else {
      newSelectedIds = [...selectedPersonaIds, option.id];
    }
    setSelectedPersonaIds(newSelectedIds);
    // Newly-added persona with configured follow-up questions -> open the
    // drawer immediately (per the approved UX scenario). Deselecting never
    // opens it. A persona with no PERSONA_QUESTIONS entry (the common case)
    // is a no-op here — nothing to open.
    if (isAdding && PERSONA_QUESTIONS[option.id as PersonaId]) {
      setDrawerPersonaId(option.id as PersonaId);
    }
    const allTags = collectAllTags(newSelectedIds, selectedGoalIds);
    updateData({
      selectedPersonaId: newSelectedIds[0] || null,
      selectedPersonaIds: newSelectedIds,
      lifestyleTags: allTags,
    } as any);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('onboarding_selected_persona_ids', JSON.stringify(newSelectedIds));
      sessionStorage.setItem('onboarding_selected_persona_tags', JSON.stringify(allTags));
    }
    // On the first persona pick, smoothly scroll the goals section into view
    // so the user immediately sees the next action without manual scrolling.
    if (isAdding && newSelectedIds.length === 1) {
      setTimeout(() => {
        goalsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 350);
    }
  }, [selectedPersonaIds, selectedGoalIds, updateData]);

  const handlePersonaToggle = (option: LifestyleOption) => {
    const isDeselecting = selectedPersonaIds.includes(option.id);
    if (!isDeselecting && accessCodePersonaIds.has(option.id)) {
      setPendingPersona(option);
      setShowCodeModal(true);
      return;
    }
    applyPersonaToggle(option);
  };

  // 07.09.2026 — used to close the modal immediately on success with zero
  // confirmation of WHICH unit the code resolved to. Now stays open one
  // extra beat to show it (name mandatory, icon bonus) — codeSuccessResult
  // gates that view; the actual close is deferred to handleCodeSuccessContinue.
  const [codeSuccessResult, setCodeSuccessResult] = useState<AccessCodeResult | null>(null);

  const handleCodeSuccess = useCallback((result: AccessCodeResult) => {
    if (pendingPersona) applyPersonaToggle(pendingPersona);
    updateData({
      tenantId: result.tenantId,
      unitId: result.unitId,
      unitPath: result.unitPath,
      tenantType: result.tenantType,
    } as any);
    // onboarding_path uses onboardingPrefs so MAP_ONLY / FULL_PROGRAM /
    // MILITARY_JOIN selection survives a hard close.
    setOnboardingPref('onboarding_path', result.onboardingPath);
    setCodeSuccessResult(result);
  }, [pendingPersona, applyPersonaToggle, updateData]);

  const handleCodeSuccessContinue = useCallback(() => {
    setShowCodeModal(false);
    setPendingPersona(null);
    setCodeSuccessResult(null);
  }, []);

  const handleCodeSkip = useCallback(() => {
    if (pendingPersona) applyPersonaToggle(pendingPersona);
    setShowCodeModal(false);
    setPendingPersona(null);
  }, [pendingPersona, applyPersonaToggle]);

  // Handle goal toggle (multi-select, max 2)
  const handleGoalToggle = (goal: GoalOption) => {
    let newSelectedIds: string[];
    
    if (selectedGoalIds.includes(goal.id)) {
      // Deselect
      newSelectedIds = selectedGoalIds.filter(id => id !== goal.id);
    } else {
      // Select - check max limit
      if (selectedGoalIds.length >= MAX_GOALS) {
        // Replace oldest selection
        newSelectedIds = [...selectedGoalIds.slice(1), goal.id];
      } else {
        newSelectedIds = [...selectedGoalIds, goal.id];
      }
    }
    
    setSelectedGoalIds(newSelectedIds);
    const allTags = collectAllTags(selectedPersonaIds, newSelectedIds);
    
    // Get short titles for store and long descriptions for display
    const goalShortTitles = newSelectedIds.map(id => {
      const g = findGoal(id);
      return g ? (isHebrew ? g.shortTitleHe : g.shortTitleEn) : '';
    }).filter(Boolean);
    
    const goalLongDescs = newSelectedIds.map(id => {
      const g = findGoal(id);
      return g ? (isHebrew ? g.longDescHe : g.longDescEn) : '';
    }).filter(Boolean);
    
    updateData({
      selectedGoal: newSelectedIds[0] || null,
      selectedGoalIds: newSelectedIds,
      selectedGoalLabel: goalShortTitles.join(isHebrew ? ' ו-' : ' & '),
      selectedGoalDescription: goalLongDescs.join('; '),
      lifestyleTags: allTags,
    } as any);
    
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('onboarding_selected_goals', JSON.stringify(newSelectedIds));
    }
  };

  const personaHint = (() => {
    if (!isHebrew) return askGoals ? 'Select at least one persona and one goal' : 'Select at least one persona';
    if (!askGoals) return t('steps.persona.hint.persona', { gender: copyGender });
    return t('steps.persona.hint.personaGoal', { gender: copyGender });
  })();

  // Handle continue
  const handleContinue = () => {
    if (canContinue) onNext();
  };

  // Get selected lifestyles label for Mad-libs sentence
  const getSelectedLifestyleLabel = () => {
    if (selectedPersonaIds.length === 0) return '___';
    
    if (selectedPersonaIds.length === 1) {
      const option = LIFESTYLE_OPTIONS.find(o => o.id === selectedPersonaIds[0]);
      return option ? getPersonaLabel(option) : '___';
    }
    
    if (selectedPersonaIds.length === 2) {
      const option1 = LIFESTYLE_OPTIONS.find(o => o.id === selectedPersonaIds[0]);
      const option2 = LIFESTYLE_OPTIONS.find(o => o.id === selectedPersonaIds[1]);
      if (isHebrew) {
        return t('steps.persona.madlib.two', {
          a: option1 ? getPersonaLabel(option1) : '',
          b: option2 ? getPersonaLabel(option2) : '',
        });
      }
      return `${option1?.labelEn} & ${option2?.labelEn}`;
    }
    
    // 3+ selections
    if (selectedPersonaIds.length === 3) {
      const options = selectedPersonaIds.map(id => LIFESTYLE_OPTIONS.find(o => o.id === id));
      if (isHebrew) {
        return t('steps.persona.madlib.three', {
          a: options[0] ? getPersonaLabel(options[0]) : '',
          b: options[1] ? getPersonaLabel(options[1]) : '',
          c: options[2] ? getPersonaLabel(options[2]) : '',
        });
      }
      return `${options[0]?.labelEn}, ${options[1]?.labelEn} & ${options[2]?.labelEn}`;
    }
    
    return isHebrew
      ? t('steps.persona.madlib.many', { gender: copyGender })
      : 'multi-faceted';
  };

  // Get selected goals LONG DESCRIPTION for Mad-libs sentence (THE FLIP!)
  const getSelectedGoalsLabel = () => {
    if (selectedGoalIds.length === 0) return '___';
    
    if (selectedGoalIds.length === 1) {
      const goal = findGoal(selectedGoalIds[0]);
      return goal ? (isHebrew ? goal.longDescHe : goal.longDescEn) : '___';
    }
    
    // 2 goals - join with "ו-"
    const goal1 = findGoal(selectedGoalIds[0]);
    const goal2 = findGoal(selectedGoalIds[1]);
    if (isHebrew) {
      return t('steps.persona.madlib.goalsTwo', { a: String(goal1?.longDescHe), b: String(goal2?.longDescHe) });
    }
    return `${goal1?.longDescEn} & ${goal2?.longDescEn}`;
  };

  // ── v2 (enable_home_v2) — same state, handlers and store writes; v2 look ──
  if (v2) {
    const madlibPill = (filled: boolean) =>
      `inline-block rounded-lg px-2 py-0.5 text-[14px] font-extrabold transition-colors duration-150 ease-v2 ${
        filled
          ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40'
          : 'bg-v2-surface text-v2-muted ring-1 ring-inset ring-v2-hairline'
      }`;
    const PendingIcon = pendingPersona ? (PERSONA_ICONS_V2[pendingPersona.id] ?? UserRound) : UserRound;

    return (
      <div className="flex h-full flex-col font-simpler text-v2-ink" dir={direction}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="min-w-0 truncate text-[22px] font-black leading-[1.2] !tracking-[-0.02em] text-v2-ink">
              {isHebrew ? t('steps.persona.title') : "Let's get to know you"}
            </h2>
            {selectedPersonaIds.length > 0 && (
              <span className="flex-shrink-0 whitespace-nowrap rounded-full bg-v2-tint px-2.5 py-0.5 text-[12px] font-extrabold tabular-nums text-v2-deep">
                {selectedPersonaIds.length}
              </span>
            )}
          </div>
          {isHebrew && (
            <p className="mt-1 text-[14px] font-medium leading-snug text-v2-ink-2">
              {userName ? t('steps.persona.greeting', { name: userName }) : ''}
              {t('steps.persona.intro', { gender: copyGender })}
            </p>
          )}
        </motion.div>

        {/* Mad-libs sentence — sticky summary card */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="sticky top-0 z-10 mb-4 rounded-[20px] bg-white/90 p-4 shadow-v2-card backdrop-blur-md"
        >
          <div className="text-center text-[15px] font-bold leading-relaxed text-v2-ink">
            {isHebrew ? (
              t.rich(askGoals ? 'steps.persona.madlib.sentenceGoals' : 'steps.persona.madlib.sentence', {
                persona: getSelectedLifestyleLabel(),
                goals: askGoals ? getSelectedGoalsLabel() : '',
                who: (chunks: React.ReactNode) => <span className={madlibPill(selectedPersonaIds.length > 0)}>{chunks}</span>,
                what: (chunks: React.ReactNode) => <span className={madlibPill(selectedGoalIds.length > 0)}>{chunks}</span>,
              })
            ) : (
              <>
                I&apos;m a{' '}
                <span className={madlibPill(selectedPersonaIds.length > 0)}>{getSelectedLifestyleLabel()}</span>
                {askGoals && (
                  <>
                    {' '}who wants to{' '}
                    <span className={madlibPill(selectedGoalIds.length > 0)}>{getSelectedGoalsLabel()}</span>
                  </>
                )}
              </>
            )}
          </div>
        </motion.div>

        {/* Scrollable content */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2">
          {/* Persona cards — 2-column grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-6"
          >
            <div className="grid grid-cols-2 gap-2.5 p-0.5">
              {LIFESTYLE_OPTIONS.map((option, index) => {
                const isSelected = selectedPersonaIds.includes(option.id);
                const Icon = PERSONA_ICONS_V2[option.id] ?? UserRound;
                return (
                  <motion.button
                    key={option.id}
                    type="button"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.05 + index * 0.02 }}
                    onClick={() => handlePersonaToggle(option)}
                    aria-pressed={isSelected}
                    className={`relative flex h-[60px] min-w-0 items-center gap-2.5 rounded-[18px] bg-white px-3 transition-[transform,box-shadow] duration-150 ease-v2 active:scale-[0.97] ${
                      isSelected ? 'shadow-v2-card ring-2 ring-v2-accent' : 'shadow-v2-ring'
                    }`}
                  >
                    <span
                      className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl ${
                        isSelected ? 'bg-v2-tint text-v2-deep' : 'bg-v2-surface text-v2-ink-2'
                      }`}
                    >
                      <Icon size={18} strokeWidth={2.2} />
                    </span>
                    <span
                      className={`min-w-0 flex-1 truncate whitespace-nowrap text-start text-[14.5px] ${
                        isSelected ? 'font-black text-v2-ink' : 'font-extrabold text-v2-ink-2'
                      }`}
                    >
                      {getPersonaLabel(option)}
                    </span>
                    <AnimatePresence>
                      {isSelected && (
                        <motion.span
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-v2-accent"
                        >
                          <Check size={12} className="text-white" strokeWidth={3} />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>

          {/* Goal chips — multi-select, max 2 (hidden when signup captured the goal) */}
          {askGoals && (
          <motion.div
            ref={goalsSectionRef}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-4"
          >
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h3 className="min-w-0 truncate whitespace-nowrap text-[15px] font-black text-v2-ink">
                {isHebrew ? t('steps.persona.goalsTitle') : 'Your goals? (up to 2)'}
              </h3>
              {selectedGoalIds.length > 0 && (
                <span className="flex-shrink-0 whitespace-nowrap rounded-full bg-v2-tint px-2.5 py-0.5 text-[12px] font-extrabold tabular-nums text-v2-deep">
                  {selectedGoalIds.length}/{MAX_GOALS}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 p-0.5">
              {goalMode.options.map((goal) => {
                const isSelected = selectedGoalIds.includes(goal.id);
                return (
                  <button
                    key={goal.id}
                    type="button"
                    onClick={() => handleGoalToggle(goal)}
                    aria-pressed={isSelected}
                    className={`flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[14px] font-extrabold transition-[transform,background-color,color,box-shadow] duration-150 ease-v2 active:scale-[0.97] ${
                      isSelected
                        ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40'
                        : 'bg-white text-v2-ink-2 shadow-v2-ring'
                    }`}
                  >
                    {isSelected && <Check size={14} strokeWidth={3} className="flex-shrink-0 text-v2-deep" />}
                    <span>{isHebrew ? goal.shortTitleHe : goal.shortTitleEn}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
          )}
        </div>

        {/* Bottom CTA — <main> already pads the bottom inset */}
        <div
          className="flex-shrink-0 pb-3 pt-2"
          style={{ background: 'linear-gradient(to top, #f6fbfd 70%, rgba(246,251,253,0))' }}
        >
          <AnimatePresence>
            {!canContinue && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-2 text-center text-[12.5px] font-bold text-v2-muted"
              >
                {personaHint}
              </motion.p>
            )}
          </AnimatePresence>
          <button
            type="button"
            onClick={handleContinue}
            disabled={!canContinue}
            className={`flex h-[52px] w-full items-center justify-center whitespace-nowrap rounded-full text-[16px] font-extrabold transition-transform duration-150 ease-v2 ${
              canContinue
                ? 'bg-v2-cta text-v2-on-cta shadow-v2-cta active:scale-[0.97]'
                : 'cursor-not-allowed bg-v2-hairline text-v2-muted'
            }`}
          >
            {isHebrew ? t('steps.persona.continue', { gender: copyGender }) : 'Continue'}
          </button>
        </div>

        {/* Access Code Gate modal — same flow; v2 shell (gate itself unchanged) */}
        <AnimatePresence>
          {showCodeModal && pendingPersona && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[90] flex items-center justify-center p-5"
              style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(9,30,50,0.45)' }}
              onClick={() => (codeSuccessResult ? handleCodeSuccessContinue() : handleCodeSkip())}
            >
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                transition={{ type: 'spring', damping: 22, stiffness: 260 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm"
              >
                {codeSuccessResult ? (
                  <div className="rounded-v2-card bg-white p-6 text-center shadow-v2-float" dir="rtl">
                    <h3 className="mb-4 text-[22px] font-black !tracking-[-0.02em] text-v2-ink">{t('steps.persona.code.verified')}</h3>
                    <div className="mb-5 flex justify-center">
                      <UnitJoinSuccessBanner result={codeSuccessResult} />
                    </div>
                    <button
                      type="button"
                      onClick={handleCodeSuccessContinue}
                      className="flex h-12 w-full items-center justify-center whitespace-nowrap rounded-full bg-v2-cta text-[16px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97]"
                    >
                      {t('steps.persona.code.continue', { gender: copyGender })}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="mb-4 flex flex-col items-center text-center">
                      <span className="grid h-14 w-14 place-items-center rounded-full bg-white text-v2-deep shadow-v2-ring">
                        <PendingIcon size={26} strokeWidth={2.2} />
                      </span>
                      <h3 className="mt-3 text-[20px] font-black !tracking-[-0.02em] text-white" dir="rtl">
                        {isHebrew ? t('steps.persona.code.title') : 'Got an access code?'}
                      </h3>
                    </div>
                    <AccessCodeGate
                      orgName={isHebrew ? getPersonaLabel(pendingPersona) : pendingPersona.labelEn}
                      personaLabel={getPersonaLabel(pendingPersona)}
                      tenantType={PERSONA_TENANT_TYPE[pendingPersona.id] ?? 'educational'}
                      onSuccess={handleCodeSuccess}
                      onSkip={handleCodeSkip}
                    optional
                    />
                  </>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {drawerPersonaId && (
          <PersonaQuestionsDrawer
            personaId={drawerPersonaId}
            isOpen={drawerPersonaId !== null}
            onComplete={() => setDrawerPersonaId(null)}
            v2
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" dir={direction}>
      {/* Primary Header - Absolute top */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-2"
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xl font-bold text-black dark:text-white">
            {/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}{isHebrew ? 'שנכיר? ✨' : "Let's get to know you ✨"}
          </h3>
          {selectedPersonaIds.length > 0 && (
            <span className="text-xs font-bold text-[#5BC2F2] bg-[#5BC2F2]/10 px-2 py-0.5 rounded-full">
              {selectedPersonaIds.length}
            </span>
          )}
        </div>
        {isHebrew && (
          <p
            className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed mt-2"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}{userName ? `היי ${userName}, ` : ''}
            {userGender === 'female'
              ? 'כדי שנבנה לך את לו״ז האימונים המדויק ביותר עבור הסגנון והמטרות שלך – בחרי את התפקיד שמקשר ומאפיין אותך הכי טוב. 🦾' // i18n-allow-hebrew: legacy v1 (enable_home_v2 on)
              : 'כדי שנבנה לך את לו״ז האימונים המדויק ביותר עבור הסגנון והמטרות שלך – בחר את התפקיד שמקשר ומאפיין אותך הכי טוב. 🦾' /* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}
          </p>
        )}
      </motion.div>

      {/* Mad-libs Sentence Card - Sticky at top with blur */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/90 backdrop-blur-md rounded-2xl p-4 mb-4 shadow-[0_4px_20px_rgba(91,194,242,0.1)] border border-slate-100/80 sticky top-0 z-10"
      >
        <div className={`text-base font-bold text-slate-800 leading-relaxed text-center ${isHebrew ? 'font-simpler' : ''}`}>
          {isHebrew ? (
            <>
              {/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}אני{' '}
              <span className={`inline-block px-2 py-0.5 rounded-md text-sm transition-all ${
                selectedPersonaIds.length > 0
                  ? 'bg-[#5BC2F2]/10 text-[#5BC2F2] border border-[#5BC2F2]/50' 
                  : 'bg-slate-100 text-slate-400 border border-dashed border-slate-200'
              }`}>
                {getSelectedLifestyleLabel()}
              </span>
{askGoals && (<>
              {/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}{' '}שרוצה{' '}
              <span className={`inline-block px-2 py-0.5 rounded-md text-sm transition-all ${
                selectedGoalIds.length > 0
                  ? 'bg-[#5BC2F2]/10 text-[#5BC2F2] border border-[#5BC2F2]/50' 
                  : 'bg-slate-100 text-slate-400 border border-dashed border-slate-200'
              }`}>
                {getSelectedGoalsLabel()}
              </span>
              </>)}
            </>
          ) : (
            <>
              I&apos;m a{' '}
              <span className={`inline-block px-2 py-0.5 rounded-md text-sm transition-all ${
                selectedPersonaIds.length > 0
                  ? 'bg-[#5BC2F2]/10 text-[#5BC2F2] border border-[#5BC2F2]/50' 
                  : 'bg-slate-100 text-slate-400 border border-dashed border-slate-200'
              }`}>
                {getSelectedLifestyleLabel()}
              </span>
{askGoals && (<>
              {' '}who wants to{' '}
              <span className={`inline-block px-2 py-0.5 rounded-md text-sm transition-all ${
                selectedGoalIds.length > 0
                  ? 'bg-[#5BC2F2]/10 text-[#5BC2F2] border border-[#5BC2F2]/50' 
                  : 'bg-slate-100 text-slate-400 border border-dashed border-slate-200'
              }`}>
                {getSelectedGoalsLabel()}
              </span>
              </>)}
            </>
          )}
        </div>
      </motion.div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 pb-2">
        {/* Persona Selection - Compact 2-column grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-5"
        >

          {/* Compact 2-column grid */}
          <div className="grid grid-cols-2 gap-2">
            {LIFESTYLE_OPTIONS.map((option, index) => {
              const isSelected = selectedPersonaIds.includes(option.id);
              return (
                <motion.button
                  key={option.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.05 + index * 0.02 }}
                  onClick={() => handlePersonaToggle(option)}
                  className={`relative flex items-center gap-2.5 p-3 rounded-xl transition-all duration-200 ${
                    isSelected
                      ? 'bg-white shadow-[0_4px_16px_rgba(91,194,242,0.12)]'
                      : 'bg-slate-50/80 hover:bg-white hover:shadow-sm'
                  }`}
                  style={{
                    borderWidth: '1.5px',
                    borderStyle: 'solid',
                    borderColor: isSelected ? option.color : 'transparent',
                  }}
                >
                  {/* Emoji */}
                  <span className="text-xl flex-shrink-0">{getPersonaEmoji(option)}</span>
                  
                  {/* Label */}
                  <span className={`text-sm font-bold flex-1 text-right ${
                    isSelected ? 'text-slate-900' : 'text-slate-600'
                  }`}>
                    {getPersonaLabel(option)}
                  </span>
                  
                  {/* Selection Indicator */}
                  <AnimatePresence>
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: option.color }}
                      >
                        <Check size={12} className="text-white" strokeWidth={3} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        {/* Goal Selection - Multi-Select (Max 2) - hidden when signup captured the goal */}
        {askGoals && (
        <motion.div
          ref={goalsSectionRef}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-4"
        >
          <div className="flex items-center justify-between mb-2 px-1">
            <h3 className="text-sm font-bold text-slate-600">
              {/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}{isHebrew ? 'מה המטרות שלך? (עד 2)' : 'Your goals? (up to 2)'}
            </h3>
            {selectedGoalIds.length > 0 && (
              <span className="text-xs font-bold text-[#5BC2F2] bg-[#5BC2F2]/10 px-2 py-0.5 rounded-full">
                {selectedGoalIds.length}/{MAX_GOALS}
              </span>
            )}
          </div>
          
          {/* Goal Chips - Show SHORT Title */}
          <div className="flex flex-wrap gap-2">
            {goalMode.options.map((goal) => {
              const isSelected = selectedGoalIds.includes(goal.id);
              return (
                <motion.button
                  key={goal.id}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleGoalToggle(goal)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    isSelected
                      ? 'bg-[#5BC2F2] text-on-brand shadow-[0_4px_16px_rgba(91,194,242,0.25)]'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {isSelected && (
                    <motion.span
                      initial={{ scale: 0, width: 0 }}
                      animate={{ scale: 1, width: 'auto' }}
                      className="flex items-center justify-center w-4 h-4 bg-white/25 rounded-full"
                    >
                      <Check size={10} className="text-on-brand" strokeWidth={3} />
                    </motion.span>
                  )}
                  <span>{isHebrew ? goal.shortTitleHe : goal.shortTitleEn}</span>
                </motion.button>
              );
            })}
          </div>
        </motion.div>
        )}
      </div>

      {/* Fixed Bottom - Continue Button */}
      <div className="flex-shrink-0 pt-2 pb-4 bg-gradient-to-t from-white via-white to-transparent">
        {/* Validation hint */}
        <AnimatePresence>
          {!canContinue && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="text-center text-xs text-slate-400 mb-2"
            >
              {personaHint}
            </motion.p>
          )}
        </AnimatePresence>
        
        <button
          onClick={handleContinue}
          disabled={!canContinue}
          className={`w-full py-3.5 rounded-full font-semibold text-base transition-all duration-200 ${
            canContinue
              ? 'text-black shadow-md shadow-cyan-400/25 hover:brightness-105 active:scale-95'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
          style={canContinue ? { background: 'linear-gradient(135deg, #00BAF7 0%, #0CF2E3 100%)' } : undefined}
        >
          {isHebrew
            ? (userGender === 'female' ? 'המשיכי' : 'המשך') // i18n-allow-hebrew: legacy v1 (enable_home_v2 on)
            : 'Continue'}
        </button>
      </div>

      {/* Access Code Gate Modal — triggered for military/school personas */}
      <AnimatePresence>
        {showCodeModal && pendingPersona && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-center justify-center p-5"
            style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.45)' }}
            onClick={() => (codeSuccessResult ? handleCodeSuccessContinue() : handleCodeSkip())}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: 'spring', damping: 22, stiffness: 260 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm"
            >
              {codeSuccessResult ? (
                <div className="bg-white rounded-2xl p-6 text-center" dir="rtl">
                  <h3 className="text-lg font-black text-gray-900 mb-4">{/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}הקוד אומת!</h3>
                  <div className="flex justify-center mb-4">
                    <UnitJoinSuccessBanner result={codeSuccessResult} />
                  </div>
                  <button
                    onClick={handleCodeSuccessContinue}
                    className="w-full py-3 rounded-xl font-semibold text-on-brand bg-brand-cta hover:brightness-105"
                  >
                    {/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}המשך
                  </button>
                </div>
              ) : (
                <>
                  <div className="text-center mb-4">
                    <span className="text-4xl">{getPersonaEmoji(pendingPersona)}</span>
                    <h3 className="text-lg font-black text-white mt-2" dir="rtl">
                      {/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}{isHebrew ? 'יש לך קוד גישה מהארגון?' : 'Got an access code?'}
                    </h3>
                  </div>
                  <AccessCodeGate
                    orgName={isHebrew ? getPersonaLabel(pendingPersona) : pendingPersona.labelEn}
                    personaLabel={getPersonaLabel(pendingPersona)}
                    tenantType={PERSONA_TENANT_TYPE[pendingPersona.id] ?? 'educational'}
                    onSuccess={handleCodeSuccess}
                    onSkip={handleCodeSkip}
                    optional
                  />
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {drawerPersonaId && (
        <PersonaQuestionsDrawer
          personaId={drawerPersonaId}
          isOpen={drawerPersonaId !== null}
          onComplete={() => setDrawerPersonaId(null)}
        />
      )}
    </div>
  );
}
