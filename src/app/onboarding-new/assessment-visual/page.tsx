'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

import TierSelectionCard from '@/features/user/onboarding/components/visual-assessment/TierSelectionCard';
import VisualSlider from '@/features/user/onboarding/components/visual-assessment/VisualSlider';
import ProgramResult from '@/features/user/onboarding/components/ProgramResult';
import { firePhaseConfetti } from '@/features/user/onboarding/utils/onboarding-confetti';
import OnboardingStoryBar from '@/features/user/onboarding/components/OnboardingStoryBar';
import { TOTAL_PHASES, STRENGTH_PHASES, STRENGTH_LABELS } from '@/features/user/onboarding/constants/onboarding-phases';
import ResultLoading from '@/features/user/onboarding/components/ResultLoading';
import { evaluateRules } from '@/features/user/onboarding/services/assessment-rule-engine.service';
import {
  mapLevelsToProgram,
  type ProgramMappingResult,
} from '@/features/user/onboarding/services/program-threshold-mapper.service';
import {
  clearContentCache,
  resolveText,
} from '@/features/user/onboarding/services/visual-content-resolver.service';
import { syncOnboardingToFirestore } from '@/features/user/onboarding/services/onboarding-sync.service';
import {
  computeAssessmentContext,
  saveAssessmentContext,
} from '@/features/user/onboarding/services/branching-logic.service';
import type {
  AssessmentLevels,
  AssessmentRule,
  UserDemographics,
  LevelMode,
} from '@/features/user/onboarding/types/visual-assessment.types';
import {
  getPathConfigSync,
  loadPathConfigAsync,
  getMaxLevelForCategory,
  type AssessmentPathConfig,
} from '@/features/user/onboarding/services/assessment-path-config.service';
import { getProgramLevelSetting } from '@/features/content/programs/core/programLevelSettings.service';
import { getAllPrograms } from '@/features/content/programs/core/program.service';

// ── Constants ──────────────────────────────────────────────────────

const PRIMARY_CATEGORIES = ['push', 'pull', 'legs', 'core'] as const;

type FlowStep =
  | 'loading'
  | 'tier'
  | 'sliders'
  | 'evaluating'
  | 'follow-up'
  | 'resultLoading'
  | 'result'
  | 'saving';

interface ResultData {
  programId: string;
  levelMode: LevelMode;
  levelId: string;
  displayName: string;
  levels: AssessmentLevels;
  average: number;
  /** Path 3: skill program ID → level for activePrograms */
  skillLevels?: Record<string, number>;
}

// ── Auth helper ────────────────────────────────────────────────────

function resolveUid(authUser: User | null): string | null {
  if (authUser?.uid) return authUser.uid;
  if (auth.currentUser?.uid) return auth.currentUser.uid;
  try {
    return sessionStorage.getItem('gateway_uid');
  } catch {
    return null;
  }
}

// ── Page component ─────────────────────────────────────────────────

