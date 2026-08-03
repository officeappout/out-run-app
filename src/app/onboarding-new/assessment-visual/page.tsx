'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

import BlurredWhyStep, { calcAgeGroup } from '@/features/user/onboarding/components/visual-assessment/BlurredWhyStep';
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
  prefetchCategoryVideos,
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
import { useAndroidBack } from '@/hooks/useAndroidBack';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import {
  isMiniAssessmentActive,
  consumeMiniAssessmentState,
} from '@/features/user/onboarding/services/mini-domain-assessment';
import { writeSingleDomainAssessment } from '@/features/user/onboarding/services/single-domain-assessment.service';

// ── Constants ──────────────────────────────────────────────────────

const PRIMARY_CATEGORIES = ['push', 'pull', 'legs', 'core'] as const;

type FlowStep =
  | 'loading'
  | 'why'
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

  // ── User selection state (read from sessionStorage on mount) ──
  // Used by BlurredWhyStep for personalised intro text.

  const [programPath, setProgramPath] = useState<string | null>(null);
  const [muscleFocus, setMuscleFocus] = useState<string[]>([]);
  const [skillFocus, setSkillFocus] = useState<string[]>([]);

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

    // Program path + focus selections
    const rawPath = sessionStorage.getItem('onboarding_program_path');
    if (rawPath) setProgramPath(rawPath);

    try {
      const rawMuscle = sessionStorage.getItem('onboarding_muscle_focus');
      if (rawMuscle) setMuscleFocus(JSON.parse(rawMuscle) as string[]);
    } catch { /* non-fatal */ }

    try {
      const rawSkill = sessionStorage.getItem('onboarding_skill_focus');
      if (rawSkill) setSkillFocus(JSON.parse(rawSkill) as string[]);
    } catch { /* non-fatal */ }

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

  // ── In-memory back navigation ────────────────────────────────
  // Rolls the FlowStep state machine back one sub-step. Returns true when the
  // back action was consumed (so the Android hardware back / in-app back button
  // does NOT pop the route and destroy assessment progress), false for the
  // initial/loading states where falling through to history.back() is correct.
  const handleStepBack = useCallback((): boolean => {
    switch (step) {
      case 'tier':
        setStep('why');
        return true;
      case 'sliders':
        if (categoryIndex > 0) {
          setCategoryIndex((prev) => prev - 1);
        } else {
          setStep(pathConfig?.skipTier ? 'why' : 'tier');
        }
        return true;
      case 'follow-up':
        if (followUpIndex > 0) {
          setFollowUpIndex((prev) => prev - 1);
        } else {
          setStep('sliders');
        }
        return true;
      default:
        // 'loading' | 'why' | 'evaluating' | 'resultLoading' | 'result' | 'saving'
        return false;
    }
  }, [step, categoryIndex, followUpIndex, pathConfig]);

  // Map the Android hardware/gesture back button to the same state rollback.
  useAndroidBack(handleStepBack);

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
      // Path 3: skip tier — pre-compute starting levels now, but show 'why' first
      const initialLevels: Record<string, number> = {};
      for (const cat of pathConfig.categories) {
        const max = getMaxLevelForCategory(pathConfig, cat);
        initialLevels[cat] = Math.max(1, Math.min(max, Math.ceil(max / 2)));
      }
      setLevels(initialLevels);
      setCategoryIndex(0);
    }
    setStep('why');
  }, [authReady, isHydrated, demographics, pathConfig, router]);

  // ── Diagnostic: log categories fed to sliders ───────────────
  useEffect(() => {
    if (!pathConfig) return;
    console.log(
      '[DEBUG-PAGE] pathConfig.path:', pathConfig.path,
      '| categories passed to VisualSlider:', pathConfig.categories,
      '| skipTier:', pathConfig.skipTier,
    );
  }, [pathConfig]);

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

  // ── Background video preload ─────────────────────────────────────
  // Fires the moment pathConfig + demographics are both available
  // (typically while the user is still reading the tier screen).
  // Resolves the first 2 onboarding levels for every category and warms
  // both the in-memory content cache and the browser HTTP cache via
  // fetch force-cache — so VideoPlayer starts playing instantly.
  useEffect(() => {
    if (!pathConfig || !demographics) return;
    const cats = pathConfig.categories ?? [...PRIMARY_CATEGORIES];
    cats.forEach((cat) => {
      const max = getMaxLevelForCategory(pathConfig, cat);
      prefetchCategoryVideos(cat, demographics, 'he', pathConfig.minLevel, max).catch(() => {});
    });
  }, [pathConfig, demographics]);

  // ── BlurredWhyStep → tier or sliders (How step removed) ────────

  const handleWhyNext = useCallback(() => {
    if (pathConfig?.skipTier) {
      setStep('sliders');
    } else {
      setStep('tier');
    }
  }, [pathConfig]);

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

      // Pin-point prefetch: now we know the exact starting level for every
      // category — warm those specific content + video entries immediately,
      // before the first VisualSlider even mounts.
      if (demographics && pathConfig) {
        const cats = pathConfig.categories ?? [...PRIMARY_CATEGORIES];
        cats.forEach((cat) => {
          const max = getMaxLevelForCategory(pathConfig, cat);
          prefetchCategoryVideos(cat, demographics, 'he', clamped, max).catch(() => {});
        });
      }
    },
    [pathConfig, demographics],
  );

  // ── Primary slider confirm ───────────────────────────────────

  const categories = pathConfig?.categories ?? [...PRIMARY_CATEGORIES];

  // ── Derived props for BlurredWhyStep ────────────────────────

  const exerciseCount = categories.length;
  const ageGroup = demographics ? calcAgeGroup(demographics.age) : '26-50';
  const introGender = (demographics?.gender ?? 'male') as 'male' | 'female';
  const targetArea: string | null =
    programPath === 'skills'
      ? (skillFocus[0] ?? null)
      : programPath === 'body_focus'
        ? (muscleFocus[0] ?? null)
        : null;

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
      // ── Path C: strict zero-baseline for unassessed foundational domains ──
      // All four foundational tracks start at 0 (NOT 5).
      //
      // Rationale:
      //   • A skill-only user (e.g. Planche) never undergoes a push/pull/legs/
      //     core visual slider assessment. Seeding any of those tracks with a
      //     non-zero default contaminates `masterProgramSubLevels` and bypasses
      //     the Ghost Purge in onboarding-sync.service.ts (which only removes
      //     entries whose `currentLevel === 0`).
      //   • `legs` and `core` must remain 0 so the purge can vaporise them.
      //   • `push` (or `pull`) may be overridden below by the CMS
      //     `parentLevelMapping` stored on the program's level settings —
      //     this is the explicit spreadsheet formula for skill→foundation
      //     mapping. If no mapping exists, the +9 offset formula in
      //     onboarding-sync.service.ts (SKILL_TO_FOUNDATION_OFFSET) provides
      //     the correct foundational level without any default here.
      const masterSubLevels: Record<string, number> = {
        push: 0,
        pull: 0,
        legs: 0,
        core: 0,
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
      // Error path: same zero-baseline rule — no ghost L5 defaults.
      // The onboarding-sync SKILL_TO_FOUNDATION_OFFSET formula will derive
      // the correct push/pull level from the skill level on completion.
      setResult({
        programId: primaryProgramId,
        levelMode: 'manual',
        levelId: `${primaryProgramId}_level_${primaryLevel}`,
        displayName: primaryProgramId.replace(/_/g, ' '),
        levels: {
          push: 0,
          pull: 0,
          legs: 0,
          core: 0,
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

    // ── Mini-domain-assessment short-circuit ──────────────────────────────
    // Set by `startMiniDomainAssessment` (WorkoutBuilderSheet's unlock CTA /
    // ProgramsSection's "not yet assessed" card / StatsOverview's unassessed
    // pill) for an ALREADY-onboarded user topping up exactly one more domain.
    // The normal path below reassigns activeProgramId from a mix of this one
    // real category + 3 artificially-defaulted ones (toFullAssessmentLevels),
    // re-stamps marketing attribution, and advances to /onboarding-new/health
    // — none of which is correct for a top-up. Instead: write ONLY this
    // domain via the dedicated single-domain writer and return to the caller.
    // Every other caller (fresh full onboarding) never sets this flag, so the
    // existing behaviour below is unchanged.
    if (isMiniAssessmentActive()) {
      try {
        const { domain, returnTo } = consumeMiniAssessmentState();
        const targetDomain = domain ?? categories[0];
        const assessedLevel = (result.levels as Record<string, number>)[targetDomain] ?? result.average;
        const ok = await writeSingleDomainAssessment(targetDomain, assessedLevel);
        if (!ok) {
          console.warn('[Assessment] Mini-domain write returned false — data may be incomplete');
        }
        // Live-refresh the profile store so the caller (WorkoutBuilderSheet's
        // enrolledIds / ProgramsSection's tracks / StatsOverview's programSlides)
        // sees the new domain immediately on return, regardless of whether the
        // current route happens to have its own onSnapshot listener mounted.
        await useUserStore.getState().refreshProfile();
        firePhaseConfetti();
        router.push(returnTo);
      } catch (err) {
        console.error('[Assessment] Mini-domain save error:', err);
        alert('שגיאה בשמירה — נסו שנית');
        setStep('result');
      }
      return;
    }

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

      // ── Build masterSubLevels ──────────────────────────────────────────────
      // Path B (body_focus): only include the categories the user was actually
      //   assessed on; zero out the rest.
      //
      // Path C (skills): `result.levels.push` / `.pull` may carry the CMS
      //   parentLevelMapping value (e.g. Planche L7 → Push L16). Pass those
      //   non-zero foundation levels through so onboarding-sync can write them.
      //   `legs` and `core` are ALWAYS 0 for skill users — they were never
      //   assessed and must remain absent so the Ghost Purge can vaporise them.
      //
      // Default (health/full_body): include all four base domains.
      const isSkillsPath = pathConfig?.path === 'skills';
      const masterSubLevels = {
        push: isSkillsPath
          ? (result.levels.push ?? 0)            // pass parentMapping value if set; 0 otherwise
          : pathConfig?.path === 'body_focus'
            ? (pathConfig.categories?.includes('push') ? (result.levels.push ?? 0) : 0)
            : (result.levels.push ?? 0),
        pull: isSkillsPath
          ? (result.levels.pull ?? 0)
          : pathConfig?.path === 'body_focus'
            ? (pathConfig.categories?.includes('pull') ? (result.levels.pull ?? 0) : 0)
            : (result.levels.pull ?? 0),
        // legs/core are NEVER assessed for Path C — zero is intentional so the
        // Ghost Purge in onboarding-sync.service.ts can safely remove them.
        legs: isSkillsPath
          ? 0
          : pathConfig?.path === 'body_focus'
            ? (pathConfig.categories?.includes('legs') ? (result.levels.legs ?? 0) : 0)
            : (result.levels.legs ?? 0),
        core: isSkillsPath
          ? 0
          : pathConfig?.path === 'body_focus'
            ? (pathConfig.categories?.includes('core') ? (result.levels.core ?? 0) : 0)
            : (result.levels.core ?? 0),
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
  }, [result, authUser, matchedRule, router, selectedTier, pathConfig, categories]);

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
      className="h-[100dvh] bg-gradient-to-b from-slate-50 via-white to-slate-50 flex flex-col overflow-hidden"
      dir="rtl"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Flow content — fills all available space */}
      <div className="flex-1 flex flex-col w-full max-w-md mx-auto overflow-hidden min-h-0">
        <AnimatePresence mode="wait">
          {/* ── Why step (intro before assessment) ──────────── */}
          {step === 'why' && (
            <motion.div
              key="why"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col"
            >
              <BlurredWhyStep
                gender={introGender}
                ageGroup={ageGroup}
                goal={programPath}
                targetArea={targetArea}
                exerciseCount={exerciseCount}
                onNext={handleWhyNext}
                onBack={() => router.back()}
              />
            </motion.div>
          )}

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
                onBack={() => { handleStepBack(); }}
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
                onBack={() => { handleStepBack(); }}
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
                skillLevels={
                  result.skillLevels && Object.keys(result.skillLevels).length > 0
                    ? result.skillLevels
                    : undefined
                }
                assessedCategories={categories}
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
