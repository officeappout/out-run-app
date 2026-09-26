'use client';

/**
 * SkillTreeScreen — Phase 1's top-level screen for one leaf program's Skill Tree.
 *
 * Two separate taps, two separate existing surfaces (per the founder's
 * correction — split from an earlier version of this screen that opened the
 * program-grain drawer from a node tap):
 *   - Node tap → the existing per-EXERCISE ExerciseDetailSheet (same one the
 *     library uses), for that node's representative exercise specifically.
 *     ExerciseDetailSheet is only ever mounted inside ExerciseLibraryPage
 *     today — not globally — so this screen mounts its own instance,
 *     matching that same pattern, and drives it via the same
 *     useExerciseLibraryStore.openDetail() action.
 *   - Header tap (skill name / level-summary block) → the existing
 *     per-PROGRAM ProgramDrawer (src/features/profile/components/widgets/
 *     ProgramDrawer.tsx, unmodified — icon/name/description + רמה נוכחית /
 *     התקדמות / סה״כ אימונים + עדכן רמה / סגור), reached today from the
 *     profile page's program tiles. Program-grain, so it belongs on the
 *     program-level header, not repeated identically on every node.
 *
 * No "התחל אימון" CTA anywhere — dropped per the founder's decision (it was
 * never a real requirement). No level-description banner — dropped for v1
 * (ProgramLevelSettings.levelDescription's read path was never verified this
 * pass, and there's no admin input for it yet either).
 *
 * Cross-domain imports (workout-engine/services, profile/components/widgets,
 * content/exercises) are accepted as-is per the founder — noted as tech debt
 * for a later relocation to src/lib/, not refactored mid-feature.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
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

export interface SkillTreeScreenProps {
  programId: string;
}

export function SkillTreeScreen({ programId }: SkillTreeScreenProps) {
  const router = useRouter();
  const profile = useUserStore((s) => s.profile);
  const openExerciseDetail = useExerciseLibraryStore((s) => s.openDetail);
  const { tree, currentLevel, isLoading } = useSkillTree(programId);
  const [programMeta, setProgramMeta] = useState<Program | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [swapRung, setSwapRung] = useState<SkillTreeRung | null>(null);

  useEffect(() => {
    let cancelled = false;
    getProgramByTemplateId(programId).then((p) => {
      if (!cancelled) setProgramMeta(p);
    });
    return () => {
      cancelled = true;
    };
  }, [programId]);

  const skillName = programMeta?.name ?? '';
  const targetName = tree?.rungs.find((r) => r.level === tree.maxLevel)?.representative
    ? getLocalizedText(tree.rungs.find((r) => r.level === tree.maxLevel)!.representative!.name, 'he')
    : '';

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
  // context" today (unlike the workout-preview drawer, which inherits it from
  // an active session). Defaulting to 'park' per the founder's own
  // "park-everywhere" framing when discussing the swap query's gear filter —
  // worth confirming this default explicitly, not assumed correct long-term.
  const location = 'park' as const;

  return (
    <div className="min-h-screen bg-white" dir="rtl">
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3">
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

      <main className="px-4 pb-16">
        {isLoading && (
          <div className="flex flex-col items-center gap-3 py-20">
            {[1, 2, 3].map((i) => (
              <div key={i} className="w-20 h-20 rounded-2xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && !tree && (
          <p className="text-sm text-gray-400 text-center py-20">
            לא נמצאו תרגילים למסלול הזה כרגע.
          </p>
        )}

        {!isLoading && tree && (
          <TreePath
            tree={tree}
            currentLevel={currentLevel}
            location={location}
            onNodeTap={(rung) => {
              if (rung.representative) openExerciseDetail(rung.representative);
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
        />
      )}
    </div>
  );
}
