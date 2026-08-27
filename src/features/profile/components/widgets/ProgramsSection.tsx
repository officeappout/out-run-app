'use client';

/**
 * ProgramsSection — profile Block 5.
 *
 * Shows up to three groups:
 *   1. "תוכנית פעילה"    — the master program card for activePrograms[0]
 *                          (same ProgramProgressCard as Home)
 *   2. "תוכניות בנות"    — one card per child slug from MASTER_PROGRAM_CHILDREN,
 *                          derived from activePrograms[0] — unchanged from before
 *                          multi-program support was added.
 *   3. "תוכניות נוספות"  — one card per OTHER entry in activePrograms
 *                          (index 1+): genuinely independent programs the
 *                          user is active in that are NOT a parent/child of
 *                          entry 0 (e.g. activePrograms = [push, planche] —
 *                          planche isn't a "child" of push, it's its own
 *                          active program). Previously these were silently
 *                          invisible — only activePrograms[0] was ever read.
 *
 * Tapping any card opens ProgramDrawer with per-program metadata + stats.
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { getProgramByTemplateId } from '@/features/content/programs/core/program.service';
import {
  useProgramProgress,
  MASTER_PROGRAM_CHILDREN,
  MASTER_LEVEL_CAP,
} from '@/features/home/hooks/useProgramProgress';
import { ProgramProgressCard } from '@/features/home/components/widgets/ProgramProgressCard';
import { PROGRAM_NAME_HE } from '@/lib/utils/program-names';
import ProgramDrawer, { type ProgramDrawerData } from './ProgramDrawer';
import type { Program } from '@/features/content/programs/core/program.types';
import { startMiniDomainAssessment, type MiniAssessmentDomainType } from '@/features/user/onboarding/services/mini-domain-assessment';
import { isDomainAssessed, resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';
import { resolveAdditionalProgramSlugs, domainTypeForSlug, resolveMasterAssessDomainType } from './program-groups.utils';
import { resolveOnboardingEntryHref } from '@/features/user/onboarding/utils/onboarding-entry';

// ── Types ──────────────────────────────────────────────────────────

interface ChildCardData {
  slug: string;
  name: string;
  currentLevel: number;
  maxLevel: number;
  percent: number;
  totalWorkoutsCompleted: number;
  description?: string;
  iconKey?: string;
  /**
   * True when the user has an actual assessed level (> 0) for this domain.
   * The engine's own `?? 1` default (level-resolution.utils.ts / home-workout.service.ts)
   * is untouched — this flag is purely a UI-level cue so an unassessed child
   * program shows an explicit "not yet assessed" card + CTA instead of a
   * silently-fabricated "Level 1" card.
   */
  isAssessed: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────

/** Resolve a program template and pull out display fields. */
async function fetchProgramMeta(templateId: string): Promise<Program | null> {
  try {
    return await getProgramByTemplateId(templateId);
  } catch {
    return null;
  }
}

// ── Component ──────────────────────────────────────────────────────

