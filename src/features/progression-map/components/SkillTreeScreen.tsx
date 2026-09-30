'use client';

/**
 * SkillTreeScreen — Phase 1's top-level screen for one leaf program's Skill Tree.
 *
 * One tap surface (Progression v2 Phase 4b — the level drawer is GONE):
 *   - Node tap → the existing per-EXERCISE ExerciseDetailSheet (same one the
 *     library uses), for that node's representative exercise. Any node
 *     above the user's actual current level is NOT blocked — tapping it
 *     opens the same sheet with a small "above your level" notice instead
 *     of being disabled. Round 10 fix: this used to key off the node's
 *     VISUAL state (`state === 'locked'`), which misses the target/crown
 *     node entirely — deriveState (TreePath.tsx) always labels the max
 *     level 'target' (gold crown), never 'locked', even before the user
 *     has reached it. Now keyed off TreePath's isAboveCurrentLevel, a
 *     direct level comparison independent of the visual label, so the
 *     notice correctly shows on every not-yet-reached node including the
 *     last one.
 *
 * Phase 4b: the header no longer opens ProgramDrawer (a bottom-sheet) —
 * that component is UNTOUCHED (still used as-is by Profile's
 * ProgramsSection, confirmed via recon) but this screen stopped mounting
 * it. Its content moved INLINE, at the top of <main>, as the new
 * "current level" card — see below. Per an explicit decision, there is NO
 * "start workout" button on this card or anywhere on this screen: a
 * workout begins by tapping a tree node -> the exercise detail page
 * (confirmed by recon: no start-workout affordance exists on that path
 * today at all, so "gate starting a workout, not viewing" has nothing to
 * attach to here — viewing was, and stays, always unrestricted).
 *
 * One page, two states (confirmed workable in recon, not a new screen):
 * the inline current-level card renders ONLY when currentLevel is a real,
 * non-null number (i.e. genuinely assessed) — structurally exclusive with
 * isUnassessed/isPrereqLocked below, since getProgramState's own
 * precedence means a real tracked/active level can never coexist with a
 * locked_prereq/needs_assessment result for the SAME program.
 *
 * The swap sheet's "החלף לתרגיל זה" action updates a session-local override
 * (which exercise displays as a given level's representative) — not
 * persisted to Firestore, resets on reload. No new data model, consistent
 * with the feature's whole scope.
 *
 * Sheet-close, round 6 — the actual root cause (rounds 1-5 all patched
 * symptoms of this without naming it): ExerciseDetailSheet's open/closed
 * state lived in useExerciseLibraryStore, an APP-WIDE Zustand store. That
 * store — and the sheet reading it — doesn't belong to this screen; it
 * survives this screen unmounting and re-renders on whatever screen loads
 * next. Round 5's trace proved it directly: closeDetail() fired with no
 * subsequent open call, yet the sheet reappeared on the map — because the
 * bottom-nav navigation unmounts SkillTreeScreen (and its pathname-change
 * effect never gets to run) before anything closes the still-open global
 * sheet, which then re-renders wherever ExerciseLibraryPage or this global
 * portal next mounts. No amount of "close it faster" (popstate, pushState,
 * pathname effects, unmount cleanup) can fix a sheet that belongs to a
 * different lifecycle than the screen that opens it.
 *
 * Fix: ExerciseDetailSheet now supports a `controlled` prop (see that
 * file) — driven by LOCAL state here (`detailExercise`/`detailNotice`)
 * instead of the global store. Node tap sets local state; close clears it.
 * Because the sheet is a child of this component in the controlled path,
 * any way of leaving this screen — bottom nav, חזרה, browser back —
 * unmounts the sheet along with the screen automatically, the same way
 * any other local child state would disappear. There is no shared state
 * left for anything else to read as "still open," so every previous
 * mechanism (usePathname effect, pushState/popstate, unmount-cleanup) is
 * now redundant and removed rather than kept as unnecessary belt-and-
 * braces on top of a fix that no longer needs one.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, MapPin } from 'lucide-react';
import type { Exercise } from '@/features/content/exercises';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { getProgramByTemplateId } from '@/features/content/programs/core/program.service';
import type { Program } from '@/features/content/programs/core/program.types';
import { getProgramLevelSetting } from '@/features/content/programs/core/programLevelSettings.service';
import type { ProgramLevelSettings } from '@/features/content/programs/core/program.types';
import { getLocalizedText } from '@/features/content/exercises';
import ExerciseDetailSheet from '@/features/content/exercises/client/components/ExerciseDetailSheet';
import { resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';
import { domainTypeForSlug } from '@/features/profile/components/widgets/program-groups.utils';
import { useSkillTree } from '../hooks/useSkillTree';
import { useProgramCardState } from '../hooks/useProgramCardState';
import { NEEDS_ASSESSMENT_HINT } from '../services/program-card-state.service';
import { resolveLevelSummary } from '../services/level-summary.service';
import { TreePath } from './TreePath';
import { ProgramLevelSwapSheet } from './ProgramLevelSwapSheet';
import { SkillTreeBackground } from './SkillTreeBackground';
import type { SkillTreeRung } from '../core/types';
import type { TreeNodeState } from './TreeNode';
import { startMiniDomainAssessment } from '@/features/user/onboarding/services/mini-domain-assessment';

const LOCKED_NOTICE = '🔒 שים לב — זה עוד לא תרגיל ברמה שלך';
const UNASSESSED_BANNER_TEXT = 'עדיין לא יודעים את הרמה שלך — בצע מבדק כדי לסמן איפה אתה';

export interface SkillTreeScreenProps {
  programId: string;
}

export function SkillTreeScreen({ programId }: SkillTreeScreenProps) {
  const router = useRouter();
  const profile = useUserStore((s) => s.profile);
  const { tree, currentLevel, isLoading } = useSkillTree(programId);
  // Progression v2 Phase 4a-fix: viewing is never gated (see the file
  // header — no such guard exists, by design), but an unassessed or
  // prerequisite-locked program shows an informational banner instead of
  // just silently rendering the tree as if nothing were unusual.
  const { state: cardState, lockedHint } = useProgramCardState(programId);
  const isUnassessed = cardState === 'locked_prereq' && lockedHint === NEEDS_ASSESSMENT_HINT;
  const isPrereqLocked = cardState === 'locked_prereq' && lockedHint != null && !isUnassessed;
  const [programMeta, setProgramMeta] = useState<Program | null>(null);
  const [levelSettings, setLevelSettings] = useState<ProgramLevelSettings | null>(null);
  const [swapRung, setSwapRung] = useState<SkillTreeRung | null>(null);
  const [representativeOverrides, setRepresentativeOverrides] = useState<Record<number, Exercise>>({});

  // Round 6: the exercise-detail sheet's open/closed state, LOCAL to this
  // screen — see the header comment for why this replaces the global
  // useExerciseLibraryStore-driven version. null = closed.
  const [detailExercise, setDetailExercise] = useState<Exercise | null>(null);
  const [detailNotice, setDetailNotice] = useState<string | null>(null);
  const closeDetail = () => {
    setDetailExercise(null);
    setDetailNotice(null);
  };

  useEffect(() => {
    let cancelled = false;
    getProgramByTemplateId(programId).then((p) => {
      if (!cancelled) setProgramMeta(p);
    });
    return () => {
      cancelled = true;
    };
  }, [programId]);

  // Progression v2 Phase 4b — the inline current-level card's data source.
  // getProgramLevelSetting keys its Firestore doc ID off the RAW program
  // id (confirmed: admin/programs/page.tsx's own save call uses
  // `programId: program.id`, not a slug) — programId here (the route
  // param) already IS that raw id, same as every other call in this file.
  useEffect(() => {
    if (currentLevel == null) {
      setLevelSettings(null);
      return;
    }
    let cancelled = false;
    getProgramLevelSetting(programId, currentLevel).then((s) => {
      if (!cancelled) setLevelSettings(s);
    });
    return () => {
      cancelled = true;
    };
  }, [programId, currentLevel]);

  // Reset session-local overrides when switching to a different program (the
  // 6 Phase-1 screens will share this component once wired — an override for
  // "front lever level 4" must not leak into "planche level 4").
  useEffect(() => {
    setRepresentativeOverrides({});
  }, [programId]);

  // This screen's own חזרה link: close the sheet first if open, so a tap
  // just dismisses it without an unnecessary route change. Every other
  // exit (bottom nav, browser back) closes the sheet implicitly, simply by
  // unmounting this screen and the locally-controlled sheet along with it
  // — see the header comment.
  const handleBack = () => {
    if (detailExercise) {
      closeDetail();
      return;
    }
    router.back();
  };

  const displayTree = useMemo(() => {
    if (!tree) return null;
    if (Object.keys(representativeOverrides).length === 0) return tree;
    return {
      ...tree,
      rungs: tree.rungs.map((rung) => {
        const override = representativeOverrides[rung.level];
        return override && !rung.isGap ? { ...rung, representative: override } : rung;
      }),
    };
  }, [tree, representativeOverrides]);

  const skillName = programMeta?.name ?? '';
  const targetRung = displayTree?.rungs.find((r) => r.level === displayTree.maxLevel);
  const targetName = targetRung?.representative ? getLocalizedText(targetRung.representative.name, 'he') : '';

  const tracks = (profile?.progression?.tracks ?? {}) as Record<
    string,
    { currentLevel?: number; percent?: number; totalWorkoutsCompleted?: number; completedGoalIds?: string[] }
  >;
  const slug = resolveToSlug(programId);
  const trackData = tracks[slug] ?? tracks[programId];

  // ── Inline "current level" card data (Progression v2 Phase 4b) ─────────
  // Replaces ProgramDrawer's content — see file header. Three explicit
  // data-source decisions are encoded in resolveLevelSummary
  // (level-summary.service.ts, independently unit-tested) — this
  // component just gathers the raw inputs (the tree's own current-level
  // representative, the fetched ProgramLevelSettings, this program's
  // completedGoalIds) and reads the result.
  const currentRung = displayTree?.rungs.find((r) => r.level === currentLevel && !r.isGap);
  const currentLevelExercise = currentRung?.representative ?? null;
  const currentLevelExerciseName = currentLevelExercise ? getLocalizedText(currentLevelExercise.name, 'he') : '';

  const levelSummary =
    currentLevel != null
      ? resolveLevelSummary({
          currentLevel,
          levelDescription: levelSettings?.levelDescription,
          targetGoals: levelSettings?.targetGoals,
          currentLevelExerciseId: currentLevelExercise?.id,
          completedGoalIds: trackData?.completedGoalIds,
        })
      : null;

  // Node images resolve via resolveTreeNodeImage (park photo, else a
  // park-video-thumbnail derivation, else home — see TreeNode.tsx), and the
  // exercise-detail sheet gets 'park' via its own locationOverride prop
  // above — this local constant is only still needed for the swap sheet's
  // gear/method-selection query below.
  const location = 'park' as const;

  return (
    // isolate is load-bearing, not decorative: `relative` alone does NOT
    // create a new stacking context (only position + a z-index does), so
    // SkillTreeBackground's -z-10 layer was escaping past this component
    // entirely and painting behind <body>'s own opaque background
    // (globals.css: #F8FAFC) instead of just behind header/main below —
    // confirmed the actual bug (that pale gray IS what was showing through
    // as "the plain tint"), not a missing/404'd asset or an opacity issue.
    <div className="relative isolate min-h-screen" dir="rtl">
      <SkillTreeBackground />

      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-gray-100 px-4 py-3">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-1 text-xs text-gray-400 mb-2"
        >
          <ChevronRight size={14} />
          חזרה
        </button>
        {/* Skill name / level-summary block — Progression v2 Phase 4b: no
            longer tappable, no drawer to open. Its former stat content
            (רמה נוכחית / התקדמות / סה״כ אימונים) moved into the new inline
            "current level" card below, in the assessed state only. */}
        <div className="w-full text-right">
          <h1 className="text-lg font-black text-gray-900">{skillName}</h1>
          {tree && (
            <>
              <p className="text-xs font-bold text-gray-500 mt-1">
                רמה {currentLevel ?? tree.minLevel} מתוך {tree.maxLevel}
                {targetName ? ` · היעד: ${targetName}` : ''}
              </p>
              <div className="w-full h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, Math.round((((currentLevel ?? tree.minLevel) - tree.minLevel) / Math.max(1, tree.maxLevel - tree.minLevel)) * 100))}%`,
                    background: 'linear-gradient(90deg, #2CE0C0 0%, #20C6D6 50%, #2AA3E8 100%)',
                  }}
                />
              </div>
            </>
          )}
        </div>
      </header>

      <main className="px-4 py-6 pb-16">
        {/* Progression v2 Phase 4a-fix: informational only — viewing is
            never blocked (see file header). Assessment is a prompt, not a
            gate: this banner tells the user WHY they see no "אתה כאן"
            marker (TreePath.tsx's own deriveState) and offers the same
            mini-assessment trigger used elsewhere in the app, rather than
            gating anything about the tree itself. */}
        {!isLoading && isUnassessed && (
          <div className="bg-slate-100 text-slate-600 text-[13px] font-semibold text-center rounded-xl px-4 py-2.5 mb-4 flex flex-col items-center gap-2">
            <span>{UNASSESSED_BANNER_TEXT}</span>
            <button
              type="button"
              onClick={() =>
                startMiniDomainAssessment(router, slug, undefined, domainTypeForSlug(slug))
              }
              className="text-xs font-black text-white rounded-full px-4 py-1.5 active:opacity-80"
              style={{ background: 'linear-gradient(90deg, #2CE0C0 0%, #20C6D6 50%, #2AA3E8 100%)' }}
            >
              בצע מבדק
            </button>
          </div>
        )}
        {!isLoading && isPrereqLocked && (
          <div className="bg-slate-100 text-slate-600 text-[13px] font-semibold text-center rounded-xl px-4 py-2.5 mb-4">
            {lockedHint}
          </div>
        )}

        {/* ── Inline "current level" card (Progression v2 Phase 4b) ───────
            Replaces ProgramDrawer. Assessed state ONLY (currentLevel is a
            real number) — see the file header for why this is exclusive
            with the two banners above. Deliberately NO "start workout"
            button — decided confusing; a workout begins by tapping a tree
            node below, same as always. */}
        {!isLoading && currentLevel != null && (
          <div
            className="bg-white rounded-2xl p-3.5 mb-4"
            style={{ border: '1.5px solid #BDEEDE', boxShadow: '0 6px 18px rgba(37,194,129,0.08)' }}
            dir="rtl"
          >
            <div className="flex items-center gap-3 mb-2.5">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-white font-black text-lg"
                style={{ background: 'linear-gradient(135deg, #2CE0C0 0%, #20C6D6 50%, #2AA3E8 100%)' }}
              >
                {currentLevel}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-gray-900">הרמה הנוכחית שלך · {currentLevel}</p>
                {currentLevelExerciseName && (
                  <p className="text-xs text-gray-400 truncate">{currentLevelExerciseName}</p>
                )}
              </div>
              <span className="flex-shrink-0 flex items-center gap-1 text-[10px] font-black text-white rounded-full px-2.5 py-1" style={{ backgroundColor: '#2AA3E8' }}>
                <MapPin size={10} />
                אתה כאן
              </span>
            </div>

            {levelSummary?.realDescription && (
              <p className="text-xs text-gray-600 bg-slate-50 rounded-xl px-3 py-2 mb-2.5 leading-relaxed">
                <b className="text-gray-800">מה מצופה ברמה {currentLevel}:</b> {levelSummary.realDescription}
              </p>
            )}

            {currentLevelExercise && (
              <div className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2 mb-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-800 truncate">תרגיל-היעד: {currentLevelExerciseName}</p>
                  {levelSummary?.matchingGoal && (
                    <p className="text-[11px] text-gray-400">
                      יעד: {levelSummary.matchingGoal.targetValue}{' '}
                      {levelSummary.matchingGoal.unit === 'seconds' ? 'שניות' : 'חזרות'}
                    </p>
                  )}
                </div>
              </div>
            )}

            {levelSummary?.hasGoals && (
              <div className="flex items-center justify-between text-xs px-1 mb-2">
                <span className="text-gray-500">סטטוס</span>
                <span className={`font-bold ${levelSummary.goalsCompleted ? 'text-[#20C6D6]' : 'text-gray-700'}`}>
                  {levelSummary.goalsCompleted ? 'הושלם' : 'בתהליך'}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={() => startMiniDomainAssessment(router, slug, undefined, domainTypeForSlug(slug))}
              className="w-full text-center text-[11.5px] font-bold text-[#0a8ea0] mt-1"
            >
              🔄 עדכן את הרמה שלי
            </button>
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center gap-3 py-20">
            {[1, 2, 3].map((i) => (
              <div key={i} className="w-20 h-20 rounded-2xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && !displayTree && (
          <p className="text-sm text-gray-400 text-center py-20">
            לא נמצאו תרגילים למסלול הזה כרגע.
          </p>
        )}

        {!isLoading && displayTree && (
          <TreePath
            tree={displayTree}
            currentLevel={currentLevel}
            onNodeTap={(rung: SkillTreeRung, _state: TreeNodeState, isAboveCurrentLevel: boolean) => {
              if (!rung.representative) return;
              setDetailExercise(rung.representative);
              // Round 10 fix: was `state === 'locked'` — but the target/
              // crown node is ALWAYS visually 'target' (deriveState in
              // TreePath.tsx), never 'locked', even before the user has
              // reached it, so the notice never showed on the hardest
              // node. isAboveCurrentLevel checks the actual level
              // comparison directly, independent of the visual label —
              // see TreePath.tsx's isAboveCurrentLevel for the full reasoning.
              setDetailNotice(isAboveCurrentLevel ? LOCKED_NOTICE : null);
            }}
            onSwapTap={(rung) => setSwapRung(rung)}
          />
        )}
      </main>

      {/* Mounted here since it otherwise only exists inside ExerciseLibraryPage.
          `controlled` drives it from this screen's own local state (round 6
          — see the header comment); locationOverride="park" is unrelated,
          a LOCAL prop forcing park media resolution regardless of the
          (unused, in controlled mode) global library filter.
          defaultProgramId={programId} (Feature #5, program/path switcher):
          this screen already knows which tree it's rendering (the route
          param, in scope the whole time) — opening a multi-program
          exercise's detail sheet FROM this tree should default the
          switcher to THIS tree's path, not whichever program the exercise
          itself would resolve to first. */}
      <ExerciseDetailSheet
        locationOverride="park"
        defaultProgramId={programId}
        controlled={{ exercise: detailExercise, notice: detailNotice, onClose: closeDetail }}
      />

      {swapRung && profile && (
        <ProgramLevelSwapSheet
          isOpen={swapRung !== null}
          onClose={() => setSwapRung(null)}
          programId={programId}
          level={swapRung.level}
          excludeExerciseId={swapRung.representative!.id}
          location={location}
          park={null}
          userProfile={profile}
          onReplace={(exercise) => {
            setRepresentativeOverrides((prev) => ({ ...prev, [swapRung.level]: exercise }));
          }}
        />
      )}
    </div>
  );
}