export default function VisualAssessmentPage() {
  const router = useRouter();

  // ── Auth state ───────────────────────────────────────────────

  const [authUser, setAuthUser] = useState<User | null>(auth.currentUser);
  const [authReady, setAuthReady] = useState(!!auth.currentUser);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      setAuthUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // ── Demographics (from sessionStorage set by Profile page) ───
  // isHydrated: true only after we've read sessionStorage, so route guards
  // don't fire prematurely and send users back to profile before data is loaded.

  const [demographics, setDemographics] = useState<UserDemographics | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const dob = sessionStorage.getItem('onboarding_personal_dob');
    const gender = sessionStorage.getItem('onboarding_personal_gender') as
      | 'male'
      | 'female'
      | null;
    if (dob && gender) {
      const birth = new Date(dob);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
      setDemographics({ age, gender });
    }
    setIsHydrated(true);
  }, []);

  // ── Path config (from onboarding_program_path) ───────────────

  const [pathConfig, setPathConfig] = useState<AssessmentPathConfig | null>(
    null,
  );

  // ── Flow state ───────────────────────────────────────────────

  const [step, setStep] = useState<FlowStep>('loading');
  const [categoryIndex, setCategoryIndex] = useState(0);
  const [levels, setLevels] = useState<AssessmentLevels | Record<string, number>>({
    push: 5,
    pull: 5,
    legs: 5,
    core: 5,
  });
  const [initialTierLevel, setInitialTierLevel] = useState(5);

  // Follow-up state
  const [followUpCategories, setFollowUpCategories] = useState<string[]>([]);
  const [followUpIndex, setFollowUpIndex] = useState(0);
  const [followUpTitle, setFollowUpTitle] = useState('');
  const [matchedRule, setMatchedRule] = useState<AssessmentRule | null>(null);

  // Result state
  const [result, setResult] = useState<ResultData | null>(null);
  const [selectedTier, setSelectedTier] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');

  // User name (for the ProgramResult screen)
  const userName = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem('onboarding_personal_name') || '';
  }, []);

  // ── Load path config on mount ────────────────────────────────
  // Always use async version to fetch per-category maxLevels from programs.

  useEffect(() => {
    let cancelled = false;
    const syncConfig = getPathConfigSync();
    // Set sync config immediately so the UI can start rendering
    setPathConfig(syncConfig);
    // Then load the full async config with program-derived maxLevels
    loadPathConfigAsync()
      .then((config) => {
        if (!cancelled) setPathConfig(config);
      })
      .catch(() => {
        // sync config already set — no action needed
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Initialise on mount ──────────────────────────────────────
  // Only run redirect when isHydrated so we don't send users back to profile
  // before sessionStorage has been read.

  useEffect(() => {
    if (!isHydrated) return;
    if (!authReady || !demographics) {
      if (authReady && !demographics) router.replace('/onboarding-new/profile');
      return;
    }
    if (!pathConfig) return;

    if (pathConfig.skipTier && pathConfig.categories.length > 0) {
      // Path 3: skip tier, go straight to sliders
      const initialLevels: Record<string, number> = {};
      for (const cat of pathConfig.categories) {
        const max = getMaxLevelForCategory(pathConfig, cat);
        initialLevels[cat] = Math.max(1, Math.min(max, Math.ceil(max / 2)));
      }
      setLevels(initialLevels);
      setCategoryIndex(0);
      setStep('sliders');
    } else {
      setStep('tier');
    }
  }, [authReady, isHydrated, demographics, pathConfig, router]);

  // Clear content cache on mount (so admin updates are immediately visible)
  // and again on unmount (GC).
  useEffect(() => {
    clearContentCache();
    return () => clearContentCache();
  }, []);

  // Prefetch next route (skip dynamic — go straight to health declaration)
  useEffect(() => {
    router.prefetch('/onboarding-new/health');
  }, [router]);

  // ── Tier selection handler ───────────────────────────────────

  const handleTierSelect = useCallback(
    (tierId: string, lvl: number) => {
      const clamped = pathConfig?.clampTierLevel(lvl) ?? lvl;
      setInitialTierLevel(clamped);
      setLevels({
        push: clamped,
        pull: clamped,
        legs: clamped,
        core: clamped,
      });
      setSelectedTier(tierId as 'beginner' | 'intermediate' | 'advanced');
      setCategoryIndex(0);
      setStep('sliders');
    },
    [pathConfig],
  );

  // ── Primary slider confirm ───────────────────────────────────

  const categories = pathConfig?.categories ?? [...PRIMARY_CATEGORIES];

  /** Fill missing push/pull/legs/core with path default for rule engine */
  const toFullAssessmentLevels = useCallback(
    (partial: Record<string, number>): AssessmentLevels => {
      const min = pathConfig?.minLevel ?? 1;
      return {
        push: partial.push ?? min,
        pull: partial.pull ?? min,
        legs: partial.legs ?? min,
        core: partial.core ?? min,
        ...partial,
      };
    },
    [pathConfig?.minLevel],
  );

  const handleSliderConfirm = useCallback(
    (confirmedLevel: number) => {
      const cat = categories[categoryIndex];
      const newLevels = { ...levels, [cat]: confirmedLevel };
      setLevels(newLevels);

      if (categoryIndex < categories.length - 1) {
        setCategoryIndex((prev) => prev + 1);
      } else {
        if (pathConfig?.path === 'skills') {
          buildSkillResult(newLevels as Record<string, number>);
        } else {
          setStep('evaluating');
          runRuleEngine(toFullAssessmentLevels(newLevels));
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categoryIndex, levels, pathConfig, categories, toFullAssessmentLevels],
  );

  // ── Path 3: Build result from skill levels ────────────────────

  const buildSkillResult = async (
    skillLevels: Record<string, number>,
  ) => {
    try {
      const programs = await getAllPrograms();
      const masterSubLevels: Record<string, number> = {
        push: 5,
        pull: 5,
        legs: 5,
        core: 5,
      };

      for (const [skillId, level] of Object.entries(skillLevels)) {
        const settings = await getProgramLevelSetting(skillId, level).catch(
          () => null,
        );
        const parentMapping = settings?.parentLevelMapping;
        if (parentMapping && typeof parentMapping === 'object') {
          const program = programs.find((p) => p.id === skillId);
          const pattern = program?.movementPattern;
          if (pattern === 'push' && parentMapping[String(level)] != null) {
            masterSubLevels.push = Math.max(
              masterSubLevels.push,
              parentMapping[String(level)],
            );
          }
          if (pattern === 'pull' && parentMapping[String(level)] != null) {
            masterSubLevels.pull = Math.max(
              masterSubLevels.pull,
              parentMapping[String(level)],
            );
          }
        }
      }

      const primaryProgramId = categories[0] ?? 'full_body';
      const primaryLevel = skillLevels[categories[0]] ?? 1;
      const avg = Math.round(
        Object.values(skillLevels).reduce((a, b) => a + b, 0) /
          Math.max(1, Object.keys(skillLevels).length),
      );

      setResult({
        programId: primaryProgramId,
        levelMode: 'manual',
        levelId: `${primaryProgramId}_level_${primaryLevel}`,
        displayName: primaryProgramId.replace(/_/g, ' '),
        levels: {
          push: masterSubLevels.push,
          pull: masterSubLevels.pull,
          legs: masterSubLevels.legs,
          core: masterSubLevels.core,
        },
        average: avg,
        skillLevels,
      });
      setStep('resultLoading');
    } catch (err) {
      console.error('[Assessment] buildSkillResult error:', err);
      const primaryProgramId = categories[0] ?? 'full_body';
      const primaryLevel = skillLevels[categories[0]] ?? 1;
      setResult({
        programId: primaryProgramId,
        levelMode: 'manual',
        levelId: `${primaryProgramId}_level_${primaryLevel}`,
        displayName: primaryProgramId.replace(/_/g, ' '),
        levels: {
          push: 5,
          pull: 5,
          legs: 5,
          core: 5,
        },
        average: primaryLevel,
        skillLevels,
      });
      setStep('resultLoading');
    }
  };

  // ── Rule engine ──────────────────────────────────────────────

  const runRuleEngine = async (currentLevels: AssessmentLevels) => {
    try {
      const rule = await evaluateRules(currentLevels);

      if (rule) {
        setMatchedRule(rule);

        if (
          rule.action.type === 'BRANCH_TO_FOLLOW_UP' &&
          rule.action.followUpCategories?.length
        ) {
          setFollowUpCategories(rule.action.followUpCategories);
          setFollowUpIndex(0);
          setFollowUpTitle(
            resolveText(rule.action.followUpTitle, 'he', demographics?.gender ?? 'male') ||
              'הערכה מתקדמת',
          );
          setStep('follow-up');
        } else if (
          rule.action.type === 'SKIP_TO_RESULT' &&
          rule.action.forceProgramId
        ) {
          await buildSkipResult(
            currentLevels,
            rule.action.forceProgramId,
            rule.action.forceLevelMode ?? 'manual',
            rule.action.forceLevelId,
          );
        } else {
          await buildThresholdResult(currentLevels);
        }
      } else {
        await buildThresholdResult(currentLevels);
      }
    } catch (err) {
      console.error('[Assessment] Rule evaluation error:', err);
      await buildThresholdResult(currentLevels);
    }
  };

  // ── Follow-up slider confirm ─────────────────────────────────

  const handleFollowUpConfirm = useCallback(
    (confirmedLevel: number) => {
      const cat = followUpCategories[followUpIndex];
      const newLevels = { ...levels, [cat]: confirmedLevel };
      setLevels(newLevels);

      if (followUpIndex < followUpCategories.length - 1) {
        setFollowUpIndex(prev => prev + 1);
      } else {
        setStep('evaluating');
        buildThresholdResult(toFullAssessmentLevels(newLevels));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [followUpIndex, followUpCategories, levels, toFullAssessmentLevels],
  );

  // ── Result builders ──────────────────────────────────────────

  const computeAverage = (l: AssessmentLevels) =>
    Math.round((l.push + l.pull + l.legs) / 3);

  const buildThresholdResult = async (currentLevels: AssessmentLevels) => {
    try {
      const mapping: ProgramMappingResult = await mapLevelsToProgram(currentLevels);
      const avg = computeAverage(currentLevels);
      const name =
        resolveText(mapping.displayName, 'he') ||
        resolveText(mapping.displayName, 'en') ||
        mapping.programId;

      setResult({
        programId: mapping.programId,
        levelMode: mapping.levelMode ?? 'manual',
        levelId: mapping.levelId,
        displayName: name,
        levels: currentLevels,
        average: avg,
      });
      setStep('resultLoading');
    } catch (err) {
      console.error('[Assessment] Threshold mapping error:', err);
      const avg = computeAverage(currentLevels);
      setResult({
        programId: 'full_body',
        levelMode: 'auto',
        levelId: '',
        displayName: 'גוף מלא — ברירת מחדל',
        levels: currentLevels,
        average: avg,
      });
      setStep('resultLoading');
    }
  };

  const buildSkipResult = async (
    currentLevels: AssessmentLevels,
    forceProgramId: string,
    forceLevelMode: LevelMode = 'manual',
    forceLevelId?: string,
  ) => {
    const avg = computeAverage(currentLevels);
    const resolvedLevelId =
      forceLevelMode === 'manual' && forceLevelId
        ? forceLevelId
        : '';
    setResult({
      programId: forceProgramId,
      levelMode: forceLevelMode,
      levelId: resolvedLevelId,
      displayName: forceProgramId.replace(/_/g, ' '),
      levels: currentLevels,
      average: avg,
    });
    setStep('resultLoading');
  };

  // ── Accept & persist ─────────────────────────────────────────

  const handleAcceptResult = useCallback(async () => {
    if (!result) return;
    setStep('saving');

    try {
      const uid = resolveUid(authUser);
      if (!uid) {
        alert('לא נמצא משתמש מחובר — נסו לרענן.');
        setStep('result');
        return;
      }

      // Resolve levelId: for 'auto' mode, derive from average so the sync
      // service filter doesn't discard it (it requires non-empty levelId).
      const resolvedLevelId =
        result.levelId && result.levelId.trim() !== ''
          ? result.levelId
          : `${result.programId}_level_${Math.round(result.average)}`;

      // Path B: Zero-out categories NOT selected (user wasn't asked about them)
      const selectedCategories =
        pathConfig?.path === 'body_focus'
          ? (pathConfig.categories ?? [])
          : ['push', 'pull', 'legs', 'core'];
      const masterSubLevels = {
        push: selectedCategories.includes('push') ? (result.levels.push ?? 0) : 0,
        pull: selectedCategories.includes('pull') ? (result.levels.pull ?? 0) : 0,
        legs: selectedCategories.includes('legs') ? (result.levels.legs ?? 0) : 0,
        core: selectedCategories.includes('core') ? (result.levels.core ?? 0) : 0,
      };

      const assignedResults =
        result.skillLevels && Object.keys(result.skillLevels).length > 0
          ? Object.entries(result.skillLevels).map(([skillId, level]) => ({
              programId: skillId,
              levelMode: 'manual' as LevelMode,
              levelId: `${skillId}_level_${level}`,
              masterProgramSubLevels: masterSubLevels,
            }))
          : [
              {
                programId: result.programId,
                levelMode: result.levelMode,
                levelId: resolvedLevelId,
                masterProgramSubLevels: masterSubLevels,
              },
            ];

      console.log('[Assessment] Persisting results:', {
        programId: result.programId,
        levelMode: result.levelMode,
        resolvedLevelId,
        average: result.average,
        levels: result.levels,
      });

      // Persist to sessionStorage (backup for the sync service)
      sessionStorage.setItem(
        'onboarding_assigned_results',
        JSON.stringify(assignedResults),
      );
      sessionStorage.setItem(
        'onboarding_assessment_levels',
        JSON.stringify(result.levels),
      );

      // Build & persist the AssessmentContext for the branching logic engine.
      // This allows any future questionnaire to reference assessment levels,
      // tier, and rule-driven skip/inject overrides.
      try {
        const ctx = await computeAssessmentContext(result.levels, selectedTier);
        saveAssessmentContext(ctx);
      } catch (ctxErr) {
        console.warn('[Assessment] Could not compute branching context:', ctxErr);
      }

      // Save assessment-specific metadata directly to user doc
      await setDoc(
        doc(db, 'users', uid),
        {
          assessmentResults: {
            levels: result.levels,
            average: result.average,
            assignedProgramId: result.programId,
            assignedLevelMode: result.levelMode,
            assignedLevelId: resolvedLevelId,
            completedAt: serverTimestamp(),
            ...(matchedRule
              ? {
                  matchedRuleId: matchedRule.id,
                  matchedRuleName: matchedRule.name,
                }
              : {}),
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      // Call the full sync service with 'COMPLETED' —
      // this sets up progression tracks, activePrograms, domains,
      // persona engine, and recalculates master program levels.
      const synced = await syncOnboardingToFirestore('COMPLETED', {
        assignedResults,
      });

      if (!synced) {
        console.warn('[Assessment] Sync returned false — data may be incomplete');
      }

      firePhaseConfetti();
      router.push('/onboarding-new/health');
    } catch (err) {
      console.error('[Assessment] Save error:', err);
      alert('שגיאה בשמירה — נסו שנית');
      setStep('result');
    }
  }, [result, authUser, matchedRule, router, selectedTier, pathConfig]);

  // ── Slide animation variants ─────────────────────────────────

  const slideVariants = {
    enter: { opacity: 0, x: 60 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -60 },
  };

  // ── Render ───────────────────────────────────────────────────

  if (
    !authReady ||
    !isHydrated ||
    step === 'loading' ||
    (authReady && demographics && !pathConfig)
  ) {
    return (
      <div
        className="min-h-[100dvh] bg-gradient-to-b from-slate-50 via-white to-slate-50 flex items-center justify-center"
        dir="rtl"
      >
        <div className="text-center">
          <Loader2
            size={36}
            className="text-[#5BC2F2] animate-spin mx-auto mb-4"
          />
          <p className="text-slate-400 text-sm font-medium">טוען הערכה...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-[100dvh] bg-gradient-to-b from-slate-50 via-white to-slate-50 flex flex-col"
      dir="rtl"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Flow content — fills all available space */}
      <div className="flex-1 flex flex-col w-full max-w-md mx-auto overflow-hidden min-h-0">
        <AnimatePresence mode="wait">
          {/* ── Tier Selection ─────────────────────────────────── */}
          {step === 'tier' && pathConfig && (
            <motion.div
              key="tier"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col"
            >
              <TierSelectionCard
                onSelect={handleTierSelect}
                clampTierLevel={pathConfig.clampTierLevel}
              />
            </motion.div>
          )}

          {/* ── Primary category sliders ───────────────────────── */}
          {step === 'sliders' && demographics && pathConfig && (
            <motion.div
              key={`slider-${categories[categoryIndex]}`}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col"
            >
              <VisualSlider
                category={categories[categoryIndex]}
                initialLevel={
                  (levels as Record<string, number>)[categories[categoryIndex]] ??
                  pathConfig.minLevel
                }
                demographics={demographics}
                onLevelConfirm={handleSliderConfirm}
                stepIndex={categoryIndex}
                totalSteps={categories.length}
                minLevel={pathConfig.minLevel}
                maxLevel={getMaxLevelForCategory(
                  pathConfig,
                  categories[categoryIndex],
                )}
                mode="simple"
              />
            </motion.div>
          )}

          {/* ── Evaluating spinner ─────────────────────────────── */}
          {step === 'evaluating' && (
            <motion.div
              key="evaluating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col"
            >
              <OnboardingStoryBar
                totalPhases={TOTAL_PHASES}
                currentPhase={STRENGTH_PHASES.ASSESSMENT}
                phaseFillPercent={100}
                phaseLabel={STRENGTH_LABELS[STRENGTH_PHASES.ASSESSMENT]}
              />
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <Loader2
                    size={40}
                    className="text-[#5BC2F2] animate-spin mx-auto mb-4"
                  />
                  <h2 className="text-xl font-black text-slate-900 mb-2">
                    מנתח תוצאות...
                  </h2>
                  <p className="text-sm text-slate-500">
                    בודק את הפרופיל שלך ומתאים תוכנית
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Follow-up sliders (rule-triggered) ─────────────── */}
          {step === 'follow-up' && demographics && (
            <motion.div
              key={`followup-${followUpCategories[followUpIndex]}`}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col"
            >
              {/* Follow-up badge */}
              <div className="text-center px-6 pt-2">
                <span className="inline-block px-3 py-1 rounded-full bg-violet-100 text-violet-700 text-xs font-bold">
                  הערכה מתקדמת
                </span>
                {followUpTitle && (
                  <p className="text-sm text-slate-500 mt-1">{followUpTitle}</p>
                )}
              </div>

              <VisualSlider
                category={followUpCategories[followUpIndex]}
                initialLevel={
                  levels[followUpCategories[followUpIndex]] ?? initialTierLevel
                }
                demographics={demographics}
                onLevelConfirm={handleFollowUpConfirm}
                stepIndex={followUpIndex}
                totalSteps={followUpCategories.length}
                mode="simple"
              />
            </motion.div>
          )}

          {/* ── Result loading animation ─── */}
          {/* ResultLoading renders its own fixed-inset overlay with the unified story bar */}
          {step === 'resultLoading' && result && (
            <motion.div
              key="resultLoading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1"
            >
              <ResultLoading
                targetLevel={result.average}
                onComplete={() => setStep('result')}
                language="he"
              />
            </motion.div>
          )}

          {/* ── Result screen — Phase 4 active ── */}
          {/* ProgramResult renders its own fixed-inset overlay with the unified story bar */}
          {step === 'result' && result && (
            <motion.div
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1"
            >
              <ProgramResult
                levelNumber={result.average}
                levelId={result.levelId || undefined}
                programId={result.programId}
                userName={userName}
                language="he"
                onContinue={handleAcceptResult}
                assessmentLevels={{
                  push: result.levels?.push ?? 0,
                  pull: result.levels?.pull ?? 0,
                  legs: result.levels?.legs ?? 0,
                  core: result.levels?.core ?? 0,
                }}
              />
            </motion.div>
          )}

          {/* ── Saving spinner ─────────────────────────────────── */}
          {step === 'saving' && (
            <motion.div
              key="saving"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col"
            >
              <OnboardingStoryBar
                totalPhases={TOTAL_PHASES}
                currentPhase={STRENGTH_PHASES.HEALTH}
                phaseLabel={STRENGTH_LABELS[STRENGTH_PHASES.HEALTH]}
              />
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <Loader2
                    size={36}
                    className="text-[#5BC2F2] animate-spin mx-auto mb-4"
                  />
                  <h2 className="text-xl font-black text-slate-900 mb-2">
                    שומר תוצאות...
                  </h2>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
