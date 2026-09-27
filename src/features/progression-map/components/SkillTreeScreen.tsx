'use client';

/**
 * SkillTreeScreen — Phase 1's top-level screen for one leaf program's Skill Tree.
 *
 * Two separate taps, two separate existing surfaces:
 *   - Node tap → the existing per-EXERCISE ExerciseDetailSheet (same one the
 *     library uses), for that node's representative exercise. Locked nodes
 *     are NOT blocked — tapping one opens the same sheet with a small
 *     "above your level" notice instead of being disabled.
 *     ExerciseDetailSheet is only ever mounted inside ExerciseLibraryPage
 *     today — not globally — so this screen mounts its own instance and
 *     drives it via useExerciseLibraryStore.
 *   - Header tap (skill name / level-summary block) → the existing
 *     per-PROGRAM ProgramDrawer, unmodified.
 *
 * The swap sheet's "החלף לתרגיל זה" action updates a session-local override
 * (which exercise displays as a given level's representative) — not
 * persisted to Firestore, resets on reload. No new data model, consistent
 * with the feature's whole scope.
 *
 * Back-navigation (round 2 — the round-1 fix genuinely did not work; this
 * is a real re-design, not a re-added listener): the previous approach
 * pushed a raw window.history entry and listened for popstate, layered on
 * top of Next.js App Router's OWN client-side navigation/history handling
 * (next/navigation's router keeps its own internal route-history state and
 * a client-side segment cache — mixing in a hand-rolled History API entry
 * it doesn't know about is exactly the kind of thing that can silently not
 * fire, or fire in a way the router then overrides). That mechanism is
 * removed entirely, not patched. In its place: the one concrete, always-
 * visible "back" affordance on this screen (the חזרה button) now checks
 * app state directly and closes the sheet FIRST, with no History API
 * involved at all — deterministic, provable by reading the code, not
 * dependent on how Next.js's router happens to handle a given navigation.
 * The unmount-cleanup (closeDetail on unmount) stays as a second-layer
 * safety net for any other way of leaving this screen. What this does NOT
 * fully guarantee, flagged honestly rather than re-promised: a pure OS/
 * browser gesture-swipe back (not via this screen's own button) has no
 * in-app hook to intercept at all without adopting Next.js's Parallel/
 * Intercepting Routes for this modal — a real architecture change, out of
 * scope for this pass — so that specific path still can't be certified
 * from static code alone. Needs a real-device check.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import type { Exercise } from '@/features/content/exercises';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { getProgramByTemplateId } from '@/features/content/programs/core/program.service';
import type { Program } from '@/features/content/programs/core/program.types';
import { getLocalizedText } from '@/features/content/exercises';
import { useExerciseLibraryStore } from '@/features/content/exercises/client/store/useExerciseLibraryStore';
import ExerciseDetailSheet from '@/features/content/exercises/client/components/ExerciseDetailSheet';
import { resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';
import { domainTypeForSlug } from '@/features/profile/components/widgets/program-groups.utils';
import ProgramDrawer, { type ProgramDrawerData } from '@/features/profile/components/widgets/ProgramDrawer';
import { useSkillTree } from '../hooks/useSkillTree';
import { TreePath } from './TreePath';
import { ProgramLevelSwapSheet } from './ProgramLevelSwapSheet';
import { SkillTreeBackground } from './SkillTreeBackground';
import type { SkillTreeRung } from '../core/types';
import type { TreeNodeState } from './TreeNode';

const LOCKED_NOTICE = '🔒 שים לב — זה עוד לא תרגיל ברמה שלך';

export interface SkillTreeScreenProps {
  programId: string;
}

export function SkillTreeScreen({ programId }: SkillTreeScreenProps) {
  const router = useRouter();
  const profile = useUserStore((s) => s.profile);
  const openExerciseDetail = useExerciseLibraryStore((s) => s.openDetail);
  const isDetailOpen = useExerciseLibraryStore((s) => s.isDetailOpen);
  const closeExerciseDetail = useExerciseLibraryStore((s) => s.closeDetail);
  const setFilterLocation = useExerciseLibraryStore((s) => s.setFilterLocation);
  const { tree, currentLevel, isLoading } = useSkillTree(programId);
  const [programMeta, setProgramMeta] = useState<Program | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [swapRung, setSwapRung] = useState<SkillTreeRung | null>(null);
  const [representativeOverrides, setRepresentativeOverrides] = useState<Record<number, Exercise>>({});

  useEffect(() => {
    let cancelled = false;
    getProgramByTemplateId(programId).then((p) => {
      if (!cancelled) setProgramMeta(p);
    });
    return () => {
      cancelled = true;
    };
  }, [programId]);

  // Reset session-local overrides when switching to a different program (the
  // 6 Phase-1 screens will share this component once wired — an override for
  // "front lever level 4" must not leak into "planche level 4").
  useEffect(() => {
    setRepresentativeOverrides({});
  }, [programId]);

  // The global exercise-detail sheet must not outlive this screen — reset it
  // on unmount regardless of how the user left (safety net; the primary,
  // provable fix is handleBack below, not this).
  useEffect(() => {
    return () => {
      closeExerciseDetail();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Force the park execution-method for every node image AND for the
  // exercise-detail sheet's video/image when it opens from this screen —
  // ExerciseDetailSheet reads useExerciseLibraryStore's GLOBAL
  // filters.location, which this screen doesn't otherwise touch, so without
  // this it would silently inherit whatever the user last set in the actual
  // library (e.g. 'home'), showing the wrong variant. Restore whatever it
  // was on unmount so a real library visit later isn't left stuck on 'park'.
  useEffect(() => {
    const previous = useExerciseLibraryStore.getState().filters.location;
    setFilterLocation('park');
    return () => {
      setFilterLocation(previous);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The only concrete "back" affordance on this screen: close the sheet
  // first if it's open, only actually navigate once it's already closed.
  // No History API involved — this is plain, provable state logic.
  const handleBack = () => {
    if (isDetailOpen) {
      closeExerciseDetail();
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
    { currentLevel?: number; percent?: number; totalWorkoutsCompleted?: number }
  >;
  const slug = resolveToSlug(programId);
  const trackData = tracks[slug] ?? tracks[programId];

  const drawerData: ProgramDrawerData | null = programMeta
    ? {
        templateId: slug,
        name: skillName,
        description: programMeta.description,
        currentLevel: currentLevel ?? 1,
        maxLevel: programMeta.maxLevels ?? tree?.maxLevel ?? 1,
        percent: Math.min(100, Math.round(trackData?.percent ?? 0)),
        totalWorkoutsCompleted: trackData?.totalWorkoutsCompleted ?? 0,
        iconKey: programMeta.iconKey,
        domainType: domainTypeForSlug(slug),
      }
    : null;

  // Confirmed (not just defaulted): every node image AND the exercise-detail
  // sheet's video/image must resolve the PARK execution-method, never home —
  // see the filters.location effect above for the detail-sheet half of this.
  const location = 'park' as const;

  return (
    <div className="relative min-h-screen" dir="rtl">
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
        {/* Tappable skill name / level-summary block — opens the program-grain
            ProgramDrawer (רמה נוכחית / התקדמות / סה״כ אימונים + עדכן רמה). */}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          disabled={!drawerData}
          className="w-full text-right active:opacity-80 transition-opacity"
        >
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
        </button>
      </header>

      <main className="px-4 py-6 pb-16">
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
            location={location}
            onNodeTap={(rung: SkillTreeRung, state: TreeNodeState) => {
              if (!rung.representative) return;
              openExerciseDetail(rung.representative, state === 'locked' ? LOCKED_NOTICE : null);
            }}
            onSwapTap={(rung) => setSwapRung(rung)}
          />
        )}
      </main>

      {/* Reused verbatim, mounted here since it otherwise only exists inside
          ExerciseLibraryPage — driven entirely by useExerciseLibraryStore. */}
      <ExerciseDetailSheet />

      {drawerData && <ProgramDrawer program={drawerOpen ? drawerData : null} onClose={() => setDrawerOpen(false)} />}

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
