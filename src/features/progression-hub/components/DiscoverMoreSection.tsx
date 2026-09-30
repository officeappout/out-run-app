'use client';

/**
 * DiscoverMoreSection — "גלה עוד" (Progression v2 Phase 4a).
 *
 * Available programs / masters the user hasn't started yet — i.e. every
 * program whose real Phase 1 state is available/needs_assessment/
 * locked_prereq, per the brief: "everything else." Collapsed by default,
 * LAST in section order (after "פעילות"/"המפות שלי" — Progression v2
 * Phase 4a-fix reordering). Catalog: the same 6-entry
 * PROGRESSION_MAP_LEAF_PROGRAMS allow-list (reuse, not a new discovery/
 * query pipeline) plus the one flagship master (full_body) — deliberately
 * NOT a full getAllPrograms() sweep, which could surface drafts/deprecated
 * Program docs with no curation; a bigger catalog is a future-phase
 * decision, not built here. Filtered to programs that are NEITHER active
 * NOR tracked (those show in "פעילות"/"המפות שלי" instead, mutually
 * exclusive by construction — the SAME shared bucketProgramsByRealState
 * ActiveProgramsSection.tsx/TrackedProgramsSection.tsx read).
 *
 * Progression v2 Phase 4a-fix (follow-up): דגל אנושי (human flag,
 * EtY8YCol0qpF6DzgcTx1) is explicitly excluded from the catalog — its own
 * level-1 exercise carries no derivable domain tag at all (confirmed by
 * Phase 0's live audit), so its prerequisite can't be resolved the way
 * every other skill's can. Hidden entirely for now, consistent with the
 * earlier decision to leave that program's design for later — excluded
 * from the candidate list itself (not just skipped from rendering) so it
 * can never leak into any bucket.
 *
 * Each card's real state (available/needs_assessment/locked_prereq) is
 * genuinely unknown from list membership alone — unlike Active/
 * TrackedProgramsSection, this is where useProgramCardState's real Phase 1
 * gating logic is needed. One hook call per card, via the small
 * DiscoverCard wrapper below (a .map() can't call hooks directly).
 *
 * Phase 4b round 5: candidates now also include useGatedProgramBuckets'
 * underPopulatedMasterIds — a master with a real `tracks` entry (so it's
 * NOT "available" from getProgramState's own precedence) but fewer than 2
 * genuinely assessed domain children, round 4's ≥2 gate. TrackedProgramsSection
 * stops rendering these; this is where they now surface instead — DiscoverCard's
 * own useProgramCardState call correctly resolves them to not_started_master
 * (the SAME gate, now consulted for real instead of leaving them stranded in
 * neither section). The static DISCOVER_MASTER_CANDIDATES list is unrelated
 * and kept as-is — it covers masters NEVER touched at all (no tracks entry,
 * so they can't appear in underPopulatedMasterIds either); this is a
 * complementary, dynamically-detected case, not a replacement.
 *
 * Progression v2 Phase 4a-fix: a card's primary tap (SkillMapCard's own
 * navigation, unchanged) opens the tree in VIEW mode regardless of state —
 * assessment/prerequisites gate nothing about viewing (see
 * SkillTreeScreen.tsx's own banner for that). The needs_assessment case's
 * "בצע מבדק" hint becomes its own secondary CTA (onAssessTap below),
 * reusing the same startMiniDomainAssessment mini-questionnaire trigger
 * already used elsewhere in the app (ProgramsSection.tsx,
 * WorkoutBuilderSheet.tsx) rather than inventing a new assessment entry
 * point. A real prerequisite lockedHint gets no CTA — nothing to action,
 * just informational (per the brief: gate starting a workout, not viewing,
 * and there's no start-workout action on this card at all). A master
 * (not_started_master state) never gets onAssessTap either — see
 * program-card-state.service.ts's own reasoning (no own questionnaire).
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';
import { domainTypeForSlug } from '@/features/profile/components/widgets/program-groups.utils';
import { startMiniDomainAssessment } from '@/features/user/onboarding/services/mini-domain-assessment';
import { PROGRESSION_MAP_LEAF_PROGRAMS } from '@/lib/progression-map-config';
import { useGatedProgramBuckets } from '@/features/progression-map/hooks/useGatedProgramBuckets';
import { useProgramCardState } from '@/features/progression-map/hooks/useProgramCardState';
import { NEEDS_ASSESSMENT_HINT } from '@/features/progression-map/services/program-card-state.service';
import { SkillMapCard } from './SkillMapCard';

/** דגל אנושי — no derivable prerequisite, hidden for now. See file header. */
const HIDDEN_PROGRAM_IDS: ReadonlySet<string> = new Set(['EtY8YCol0qpF6DzgcTx1']);

/** The one flagship master surfaced here — see file header for why not a wider sweep. */
const DISCOVER_MASTER_CANDIDATES: readonly { programId: string; nameHe: string }[] = [
  { programId: 'full_body', nameHe: 'כל הגוף' },
];

function DiscoverCard({ programId, nameHe }: { programId: string; nameHe: string }) {
  const router = useRouter();
  const { state, lockedHint } = useProgramCardState(programId);
  const isNeedsAssessment = lockedHint === NEEDS_ASSESSMENT_HINT;
  const onAssessTap = isNeedsAssessment
    ? () => startMiniDomainAssessment(router, resolveToSlug(programId), undefined, domainTypeForSlug(resolveToSlug(programId)))
    : undefined;
  return (
    <SkillMapCard
      programId={programId}
      nameHe={nameHe}
      state={state}
      lockedHint={lockedHint}
      onAssessTap={onAssessTap}
    />
  );
}

export function DiscoverMoreSection() {
  const [expanded, setExpanded] = useState(false);
  const { activeTemplateIds, trackedIds, underPopulatedMasterIds } = useGatedProgramBuckets();
  const excludedSlugs = new Set([...activeTemplateIds, ...trackedIds].map(resolveToSlug));

  const staticCandidates = [...PROGRESSION_MAP_LEAF_PROGRAMS, ...DISCOVER_MASTER_CANDIDATES].filter((p) => {
    if (HIDDEN_PROGRAM_IDS.has(p.programId)) return false;
    return !excludedSlugs.has(resolveToSlug(p.programId));
  });

  // Under-populated tracked masters (round 4's ≥2-domain gate) — real
  // "גלה עוד" candidates, not covered by the static catalog above. Skip any
  // already present there (e.g. full_body, if it's ALSO under-populated —
  // the static entry already renders it, no duplicate).
  const staticSlugs = new Set(staticCandidates.map((p) => resolveToSlug(p.programId)));
  const dynamicMasterCandidates = underPopulatedMasterIds
    .filter((id) => !HIDDEN_PROGRAM_IDS.has(id))
    .filter((id) => !staticSlugs.has(resolveToSlug(id)))
    .map((id) => ({ programId: id, nameHe: id }));

  const candidates = [...staticCandidates, ...dynamicMasterCandidates];

  if (candidates.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between"
      >
        <h2 className="text-sm font-black text-gray-800">גלה עוד</h2>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="space-y-3">
          {candidates.map((p) => (
            <DiscoverCard key={p.programId} programId={p.programId} nameHe={p.nameHe} />
          ))}
        </div>
      )}
    </section>
  );
}

export default DiscoverMoreSection;
