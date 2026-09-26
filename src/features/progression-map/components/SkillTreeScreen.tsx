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
 * Back-navigation: the exercise-detail sheet is global UI state
 * (useExerciseLibraryStore), so leaving this screen by ANY means (browser
 * back, in-app nav, this screen's own back button) must reset it — otherwise
 * a later mount of ExerciseDetailSheet elsewhere (e.g. the library) could
 * reopen showing a stale exercise from this screen's last tap. A popstate
 * listener also makes the hardware/gesture back button close the open sheet
 * first (one extra history entry pushed only while it's open) instead of
 * leaving the whole route.
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
  // on unmount regardless of how the user left (back button, in-app nav).
  useEffect(() => {
    return () => {
      closeExerciseDetail();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While the sheet is open, one hardware/gesture "back" closes it (via the
  // history entry we push here) instead of leaving the Tree route entirely.
  useEffect(() => {
    if (!isDetailOpen) return;
    window.history.pushState({ progressionMapDetailSheet: true }, '');
    const onPopState = () => closeExerciseDetail();
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isDetailOpen, closeExerciseDetail]);

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

  // NOTE (flagged, not silently assumed): location is not carried through from
  // anywhere yet — this screen has no concept of "the user's current location
  // context" today. Defaulting to 'park' per the founder's confirmed
  // "park-everywhere" direction.
  const location = 'park' as const;

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg, #F3FCFB 0%, #EEF7FF 100%)' }} dir="rtl">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-gray-100 px-4 py-3">
        <button
          type="button"
          onClick={() => router.back()}
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
