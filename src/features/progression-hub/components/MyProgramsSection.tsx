'use client';

/**
 * MyProgramsSection — "התוכניות שלי" (Progression v2 Phase 4a).
 *
 * The active set, in activePrograms' own array order (priority — same
 * convention Phase 3 established for the generator), #1 marked "ראשי",
 * followed by tracked-but-not-active maps below. State is trivially known
 * from section membership (no gating call needed — a program present in
 * activePrograms IS 'active' by Phase 1's own getProgramState definition;
 * a tracked one IS 'tracked') — SkillMapCard's `state` prop is passed a
 * static value directly, not derived via useProgramCardState (that hook is
 * reserved for "גלה עוד", where a program's state genuinely isn't known
 * from list membership alone).
 *
 * Card taps: SkillMapCard's own existing navigation (unchanged).
 */
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';
import { SkillMapCard } from './SkillMapCard';

export function MyProgramsSection() {
  const profile = useUserStore((s) => s.profile);
  const activePrograms = profile?.progression?.activePrograms ?? [];
  const activeSlugs = new Set(
    activePrograms.map((ap) => (ap?.templateId ? resolveToSlug(ap.templateId) : null)).filter(Boolean),
  );

  const tracksRaw = (profile?.progression?.tracks ?? {}) as Record<string, { currentLevel?: number } | undefined>;
  const trackedIds = Object.entries(tracksRaw)
    .filter(([id, v]) => (v?.currentLevel ?? 0) > 0 && !activeSlugs.has(resolveToSlug(id)))
    .map(([id]) => id);

  if (activePrograms.length === 0 && trackedIds.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-black text-gray-800">התוכניות שלי</h2>
      <div className="space-y-3">
        {activePrograms
          .filter((ap): ap is typeof ap & { templateId: string } => !!ap?.templateId)
          .map((ap, idx) => (
            <SkillMapCard
              key={ap.templateId}
              programId={ap.templateId}
              nameHe={ap.name || ap.templateId}
              state="active"
              badge={idx === 0 ? 'ראשי' : undefined}
            />
          ))}
        {trackedIds.map((id) => (
          <SkillMapCard key={id} programId={id} nameHe={id} state="tracked" />
        ))}
      </div>
    </section>
  );
}

export default MyProgramsSection;
