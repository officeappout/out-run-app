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
 *
 * Progression v2 Phase 4a-fix (follow-up): when there's nothing tracked
 * (the common brand-new-user case), this section is no longer blank —
 * it renders the EXISTING home-screen onboarding card (AddStrengthProgramCard,
 * "תוכנית כוח · אימון מותאם אישית למטרות שלך") as its empty state, reused
 * as-is (not rebuilt) — it already routes to the general onboarding
 * questionnaire via resolveOnboardingEntryHref. The section keeps its own
 * "המפות שלי" heading either way, so the user always knows which section
 * they're looking at.
 *
 * Phase 4b round 5: membership now comes from useGatedProgramBuckets
 * instead of bucketProgramsByRealState directly — a tracked MASTER with
 * fewer than 2 real assessed domain children (the ≥2 gate from round 4) is
 * excluded here and picked up by DiscoverMoreSection instead. Round 4's
 * gate only changed the CARD's visual state elsewhere (useProgramCardState
 * was never called here — this section always passed a static
 * state="tracked") — it never touched which SECTION the card rendered in,
 * so an under-populated master kept showing under "המפות שלי" regardless.
 * See useGatedProgramBuckets.ts for the full reasoning.
 *
 * Phase 4b round 6 fix: the AddStrengthProgramCard onboarding empty-state
 * used to show whenever trackedIds was empty — even for a user who already
 * has an ACTIVE program (e.g. משיכה, sitting in "פעילות") but nothing
 * tracked yet. Not actually a brand-new user, so the onboarding prompt was
 * wrong for them. Now gated on BOTH buckets being empty — the user has
 * NEITHER an active NOR a tracked program anywhere. For the in-between
 * case (active-only, nothing tracked) the section renders nothing at all
 * — same "nothing to show -> null" convention ActiveProgramsSection
 * already uses — rather than a bare heading with no content below it,
 * which the original "keep the heading either way" reasoning above was
 * never meant to cover (that was specifically for the brand-new-user +
 * onboarding-CTA case).
 */
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useGatedProgramBuckets } from '@/features/progression-map/hooks/useGatedProgramBuckets';
import AddStrengthProgramCard from '@/features/home/components/AddStrengthProgramCard';
import { SkillMapCard } from './SkillMapCard';

export function TrackedProgramsSection() {
  const profile = useUserStore((s) => s.profile);
  const { activeTemplateIds, trackedIds } = useGatedProgramBuckets();

  if (trackedIds.length === 0 && activeTemplateIds.length > 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-black text-gray-800">המפות שלי</h2>
      {trackedIds.length === 0 ? (
        <AddStrengthProgramCard profile={profile} />
      ) : (
        <div className="space-y-3">
          {trackedIds.map((id) => (
            <SkillMapCard key={id} programId={id} nameHe={id} state="tracked" />
          ))}
        </div>
      )}
    </section>
  );
}

export default TrackedProgramsSection;
