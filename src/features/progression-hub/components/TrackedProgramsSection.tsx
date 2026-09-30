'use client';

/**
 * TrackedProgramsSection — "המפות שלי" (Progression v2 Phase 4a-fix).
 *
 * This is the REAL-STATE-DRIVEN replacement for the section that used to
 * live at this name — the original ProgressionScreen.tsx rendered a
 * hardcoded, unconditional 4-program allow-list here (PROGRESSION_MAP_HUB_
 * PROGRAMS) regardless of the signed-in user, which duplicated whatever
 * DiscoverMoreSection ALSO correctly showed for those same programs (the
 * exact bug this fix round reported). That hardcoded rendering is removed
 * entirely — "המפות שלי" now means "programs the user is actually
 * tracking" (a real progression.tracks entry, i.e. genuinely assessed at
 * some point) and nothing else.
 *
 * Split out of the original combined MyProgramsSection — see
 * ActiveProgramsSection.tsx's header comment for the "why split" reasoning.
 * Membership comes from the SAME shared, unit-tested bucketProgramsByRealState
 * (program-bucketing.service.ts) ActiveProgramsSection reads — active
 * always excluded first, guaranteeing the two sections stay mutually
 * exclusive by construction (the reported bug's root cause was a
 * completely separate, hardcoded section with no such guarantee at all).
 * State is trivially 'tracked' by list membership here too — no gating
 * call needed.
 */
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';
import { bucketProgramsByRealState } from '@/features/progression-map/services/program-bucketing.service';
import { SkillMapCard } from './SkillMapCard';

export function TrackedProgramsSection() {
  const profile = useUserStore((s) => s.profile);
  const activePrograms = profile?.progression?.activePrograms ?? [];
  const tracksRaw = (profile?.progression?.tracks ?? {}) as Record<string, { currentLevel?: number } | undefined>;
  const { trackedIds } = bucketProgramsByRealState(activePrograms, tracksRaw, resolveToSlug);

  if (trackedIds.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-black text-gray-800">המפות שלי</h2>
      <div className="space-y-3">
        {trackedIds.map((id) => (
          <SkillMapCard key={id} programId={id} nameHe={id} state="tracked" />
        ))}
      </div>
    </section>
  );
}

export default TrackedProgramsSection;
