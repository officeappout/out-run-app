'use client';

/**
 * ContinueHereCta — "המשך מכאן" (Progression v2 Phase 4a).
 *
 * Single primary CTA that resumes the priority-#1 active program
 * (activePrograms[0] — array order = priority, same convention Phase 3
 * established for the generator). Renders nothing when there's no active
 * program to resume (a brand-new/fully-unassessed user has nothing here).
 *
 * Navigation: the same "existing program view" destination SkillMapCard
 * already uses (leaf -> /progression-map/[id], master -> /profile, since
 * a master has no tree of its own) — kept as one deliberately duplicated
 * one-line ternary rather than a shared import, matching this codebase's
 * own convention for tiny, cheap-to-duplicate logic (see
 * SkillMapCard.tsx's identical line for the non-duplicated original).
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { getProgramByTemplateId } from '@/features/content/programs/core/program.service';
import { getProgramIcon, BRAND_CYAN } from '@/features/content/programs';
import type { Program } from '@/features/content/programs/core/program.types';
import { isProgressionMapLeafProgram } from '@/lib/progression-map-config';

export function ContinueHereCta() {
  const router = useRouter();
  const profile = useUserStore((s) => s.profile);
  const primary = profile?.progression?.activePrograms?.[0];
  const [programMeta, setProgramMeta] = useState<Program | null>(null);

  useEffect(() => {
    if (!primary?.templateId) return;
    let cancelled = false;
    getProgramByTemplateId(primary.templateId).then((p) => {
      if (!cancelled) setProgramMeta(p);
    });
    return () => {
      cancelled = true;
    };
  }, [primary?.templateId]);

  if (!primary?.templateId) {
    return null;
  }

  const destination = isProgressionMapLeafProgram(primary.templateId)
    ? `/progression-map/${primary.templateId}`
    : '/profile';
  const displayName = programMeta?.name ?? primary.name ?? primary.templateId;

  return (
    <button
      type="button"
      onClick={() => router.push(destination)}
      className="w-full flex items-center justify-between rounded-2xl px-4 py-3.5 active:opacity-90 transition-opacity"
      style={{ background: `linear-gradient(to left, ${BRAND_CYAN}, #5BC2F2)` }}
      dir="rtl"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-white flex-shrink-0">{getProgramIcon(programMeta?.iconKey, 'w-5 h-5')}</span>
        <div className="text-right min-w-0">
          <p className="text-[11px] font-bold text-white/80 leading-none">המשך מכאן</p>
          <p className="text-sm font-black text-white leading-snug truncate mt-0.5">{displayName}</p>
        </div>
      </div>
      <ArrowLeft className="w-5 h-5 text-white flex-shrink-0" />
    </button>
  );
}

export default ContinueHereCta;
