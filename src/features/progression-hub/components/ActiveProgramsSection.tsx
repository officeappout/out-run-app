'use client';

/**
 * ActiveProgramsSection — "פעילות" (Progression v2 Phase 4a-fix).
 *
 * Split out of the original combined MyProgramsSection (which mixed active
 * + tracked into one "התוכניות שלי" section) — the fix brief makes these
 * two mutually-exclusive sections with distinct names/order: "פעילות"
 * (active only) here, "המפות שלי" (tracked only) in
 * TrackedProgramsSection.tsx.
 *
 * Programs the user has genuinely ACTIVATED (profile.progression.
 * activePrograms), in that array's own order (priority — same convention
 * Phase 3 established for the generator), #1 badged "ראשי". State is
 * trivially known from list membership — a program present in
 * activePrograms IS 'active' by Phase 1's own getProgramState definition
 * (it's checked first, before any gate) — so `state="active"` is passed
 * as a static value, no gating call needed. Membership itself comes from
 * the shared, unit-tested bucketProgramsByRealState (program-bucketing.
 * service.ts) — the same source TrackedProgramsSection reads, guaranteeing
 * the two sections stay mutually exclusive by construction.
 */
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';
import { bucketProgramsByRealState } from '@/features/progression-map/services/program-bucketing.service';
import { SkillMapCard } from './SkillMapCard';

export function ActiveProgramsSection() {
  const profile = useUserStore((s) => s.profile);
  const activePrograms = profile?.progression?.activePrograms ?? [];
  const tracksRaw = (profile?.progression?.tracks ?? {}) as Record<string, { currentLevel?: number } | undefined>;
  const { activeTemplateIds } = bucketProgramsByRealState(activePrograms, tracksRaw, resolveToSlug);

  if (activeTemplateIds.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-black text-gray-800">פעילות</h2>
      <div className="space-y-3">
        {activeTemplateIds.map((id, idx) => (
          <SkillMapCard key={id} programId={id} nameHe={id} state="active" badge={idx === 0 ? 'ראשי' : undefined} />
        ))}
      </div>
    </section>
  );
}

export default ActiveProgramsSection;
