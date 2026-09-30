'use client';

/**
 * DiscoverMoreSection — "גלה עוד" (Progression v2 Phase 4a).
 *
 * Available programs / masters the user hasn't started yet, collapsed by
 * default. Catalog: the SAME existing 6-entry allow-list "המפות שלי"
 * already uses (PROGRESSION_MAP_LEAF_PROGRAMS — reuse, not a new
 * discovery/query pipeline) plus the one flagship master (full_body) —
 * deliberately NOT a full getAllPrograms() sweep, which could surface
 * drafts/deprecated Program docs with no curation; a bigger catalog is a
 * future-phase decision, not built here. Filtered to programs that are
 * NEITHER active NOR tracked (those already show in "התוכניות שלי").
 *
 * Each card's real state (available vs locked_prereq) is genuinely
 * unknown from list membership alone — unlike MyProgramsSection, this is
 * where useProgramCardState's real Phase 1 gating logic is needed. One
 * hook call per card, via the small DiscoverCard wrapper below (a
 * .map() can't call hooks directly).
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';
import { PROGRESSION_MAP_LEAF_PROGRAMS } from '@/lib/progression-map-config';
import { useProgramCardState } from '@/features/progression-map/hooks/useProgramCardState';
import { SkillMapCard } from './SkillMapCard';

/** The one flagship master surfaced here — see file header for why not a wider sweep. */
const DISCOVER_MASTER_CANDIDATES: readonly { programId: string; nameHe: string }[] = [
  { programId: 'full_body', nameHe: 'כל הגוף' },
];

function DiscoverCard({ programId, nameHe }: { programId: string; nameHe: string }) {
  const { state, lockedHint } = useProgramCardState(programId);
  return <SkillMapCard programId={programId} nameHe={nameHe} state={state} lockedHint={lockedHint} />;
}

export function DiscoverMoreSection() {
  const [expanded, setExpanded] = useState(false);
  const profile = useUserStore((s) => s.profile);

  const activePrograms = profile?.progression?.activePrograms ?? [];
  const activeSlugs = new Set(
    activePrograms.map((ap) => (ap?.templateId ? resolveToSlug(ap.templateId) : null)).filter(Boolean),
  );
  const tracksRaw = (profile?.progression?.tracks ?? {}) as Record<string, { currentLevel?: number } | undefined>;
  const trackedSlugs = new Set(
    Object.entries(tracksRaw)
      .filter(([, v]) => (v?.currentLevel ?? 0) > 0)
      .map(([id]) => resolveToSlug(id)),
  );

  const candidates = [...PROGRESSION_MAP_LEAF_PROGRAMS, ...DISCOVER_MASTER_CANDIDATES].filter((p) => {
    const slug = resolveToSlug(p.programId);
    return !activeSlugs.has(slug) && !trackedSlugs.has(slug);
  });

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
