'use client';

/**
 * ProgramsSection — profile Block 5.
 *
 * Shows up to three groups:
 *   1. "תוכנית פעילה"    — the master program card for activePrograms[0]
 *                          (same ProgramProgressCard as Home)
 *   2. "תוכניות בנות"    — the ASSESSED child programs of activePrograms[0]
 *                          when it is a parent. Children come from
 *                          resolveParentChildSlugs (Program.subPrograms /
 *                          the engine's lists — full_body now includes core;
 *                          the old hardcoded MASTER_PROGRAM_CHILDREN had
 *                          push/pull/legs only and no other parent).
 *   2b. "עוד לא בדקת רמה" — the UNASSESSED children, each with a level-check
 *                          CTA (the workouts leave them out until then).
 *   3. "תוכניות נוספות"  — one card per OTHER entry in activePrograms
 *                          (index 1+): genuinely independent programs the
 *                          user is active in that are NOT a parent/child of
 *                          entry 0 (e.g. activePrograms = [push, planche] —
 *                          planche isn't a "child" of push, it's its own
 *                          active program). Previously these were silently
 *                          invisible — only activePrograms[0] was ever read.
 *
 * Tapping an assessed card navigates to that program's Skill-Tree detail
 * page (/progression-map/[programId]) — the same destination the
 * /progression hub's SkillMapCard already uses for the identical program,
 * via the identical resolveProgressionMapDestination. A parent program (no
 * map of its own) opens ParentProgramSheet; it used to route to '/profile',
 * i.e. do nothing here.
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { getProgramByTemplateId } from '@/features/content/programs/core/program.service';
import {
  useProgramProgress,
  MASTER_LEVEL_CAP,
} from '@/features/home/hooks/useProgramProgress';
import { ProgramProgressCard } from '@/features/home/components/widgets/ProgramProgressCard';
import { PROGRAM_NAME_HE } from '@/lib/utils/program-names';
import type { Program } from '@/features/content/programs/core/program.types';
import { startMiniDomainAssessment, type MiniAssessmentDomainType } from '@/features/user/onboarding/services/mini-domain-assessment';
import { isDomainAssessed, resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';
import { resolveProgressionMapDestination } from '@/lib/progression-map-config';
import { resolveAdditionalProgramSlugs, domainTypeForSlug } from './program-groups.utils';
import {
  NEEDS_ASSESSMENT_EXPLAINER,
  resolveParentChildSlugs,
} from '@/features/progression-map/services/progress-hub-bucketing.service';
import ParentProgramSheet from './ParentProgramSheet';
import { resolveOnboardingEntryHref } from '@/features/user/onboarding/utils/onboarding-entry';

import BrandCtaButton from '@/components/ui/BrandCtaButton';
import CircularProgress from '@/components/CircularProgress';
import { getProgramIcon } from '@/features/content/programs';
import { ChevronLeft, Target } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
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

interface ProgramsSectionProps {
  /** Home v2 (enable_home_v2) look — passed down by DashboardTab. */
  v2?: boolean;
}

const V2_PRESS = 'transition-transform duration-150 ease-v2 active:scale-[0.97]';

/** v2 progress ring — brand arc on a hairline track. */
function V2Ring({ percent, size, stroke, children }: { percent: number; size: number; stroke: number; children: React.ReactNode }) {
  return (
    <CircularProgress
      percentage={percent}
      size={size}
      strokeWidth={stroke}
      colorClass="text-v2-accent"
      trackClass="text-v2-hairline"
      className="shrink-0"
    >
      {children}
    </CircularProgress>
  );
}

