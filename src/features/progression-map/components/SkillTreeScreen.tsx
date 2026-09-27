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
 * Sheet-close, definitive fix (rounds 1-4 tried: popstate+pushState, a
 * button-only isDetailOpen check, removing a global-store mutation that
 * caused unrelated churn, then a repaired popstate+orphaned-entry-cleanup
 * version — none of it fully closed the loop). Round 4's trace logging
 * gave the actual answer: every observed close went through the sheet's
 * OWN internal dismissal (drag/X/backdrop) — never through the pushed-
 * history/popstate path. The real exit routes are this screen's own חזרה
 * link and the app's bottom nav (מפה / בית), and NEITHER of those triggers
 * closeDetail() at all — they just navigate, leaving the globally-portalled
 * sheet rendered on top of whatever loads next.
 *
 * Fix: usePathname() from next/navigation is reactive to EVERY navigation
 * method (Link clicks, router.push, router.back, browser back/forward —
 * unlike popstate, which only fires for true back/forward). One effect
 * keyed on [pathname] calls closeDetail() whenever the path changes away
 * from what it was when the sheet's owner last rendered — covering חזרה,
 * bottom-nav, and browser back uniformly, with no History API of its own.
 * The old push-history/pop-orphaned-entry mechanism is removed entirely as
 * redundant (browser back/forward changes the pathname too, so the new
 * effect already covers it). The plain unmount-cleanup stays as a second,
 * independent safety net for the ordinary case where this screen fully
 * unmounts. Trace logging (temporary, unconditional — a Vercel preview
 * build sets NODE_ENV=production, which would silently suppress a
 * dev-gated log) stays at the store's open/close actions plus this
 * effect, so the next test either confirms the fix or shows precisely
 * what's still missing.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
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
  const pathname = usePathname();
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
  // on unmount regardless of how the user left (safety net; the primary,
  // provable fix is handleBack below, not this).
  useEffect(() => {
    return () => {
      closeExerciseDetail();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // THE fix (round 5, confirmed by trace): every real exit from this screen
  // — חזרה, bottom nav (מפה/בית), or browser back — is a pathname change.
  // usePathname() is reactive to all of them uniformly (unlike popstate,
  // which only fires for true back/forward, never for a Link/router.push
  // navigating forward to a new route — the bottom-nav case). Skip the
  // very first render (nothing to close yet, and closing an
  // already-closed sheet is harmless anyway, but this keeps the log clean).
  const initialPathname = useRef(pathname);
  useEffect(() => {
    if (pathname === initialPathname.current) return;
    // eslint-disable-next-line no-console
    console.log('[SkillTreeScreen] pathname changed', { from: initialPathname.current, to: pathname, closingSheet: true });
    closeExerciseDetail();
  }, [pathname, closeExerciseDetail]);

  // This screen's own חזרה link: close the sheet first if open, so a tap
  // just dismisses it without an unnecessary route change; the pathname
  // effect above is what actually GUARANTEES the sheet closes on any exit,
  // this is just the nicer behavior for the one exit this component owns.
  const handleBack = () => {
    // eslint-disable-next-line no-console
    console.log('[SkillTreeScreen] handleBack tapped, isDetailOpen=', isDetailOpen);
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
            onNodeTap={(rung: SkillTreeRung, state: TreeNodeState) => {
              if (!rung.representative) return;
              openExerciseDetail(rung.representative, state === 'locked' ? LOCKED_NOTICE : null);
            }}
            onSwapTap={(rung) => setSwapRung(rung)}
          />
        )}
      </main>

      {/* Mounted here since it otherwise only exists inside ExerciseLibraryPage
          — driven by useExerciseLibraryStore. locationOverride="park" is a
          LOCAL prop, not a write to the shared global filter (round 3 —
          see the header comment for why the global-mutation version was
          removed rather than patched). */}
      <ExerciseDetailSheet locationOverride="park" />

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
