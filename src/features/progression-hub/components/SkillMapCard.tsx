'use client';

/**
 * SkillMapCard — one "המפות שלי" grid tile.
 *
 * Reuses the SAME card the Home dashboard and Profile's "התוכניות שלי"
 * section already use (ProgramProgressCard) — no new card UI. This
 * component only adds the navigation wrapper (tap → that program's Skill
 * Tree) and fetches the small bits ProgramProgressCard needs that live on
 * the Program doc (name, icon), the same way SkillTreeScreen.tsx fetches
 * its own single program's meta.
 *
 * Round 10 fix: maxLevel now comes from useSkillTree's `tree.maxLevel` —
 * the SAME source the Tree screen's own header ("רמה X מתוך Y") uses —
 * not Program.maxLevels (a separate, manually-set CMS field that was
 * showing "15" for every one of these skills regardless of its real
 * ladder length; the Tree header never reads that field at all for this
 * text, only the actual exercise-derived tree does). currentLevel/percent
 * still come from useUserProgramLevel (useSkillTree calls it internally
 * too, for currentLevel — calling it again here just for `percent` is a
 * small, accepted duplication, not a bug).
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getProgramByTemplateId } from '@/features/content/programs/core/program.service';
import type { Program } from '@/features/content/programs/core/program.types';
import { ProgramProgressCard } from '@/features/home/components/widgets/ProgramProgressCard';
import { useUserProgramLevel } from '@/features/progression-map/hooks/useUserProgramLevel';
import { useSkillTree } from '@/features/progression-map/hooks/useSkillTree';

export interface SkillMapCardProps {
  programId: string;
  /** Config's Hebrew name — shown instantly, before/in case the Program doc fetch resolves a different one. */
  nameHe: string;
}

export function SkillMapCard({ programId, nameHe }: SkillMapCardProps) {
  const router = useRouter();
  const [programMeta, setProgramMeta] = useState<Program | null>(null);
  const { percent } = useUserProgramLevel(programId);
  const { tree, currentLevel } = useSkillTree(programId);

  useEffect(() => {
    let cancelled = false;
    getProgramByTemplateId(programId).then((p) => {
      if (!cancelled) setProgramMeta(p);
    });
    return () => {
      cancelled = true;
    };
  }, [programId]);

  const maxLevel = tree?.maxLevel ?? programMeta?.maxLevels ?? 1;
  const displayLevel = currentLevel ?? tree?.minLevel ?? 1;

  return (
    <button
      type="button"
      onClick={() => router.push(`/progression-map/${programId}`)}
      className="w-full text-right active:opacity-80 transition-opacity"
    >
      <ProgramProgressCard
        programName={programMeta?.name ?? nameHe}
        iconKey={programMeta?.iconKey}
        currentLevel={displayLevel}
        maxLevel={maxLevel}
        progressPercent={percent}
        className="pointer-events-none"
      />
    </button>
  );
}