export default function ProgramsSection({ v2 = false }: ProgramsSectionProps = {}) {
  const t = useT(profileNs);
  const router = useRouter();
  const profile = useUserStore((s) => s.profile);
  const progressData = useProgramProgress();

  const tracks = (profile?.progression?.tracks ?? {}) as Record<
    string,
    { currentLevel?: number; percent?: number; totalWorkoutsCompleted?: number; maxLevel?: number }
  >;

  // Resolved metadata for child programs (description, iconKey, maxLevels)
  const [childMeta, setChildMeta] = useState<Record<string, Program>>({});
  // Resolved metadata for additional (index 1+) independent active programs
  const [additionalMeta, setAdditionalMeta] = useState<Record<string, Program>>({});
  // The master's own Program doc — only its subPrograms are read here.
  const [masterMeta, setMasterMeta] = useState<Program | null>(null);
  // Parent program whose ParentProgramSheet is open (null = closed).
  const [sheetParentId, setSheetParentId] = useState<string | null>(null);

  // Resolve the master program templateId
  const masterTemplateId =
    profile?.progression?.activePrograms?.[0]?.templateId ?? null;
  // masterTemplateId is the raw Firestore doc ID — needed as-is for
  // fetchProgramMeta below (a real Firestore lookup). Children and tracks
  // are keyed by slug — resolve separately for those lookups.
  const masterSlug = masterTemplateId ? resolveToSlug(masterTemplateId) : null;
  // A leaf master (e.g. activePrograms = [planche]) has its own map and no children.
  const masterIsParent = !!masterTemplateId && resolveProgressionMapDestination(masterTemplateId) === null;

  useEffect(() => {
    setMasterMeta(null);
    if (!masterTemplateId || !masterIsParent) return;
    let cancelled = false;
    fetchProgramMeta(masterTemplateId).then((meta) => { if (!cancelled) setMasterMeta(meta); });
    return () => { cancelled = true; };
  }, [masterTemplateId, masterIsParent]);

  // Derived children for this master (same rule the server's averaging reads).
  const skillFocusKey = (profile?.progression?.skillFocusIds ?? []).join(',');
  const childSlugs: readonly string[] = masterSlug && masterIsParent
    ? resolveParentChildSlugs(
        masterSlug,
        masterMeta?.subPrograms?.map(resolveToSlug),
        skillFocusKey ? skillFocusKey.split(',').map(resolveToSlug) : [],
      )
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
  const masterName = progressData?.programName ?? (masterTemplateId ? PROGRAM_NAME_HE[masterTemplateId] ?? masterTemplateId : t('widgets.programs.fallbackName'));
  const masterIconKey = progressData?.iconKey;

  // ── Navigate to a program's detail page — shared with SkillMapCard's
  // identical tap target (resolveProgressionMapDestination handles both the
  // raw-id and slug forms, since real program data mixes both). ──
  const openProgram = (idOrSlug: string) => {
    const destination = resolveProgressionMapDestination(idOrSlug);
    if (destination) router.push(destination);
    else setSheetParentId(idOrSlug);
  };

  const goToMasterProgram = () => {
    if (!masterTemplateId) return;
    openProgram(masterTemplateId);
  };

  const goToProgram = (slug: string) => openProgram(slug);

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
  const assessedChildCards = childCards.filter((c) => c.isAssessed);
  const unassessedChildCards = childCards.filter((c) => !c.isAssessed);

  // Additional independent active programs (index 1+) — same card shape as
  // children, just sourced from activePrograms directly instead of
  // MASTER_PROGRAM_CHILDREN. A slug can be a body category (push/pull/legs/core)
  // or a skill (planche/handstand/...) — domainType picks the right
  // mini-questionnaire path for the "not yet assessed" CTA below.
  const additionalCards: ChildCardData[] = additionalSlugs.map((slug) => buildCardData(slug, additionalMeta[slug]));

  // ── Render one card tile (shared by children + additional programs) ────
  // Assessed → tap navigates to that program's Skill-Tree detail page. Not
  // yet assessed → explicit "not yet assessed" cue + CTA to the
  // mini-questionnaire (never a silently fabricated "Level 1" card) —
  // domainType picks category vs skill routing for that CTA.
  const renderCardTile = (card: ChildCardData, groupSize: number, domainType: MiniAssessmentDomainType) =>
    card.isAssessed ? (
      <button
        key={card.slug}
        type="button"
        className="flex-shrink-0 text-right active:opacity-80 transition-opacity"
        onClick={() => goToProgram(card.slug)}
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
          <p className="text-xs font-bold text-[#00C9F2] mt-2">{t('widgets.programs.notAssessedCta')}</p>
        </div>
      </button>
    );

  // ── v2 row (shared by children + additional programs) — same two
  // handlers as renderCardTile above, only the look differs. ──
  const renderRowV2 = (card: ChildCardData, domainType: MiniAssessmentDomainType) =>
    card.isAssessed ? (
      <button
        key={card.slug}
        type="button"
        onClick={() => goToProgram(card.slug)}
        className={`flex w-full items-center gap-3 rounded-[20px] bg-white p-3 text-right shadow-v2-ring ${V2_PRESS}`}
      >
        <V2Ring percent={Math.round(card.percent)} size={44} stroke={4}>
          <span className="text-v2-deep">{getProgramIcon(card.iconKey, 'w-4 h-4')}</span>
        </V2Ring>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-extrabold text-v2-ink">{card.name}</p>
          <p className="mt-0.5 whitespace-nowrap text-[12.5px] font-bold text-v2-muted tabular-nums">
            {t('widgets.programs.level', { level: String(card.currentLevel), max: String(card.maxLevel) })}
          </p>
        </div>
        <span className="whitespace-nowrap text-[13px] font-extrabold text-v2-deep tabular-nums">
          {Math.round(card.percent)}%
        </span>
        <ChevronLeft className="h-4 w-4 shrink-0 text-v2-muted" aria-hidden />
      </button>
    ) : (
      <button
        key={card.slug}
        type="button"
        onClick={() => startMiniDomainAssessment(router, card.slug, undefined, domainType)}
        className={`flex w-full items-center gap-3 rounded-[20px] bg-white p-3 text-right shadow-v2-ring ${V2_PRESS}`}
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-v2-surface text-v2-muted ring-1 ring-inset ring-v2-hairline">
          {getProgramIcon(card.iconKey, 'w-4 h-4')}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-extrabold text-v2-ink-2">{card.name}</p>
          <p className="mt-0.5 truncate text-[12.5px] font-bold text-v2-deep">{t('widgets.programs.notAssessedCta')}</p>
        </div>
        <ChevronLeft className="h-4 w-4 shrink-0 text-v2-muted" aria-hidden />
      </button>
    );

  const hasAnyProgram = !(!masterTemplateId && childSlugs.length === 0 && additionalCards.length === 0);

  const parentSheet = (
    <ParentProgramSheet parentId={sheetParentId} onClose={() => setSheetParentId(null)} v2={v2} />
  );

  if (v2 && !hasAnyProgram) {
    return (
      <div dir="rtl">
        <h3 className="mb-3 text-[15px] font-black text-v2-ink">{t('widgets.programs.title')}</h3>
        <div className="flex flex-col items-center gap-3 rounded-v2-card bg-white px-5 py-7 text-center shadow-v2-card">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-v2-tint text-v2-deep">
            <Target className="h-6 w-6" aria-hidden />
          </span>
          <p className="text-[15px] font-extrabold text-v2-ink">{t('widgets.programs.empty')}</p>
          <button
            type="button"
            onClick={() => router.push(resolveOnboardingEntryHref(profile, 'STRENGTH'))}
            className={`mt-1 h-12 rounded-full bg-v2-cta px-8 text-[16px] font-extrabold text-v2-on-cta shadow-v2-cta ${V2_PRESS}`}
          >
            {t('widgets.programs.choose')}
          </button>
        </div>
      </div>
    );
  }

  if (v2) {
    return (
      <div className="space-y-5" dir="rtl">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-black text-v2-ink">{t('widgets.programs.title')}</h3>
          <button
            type="button"
            onClick={() => router.push('/home')}
            className="text-[13px] font-extrabold text-v2-deep active:opacity-70"
          >
            {t('widgets.programs.manage')}
          </button>
        </div>

        {masterTemplateId && progressData && (
          <div className="space-y-2">
            <p className="text-[13px] font-extrabold text-v2-deep">{t('widgets.programs.active')}</p>
            <button
              type="button"
              onClick={goToMasterProgram}
              className={`flex w-full items-center gap-4 rounded-v2-card bg-white p-4 text-right shadow-v2-card ${V2_PRESS}`}
            >
              <V2Ring percent={masterPercent} size={68} stroke={6}>
                <span className="text-[15px] font-black text-v2-ink tabular-nums">{Math.round(masterPercent)}%</span>
              </V2Ring>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-v2-deep">
                  {getProgramIcon(masterIconKey, 'w-4 h-4')}
                  <p className="truncate text-[17px] font-black text-v2-ink">{masterName}</p>
                </div>
                <p className="mt-1 whitespace-nowrap text-[13px] font-bold text-v2-muted tabular-nums">
                  {t('widgets.programs.level', { level: String(masterLevel), max: String(masterMaxLevel) })}
                </p>
              </div>
              <ChevronLeft className="h-4 w-4 shrink-0 text-v2-muted" aria-hidden />
            </button>
          </div>
        )}

        {assessedChildCards.length > 0 && (
          <div className="space-y-2">
            <p className="text-[13px] font-extrabold text-v2-deep">{t('widgets.programs.children')}</p>
            <div className="flex flex-col gap-2">
              {assessedChildCards.map((card) => renderRowV2(card, domainTypeForSlug(card.slug)))}
            </div>
          </div>
        )}

        {unassessedChildCards.length > 0 && (
          <div className="space-y-2">
            <div>
              <p className="text-[13px] font-extrabold text-v2-deep">{t('widgets.programs.unassessed')}</p>
              <p className="mt-0.5 text-[12.5px] font-bold text-v2-muted">{NEEDS_ASSESSMENT_EXPLAINER}</p>
            </div>
            <div className="flex flex-col gap-2">
              {unassessedChildCards.map((card) => renderRowV2(card, domainTypeForSlug(card.slug)))}
            </div>
          </div>
        )}

        {additionalCards.length > 0 && (
          <div className="space-y-2">
            <p className="text-[13px] font-extrabold text-v2-deep">{t('widgets.programs.additional')}</p>
            <div className="flex flex-col gap-2">
              {additionalCards.map((card) => renderRowV2(card, domainTypeForSlug(card.slug)))}
            </div>
          </div>
        )}

        {parentSheet}
      </div>
    );
  }

  // Don't render if no program at all. additionalCards is included defensively —
  // structurally it's empty whenever masterTemplateId is null (that only happens
  // when activePrograms itself is empty), but a corrupt entry[0] missing its own
  // templateId while entry[1]+ are valid shouldn't hide real programs.
  if (!masterTemplateId && childSlugs.length === 0 && additionalCards.length === 0) {
    return (
      <div dir="rtl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-black text-gray-800">{t('widgets.programs.title')}</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-6 gap-3">
          <span className="text-3xl">📋</span>
          <p className="text-sm font-bold text-gray-500 text-center leading-snug">
            {t('widgets.programs.empty')}
          </p>
          <BrandCtaButton
            type="button"
            onClick={() => router.push(resolveOnboardingEntryHref(profile, 'STRENGTH'))}
            className="mt-1 px-5 py-2 text-sm"
          >
            {t('widgets.programs.choose')}
          </BrandCtaButton>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5" dir="rtl">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-gray-800">{t('widgets.programs.title')}</h3>
        <button
          type="button"
          onClick={() => router.push('/home')}
          className="text-xs font-semibold text-[#00C9F2] active:opacity-70"
        >
          {t('widgets.programs.manage')}
        </button>
      </div>

      {/* Group 1 — Master program */}
      {masterTemplateId && progressData && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-gray-400 tracking-wide">{t('widgets.programs.active')}</p>
          <button
            type="button"
            className="w-full text-right active:opacity-80 transition-opacity"
            onClick={goToMasterProgram}
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

      {/* Group 2 — Assessed child programs of activePrograms[0] */}
      {assessedChildCards.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-gray-400 tracking-wide">{t('widgets.programs.children')}</p>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            {assessedChildCards.map((card) => renderCardTile(card, assessedChildCards.length, domainTypeForSlug(card.slug)))}
          </div>
        </div>
      )}

      {/* Group 2b — Child programs whose level was never checked */}
      {unassessedChildCards.length > 0 && (
        <div className="space-y-2">
          <div>
            <p className="text-xs font-bold text-gray-400 tracking-wide">{t('widgets.programs.unassessed')}</p>
            <p className="mt-0.5 text-xs font-medium text-gray-500">{NEEDS_ASSESSMENT_EXPLAINER}</p>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            {unassessedChildCards.map((card) => renderCardTile(card, unassessedChildCards.length, domainTypeForSlug(card.slug)))}
          </div>
        </div>
      )}

      {/* Group 3 — Additional independent active programs (activePrograms index 1+) */}
      {additionalCards.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-gray-400 tracking-wide">{t('widgets.programs.additional')}</p>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            {additionalCards.map((card) => renderCardTile(card, additionalCards.length, domainTypeForSlug(card.slug)))}
          </div>
        </div>
      )}

      {parentSheet}
    </div>
  );
}
