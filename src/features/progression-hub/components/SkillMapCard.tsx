'use client';

/**
 * SkillMapCard — one "המפות שלי" grid tile.
 *
 * Reuses the SAME card the Home dashboard and Profile's "התוכניות שלי"
 * section already use (ProgramProgressCard) — no new card UI. This
 * component only adds the navigation wrapper (tap → that program's Skill
 * Tree) and fetches the small bits ProgramProgressCard needs that live on
 * the Program doc (icon, maxLevels), the same way SkillTreeScreen.tsx
 * fetches its own single program's meta.
 *
 * currentLevel/percent come from useUserProgramLevel — the same hook the
 * Tree screen's own header uses for "רמה X מתוך Y" — called once per card
 * instance (one hook call per mounted component), never inside a loop in
 * the parent grid.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getProgramByTemplateId } from '@/features/content/programs/core/program.service';
import type { Program } from '@/features/content/programs/core/program.types';
import { ProgramProgressCard } from '@/features/home/components/widgets/ProgramProgressCard';
import { useUserProgramLevel } from '@/features/progression-map/hooks/useUserProgramLevel';

// Same fallback ProgramsSection.tsx's buildCardData uses when a Program doc
// has no maxLevels set — not invented here, matching established precedent.
const FALLBACK_MAX_LEVEL = 25;

export interface SkillMapCardProps {
  programId: string;
  /** Config's Hebrew name — shown instantly, before/in case the Program doc fetch resolves a different one. */
  nameHe: string;
}

export function SkillMapCard({ programId, nameHe }: SkillMapCardProps) {
  const router = useRouter();
  const [programMeta, setProgramMeta] = useState<Program | null>(null);
  const { currentLevel, percent } = useUserProgramLevel(programId);

  useEffect(() => {
    let cancelled = false;
    getProgramByTemplateId(programId).then((p) => {
      if (!cancelled) setProgramMeta(p);
    });
    return () => {
      cancelled = true;
    };
  }, [programId]);

  return (
    <button
      type="button"
      onClick={() => router.push(`/progression-map/${programId}`)}
      className="w-full text-right active:opacity-80 transition-opacity"
    >
      <ProgramProgressCard
        programName={programMeta?.name ?? nameHe}
        iconKey={programMeta?.iconKey}
        currentLevel={currentLevel ?? 1}
        maxLevel={programMeta?.maxLevels ?? FALLBACK_MAX_LEVEL}
        progressPercent={percent}
        className="pointer-events-none"
      />
    </button>
  );
}