export default function ProgramsSection() {
  const router = useRouter();
  const profile = useUserStore((s) => s.profile);
  const progressData = useProgramProgress();

  const tracks = (profile?.progression?.tracks ?? {}) as Record<
    string,
    { currentLevel?: number; percent?: number; totalWorkoutsCompleted?: number; maxLevel?: number }
  >;

  // Resolved metadata for child programs (description, iconKey, maxLevels)
  const [childMeta, setChildMeta] = useState<Record<string, Program>>({});
  const [masterMeta, setMasterMeta] = useState<Program | null>(null);
  // Resolved metadata for additional (index 1+) independent active programs
  const [additionalMeta, setAdditionalMeta] = useState<Record<string, Program>>({});

  // Drawer state
  const [drawerProgram, setDrawerProgram] = useState<ProgramDrawerData | null>(null);
  const closeDrawer = useCallback(() => setDrawerProgram(null), []);

  // Resolve the master program templateId
  const masterTemplateId =
    profile?.progression?.activePrograms?.[0]?.templateId ?? null;
  // masterTemplateId is the raw Firestore doc ID — needed as-is for
  // fetchProgramMeta below (a real Firestore lookup). MASTER_PROGRAM_CHILDREN
  // and tracks are keyed by slug — resolve separately for those lookups.
  const masterSlug = masterTemplateId ? resolveToSlug(masterTemplateId) : null;

  // Derived children for this master
  const childSlugs: readonly string[] = masterSlug
    ? (MASTER_PROGRAM_CHILDREN[masterSlug] ?? [])
    : [];

  // ── Additional independent active programs (index 1+) ────────────────
  // Genuinely separate programs the user is active in — NOT a parent/child
  // of activePrograms[0]. Resolved the same raw-id-vs-slug way as the
  // master (templateId kept raw for fetchProgramMeta; slug used for
  // MASTER_PROGRAM_CHILDREN/tracks lookups only).
  const additionalSlugs: string[] = resolveAdditionalProgramSlugs(
    profile?.progression?.activePrograms,
    resolveToSlug,
  );

  // Fetch master metadata once
  useEffect(() => {
    if (!masterTemplateId) return;
    let cancelled = false;
    fetchProgramMeta(masterTemplateId).then((meta) => {
      if (!cancelled && meta) setMasterMeta(meta);
    });
    return () => { cancelled = true; };
  }, [masterTemplateId]);

  // Fetch child program metadata for description / iconKey / maxLevels
  useEffect(() => {
    if (childSlugs.length === 0) return;
    let cancelled = false;
    Promise.all(
      childSlugs.map(async (slug) => {
        const meta = await fetchProgramMeta(slug);
        return { slug, meta };
      }),
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, Program> = {};
      for (const { slug, meta } of results) {
        if (meta) map[slug] = meta;
      }
      setChildMeta(map);
    });
    return () => { cancelled = true; };
  }, [childSlugs.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch metadata for additional (index 1+) independent active programs
  useEffect(() => {
    if (additionalSlugs.length === 0) return;
    let cancelled = false;
    Promise.all(
      additionalSlugs.map(async (slug) => {
        const meta = await fetchProgramMeta(slug);
        return { slug, meta };
      }),
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, Program> = {};
      for (const { slug, meta } of results) {
        if (meta) map[slug] = meta;
      }
      setAdditionalMeta(map);
    });
    return () => { cancelled = true; };
  }, [additionalSlugs.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Master-derived level / percent for the master card ─────────
  // useProgramProgress already derives this correctly and returns 0-100.
  // Cap at 100 defensively in case child floats average above 1.
  const masterLevel = progressData?.currentLevel ?? 1;
  const masterPercent = Math.min(100, progressData?.progressPercent ?? 0);
  const masterMaxLevel = progressData?.maxLevel ?? MASTER_LEVEL_CAP;
  const masterName = progressData?.programName ?? (masterTemplateId ? PROGRAM_NAME_HE[masterTemplateId] ?? masterTemplateId : 'תוכנית אימון');
  const masterIconKey = progressData?.iconKey;

  // ── Open drawer for the master program ─────────────────────────
  // templateId here is the resolved slug (not the raw masterTemplateId used
  // for fetchProgramMeta above) — ProgramDrawer passes it straight into
  // startMiniDomainAssessment, which expects a category/skill slug. Safe:
  // ProgramDrawer is this component's only caller and only reads
  // `.templateId` for its own icon-fallback display.
  const openMasterDrawer = useCallback(() => {
    if (!masterTemplateId) return;
    setDrawerProgram({
      templateId: masterSlug ?? masterTemplateId,
      name: masterName,
      description: masterMeta?.description,
      currentLevel: masterLevel,
      maxLevel: masterMaxLevel,
      percent: masterPercent,
      totalWorkoutsCompleted: (masterSlug ? tracks[masterSlug] : undefined)?.totalWorkoutsCompleted ?? 0,
      iconKey: masterIconKey ?? masterMeta?.iconKey,
      domainType: resolveMasterAssessDomainType(childSlugs.length, masterSlug),
    });
  }, [masterTemplateId, masterSlug, masterName, masterMeta, masterLevel, masterMaxLevel, masterPercent, masterIconKey, tracks, childSlugs.length]);

  // ── Open drawer for a non-master program (child OR additional) ──
  const openProgramDrawer = useCallback(
    (slug: string, card: ChildCardData, domainType: MiniAssessmentDomainType) => {
      setDrawerProgram({
        templateId: slug,
        name: card.name,
        description: card.description,
        currentLevel: card.currentLevel,
        maxLevel: card.maxLevel,
        percent: card.percent,
        totalWorkoutsCompleted: card.totalWorkoutsCompleted,
        iconKey: card.iconKey,
        domainType,
      });
    },
    [],
  );

  // ── Build card data for a given slug (shared by children + additional programs) ──
  const buildCardData = (slug: string, meta: Program | undefined): ChildCardData => {
    const track = tracks[slug];
    const pct = Math.min(100, Math.round(track?.percent ?? 0));
    return {
      slug,
      name: meta?.name ?? PROGRAM_NAME_HE[slug] ?? slug,
      currentLevel: track?.currentLevel ?? 1,
      maxLevel: meta?.maxLevels ?? track?.maxLevel ?? 25,
      percent: pct,
      totalWorkoutsCompleted: track?.totalWorkoutsCompleted ?? 0,
      description: meta?.description,
      iconKey: meta?.iconKey ?? slug,
      // Single source of truth shared with the workout engine (program-hierarchy.utils.ts's
      // resolveChildDomainsForParent uses the exact same check) — not a locally-reinvented
      // one-liner, so the UI's "assessed" cue can never drift from what the engine admits.
      isAssessed: profile ? isDomainAssessed(profile, slug) : false,
    };
  };

  const childCards: ChildCardData[] = childSlugs.map((slug) => buildCardData(slug, childMeta[slug]));

  // Additional independent active programs (index 1+) — same card shape as
  // children, just sourced from activePrograms directly instead of
  // MASTER_PROGRAM_CHILDREN. A slug can be a body category (push/pull/legs/core)
  // or a skill (planche/handstand/...) — domainType picks the right
  // mini-questionnaire path for the "not yet assessed" CTA below.
  const additionalCards: ChildCardData[] = additionalSlugs.map((slug) => buildCardData(slug, additionalMeta[slug]));

  // ── Render one card tile (shared by children + additional programs) ────
  // Assessed → tap opens ProgramDrawer. Not yet assessed → explicit
  // "not yet assessed" cue + CTA to the mini-questionnaire (never a silently
  // fabricated "Level 1" card) — domainType picks category vs skill routing.
  const renderCardTile = (card: ChildCardData, groupSize: number, domainType: MiniAssessmentDomainType) =>
    card.isAssessed ? (
      <button
        key={card.slug}
        type="button"
        className="flex-shrink-0 text-right active:opacity-80 transition-opacity"
        onClick={() => openProgramDrawer(card.slug, card, domainType)}
      >
        <ProgramProgressCard
          programName={card.name}
          iconKey={card.iconKey}
          currentLevel={card.currentLevel}
          maxLevel={card.maxLevel}
          progressPercent={Math.round(card.percent)}
          programCount={groupSize}
          className="pointer-events-none"
        />
      </button>
    ) : (
      <button
        key={card.slug}
        type="button"
        className="flex-shrink-0 text-right active:opacity-80 transition-opacity"
        style={{ minWidth: 160 }}
        onClick={() => startMiniDomainAssessment(router, card.slug, undefined, domainType)}
      >
        <div
          className="bg-white dark:bg-slate-800 w-full flex flex-col justify-between"
          style={{
            minHeight: 107,
            padding: 16,
            borderRadius: 12,
            border: '1px dashed #CBD5E1',
          }}
          dir="rtl"
        >
          <h3 className="text-[15px] font-bold text-gray-500 dark:text-gray-400 line-clamp-2 break-words leading-snug">
            {card.name}
          </h3>
          <p className="text-xs font-bold text-[#00C9F2] mt-2">טרם הוערך — לחצו לבדיקה</p>
        </div>
      </button>
    );

  // Don't render if no program at all. additionalCards is included defensively —
  // structurally it's empty whenever masterTemplateId is null (that only happens
  // when activePrograms itself is empty), but a corrupt entry[0] missing its own
  // templateId while entry[1]+ are valid shouldn't hide real programs.
  if (!masterTemplateId && childSlugs.length === 0 && additionalCards.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100" dir="rtl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-black text-gray-800">התוכניות שלי</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-6 gap-3">
          <span className="text-3xl">📋</span>
          <p className="text-sm font-bold text-gray-500 text-center leading-snug">
            עדיין לא בחרת תוכנית אימון.
          </p>
          <button
            type="button"
            onClick={() => router.push(resolveOnboardingEntryHref(profile, 'STRENGTH'))}
            className="mt-1 px-5 py-2 bg-[#00C9F2] text-white text-sm font-bold rounded-full active:scale-95 transition-transform"
          >
            בחר תוכנית
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-5" dir="rtl">
        {/* Section header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-gray-800">התוכניות שלי</h3>
          <button
            type="button"
            onClick={() => router.push('/home')}
            className="text-xs font-semibold text-[#00C9F2] active:opacity-70"
          >
            ניהול
          </button>
        </div>

        {/* Group 1 — Master program */}
        {masterTemplateId && progressData && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-400 tracking-wide">תוכנית פעילה</p>
            <button
              type="button"
              className="w-full text-right active:opacity-80 transition-opacity"
              onClick={openMasterDrawer}
            >
              <ProgramProgressCard
                programName={masterName}
                iconKey={masterIconKey}
                currentLevel={masterLevel}
                maxLevel={masterMaxLevel}
                progressPercent={masterPercent}
                className="!max-w-none pointer-events-none"
              />
            </button>
          </div>
        )}

        {/* Group 2 — Child programs (unchanged: derived from activePrograms[0] only) */}
        {childCards.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-400 tracking-wide">תוכניות בנות</p>
            <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
              {childCards.map((card) => renderCardTile(card, childCards.length, 'category'))}
            </div>
          </div>
        )}

        {/* Group 3 — Additional independent active programs (activePrograms index 1+) */}
        {additionalCards.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-400 tracking-wide">תוכניות נוספות</p>
            <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
              {additionalCards.map((card) => renderCardTile(card, additionalCards.length, domainTypeForSlug(card.slug)))}
            </div>
          </div>
        )}
      </div>

      {/* Drawer — portalled outside the card */}
      <ProgramDrawer program={drawerProgram} onClose={closeDrawer} />
    </>
  );
}
