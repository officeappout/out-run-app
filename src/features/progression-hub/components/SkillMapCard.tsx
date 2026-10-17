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
import { getProgramByTemplateId, MASTER_PROGRAM_ID_TO_SLUG } from '@/features/content/programs/core/program.service';
import type { Program } from '@/features/content/programs/core/program.types';
import { ProgramProgressCard, type ProgramCardVisualState } from '@/features/home/components/widgets/ProgramProgressCard';
import { resolveProgramLabel } from '@/features/content/programs';
import { resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';
import { useUserProgramLevel } from '@/features/progression-map/hooks/useUserProgramLevel';
import { useSkillTree } from '@/features/progression-map/hooks/useSkillTree';
import { resolveProgressionMapDestination } from '@/lib/progression-map-config';
import ParentProgramSheet from '@/features/profile/components/widgets/ParentProgramSheet';

/**
 * Phase 4b round 5 fix: the displayed name used to fall back to the raw
 * `nameHe` prop (= the raw programId, per every META section without a
 * real name to pass — ActiveProgramsSection/TrackedProgramsSection both do
 * nameHe={id}) while getProgramByTemplateId's fetch was still in flight.
 * Confirmed by recon (not guessed): that fetch is genuinely slow for
 * master/skill slugs like 'upper_body'/'front_lever' — several real
 * network round-trips, including one full unfiltered collection scan,
 * before it resolves — long enough that the raw slug/id was visible, and
 * separately reported as looking like an English-before-Hebrew flash even
 * though no i18n default is actually wrong (a parallel recon confirmed the
 * app's language system already defaults to Hebrew everywhere). Now
 * resolved SYNCHRONOUSLY first via resolveProgramLabel's existing
 * ICON_MAP/SLUG_HEBREW_FALLBACK cascade (program-icon.util.tsx — the same
 * pattern WorkoutBuilderSheet/AddWorkoutModal already reuse), only
 * overridden once the live fetch resolves. `nameHe` still wins first when
 * it's a REAL caller-supplied name (DiscoverMoreSection's curated catalog)
 * — only ignored when a caller had nothing better than the raw id to offer.
 */
export interface SkillMapCardProps {
  programId: string;
  /** Config's Hebrew name — shown instantly, before/in case the Program doc fetch resolves a different one. */
  nameHe: string;
  /**
   * Progression v2 Phase 4a — all optional, all additive. Omitting them
   * reproduces today's exact behavior unchanged.
   */
  state?: ProgramCardVisualState;
  lockedHint?: string;
  badge?: string;
  /** Progression v2 Phase 4a-fix — see ProgramProgressCardProps.onLockedHintTap. */
  onAssessTap?: () => void;
}

export function SkillMapCard({ programId, nameHe, state, lockedHint, badge, onAssessTap }: SkillMapCardProps) {
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

  // See the file header's Phase 4b round 5 note — synchronous fallback
  // before/in case the live fetch resolves, instead of the raw id/slug.
  const slug = MASTER_PROGRAM_ID_TO_SLUG[programId] ?? resolveToSlug(programId);
  const fallbackName = nameHe !== programId ? nameHe : resolveProgramLabel(slug);
  const displayName = programMeta?.name ?? fallbackName;

  // A leaf opens its own map. A parent program has no map of its own, so it
  // opens ParentProgramSheet (its children + their average) — it used to
  // fall back to '/profile', bouncing the user away from this tab. Shared
  // with ProgramsSection via resolveProgressionMapDestination (handles both
  // the raw-id and slug forms of programId).
  const destination = resolveProgressionMapDestination(programId);
  const [parentSheetOpen, setParentSheetOpen] = useState(false);
  const onTap = () => {
    if (destination) router.push(destination);
    else setParentSheetOpen(true);
  };

  // div role="button" (not a real <button>) so ProgramProgressCard can host
  // its own REAL nested <button> for the "בצע מבדק" secondary CTA
  // (onAssessTap) without invalid nested-<button> HTML — same established
  // pattern ProgramProgressCard's own inner clickable header already uses
  // for the identical reason (see that file's header comment).
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onTap}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onTap(); }}
      className="w-full text-right active:opacity-80 transition-opacity cursor-pointer"
    >
      <ProgramProgressCard
        programName={displayName}
        iconKey={programMeta?.iconKey}
        currentLevel={displayLevel}
        maxLevel={maxLevel}
        progressPercent={percent}
        state={state}
        lockedHint={lockedHint}
        onLockedHintTap={onAssessTap}
        badge={badge}
        className="pointer-events-none"
      />
      {!destination && (
        // stopPropagation: taps inside the portalled sheet still bubble
        // through the React tree to this card's onClick.
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <ParentProgramSheet parentId={parentSheetOpen ? programId : null} onClose={() => setParentSheetOpen(false)} />
        </div>
      )}
    </div>
  );
}
