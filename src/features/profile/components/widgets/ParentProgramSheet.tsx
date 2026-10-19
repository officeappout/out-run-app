'use client';

/**
 * ParentProgramSheet — what tapping a PARENT program opens (full_body,
 * upper_body, calisthenics_upper, ...), from the progress tab (SkillMapCard)
 * and from the profile (ProgramsSection).
 *
 * A parent has no progression map of its own; its level is the average of
 * its child programs. Before this sheet the tap went to '/profile' (a bounce
 * from the progress tab, a no-op from the profile itself). Adapted from the
 * unused ProgramDrawer bottom sheet.
 *
 * Content: parent name + "רמה X (ממוצע)", one line explaining the above, and
 * the child programs — each assessed child shows level/max/% and opens its
 * map; an unassessed child offers the mini level check instead. A child that
 * is itself a parent re-opens this sheet on it.
 *
 * Children come from resolveParentChildSlugs (Program.subPrograms, the
 * engine's fallback lists, calisthenics_upper's skillFocusIds) — the same
 * source the server's averaging reads; the average mirrors its formula.
 *
 * Portalled to document.body at z-[60]/z-[61] (the Progression screen's
 * existing sheet band, .cursorrules) so it clears BottomNavbar (z-50).
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getProgramIcon, resolveProgramLabel } from '@/features/content/programs';
import { getProgramByTemplateId } from '@/features/content/programs/core/program.service';
import type { Program } from '@/features/content/programs/core/program.types';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';
import { startMiniDomainAssessment } from '@/features/user/onboarding/services/mini-domain-assessment';
import { resolveProgressionMapDestination } from '@/lib/progression-map-config';
import {
  averageParentLevel,
  buildHubLevelsBySlug,
  isExcludedFromParentAverage,
  resolveParentChildSlugs,
} from '@/features/progression-map/services/progress-hub-bucketing.service';
import { domainTypeForSlug } from './program-groups.utils';
import Sheet from '@/components/ui/v2/Sheet';
import IconButton from '@/components/ui/v2/IconButton';
import { SHEET_Z } from '@/components/ui/v2/tokens';

interface ParentProgramSheetProps {
  /** The parent's raw id or slug; null = closed. */
  parentId: string | null;
  onClose: () => void;
  /** Home v2 (enable_home_v2) look. */
  v2?: boolean;
}

interface ChildRow {
  slug: string;
  name: string;
  iconKey?: string;
  level: number | null;
  maxLevel: number | null;
  percent: number;
  excludedFromAverage: boolean;
}

export const PARENT_SHEET_EXPLAINER =
  'לתוכנית אב אין מפת התקדמות משלה. ההתקדמות נמדדת בכל תוכנית בת, והרמה כאן היא הממוצע שלהן.';

export default function ParentProgramSheet({ parentId, onClose, v2 = false }: ParentProgramSheetProps) {
  const router = useRouter();
  const profile = useUserStore((s) => s.profile);
  const [mounted, setMounted] = useState(false);
  // A child that is itself a parent re-targets the sheet; reset when the caller opens a new one.
  const [currentId, setCurrentId] = useState<string | null>(parentId);
  const [parentMeta, setParentMeta] = useState<Program | null>(null);
  const [childMeta, setChildMeta] = useState<Record<string, Program>>({});

  useEffect(() => setMounted(true), []);
  useEffect(() => setCurrentId(parentId), [parentId]);

  const parentSlug = currentId ? resolveToSlug(currentId) : null;

  useEffect(() => {
    setParentMeta(null);
    if (!currentId) return;
    let cancelled = false;
    getProgramByTemplateId(currentId)
      .then((p) => { if (!cancelled) setParentMeta(p); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentId]);

  const childSlugs = useMemo(() => {
    if (!parentSlug) return [];
    const skillFocus = (profile?.progression?.skillFocusIds ?? []).map(resolveToSlug);
    return resolveParentChildSlugs(parentSlug, parentMeta?.subPrograms?.map(resolveToSlug), skillFocus);
  }, [parentSlug, parentMeta, profile]);

  useEffect(() => {
    if (childSlugs.length === 0) return;
    let cancelled = false;
    Promise.all(
      childSlugs.map(async (slug) => [slug, await getProgramByTemplateId(slug).catch(() => null)] as const),
    ).then((entries) => {
      if (cancelled) return;
      const map: Record<string, Program> = {};
      for (const [slug, meta] of entries) if (meta) map[slug] = meta;
      setChildMeta(map);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childSlugs.join(',')]);

  const tracksRaw = (profile?.progression?.tracks ?? {}) as Record<
    string,
    { currentLevel?: number; percent?: number; maxLevel?: number } | undefined
  >;
  const levelsBySlug = useMemo(
    () =>
      buildHubLevelsBySlug(
        tracksRaw,
        (profile?.progression?.domains ?? {}) as Record<string, { currentLevel?: number } | undefined>,
        resolveToSlug,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile],
  );

  const rows: ChildRow[] = childSlugs.map((slug) => {
    const meta = childMeta[slug];
    const track = tracksRaw[slug];
    return {
      slug,
      name: meta?.name ?? resolveProgramLabel(slug),
      iconKey: meta?.iconKey ?? slug,
      level: levelsBySlug[slug] ?? null,
      maxLevel: meta?.maxLevels ?? track?.maxLevel ?? null,
      percent: Math.min(100, Math.round(track?.percent ?? 0)),
      excludedFromAverage: parentSlug ? isExcludedFromParentAverage(parentSlug, slug) : false,
    };
  });
  const assessed = rows.filter((r) => r.level != null);
  const unassessed = rows.filter((r) => r.level == null);
  const avg = parentSlug ? averageParentLevel(parentSlug, childSlugs, levelsBySlug) : null;
  const parentName = parentMeta?.name ?? (parentSlug ? resolveProgramLabel(parentSlug) : '');

  const openChild = (slug: string) => {
    const destination = resolveProgressionMapDestination(slug);
    if (destination) {
      onClose();
      router.push(destination);
    } else {
      setCurrentId(slug); // the child is itself a parent
    }
  };

  const checkLevel = (slug: string) => {
    onClose();
    startMiniDomainAssessment(router, slug, undefined, domainTypeForSlug(slug));
  };

  const isOpen = currentId !== null;

  const c = v2
    ? {
        sheet: 'bg-white rounded-t-v2-card-lg shadow-v2-sheet',
        title: 'text-[18px] font-black text-v2-ink',
        sub: 'text-[13px] font-bold text-v2-muted tabular-nums',
        body: 'text-[13.5px] leading-relaxed text-v2-ink-2',
        label: 'text-[13px] font-extrabold text-v2-deep',
        row: 'flex w-full items-center gap-3 rounded-[20px] bg-white p-3 text-right shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]',
        rowName: 'truncate text-[15px] font-extrabold text-v2-ink',
        rowMeta: 'mt-0.5 truncate text-[12.5px] font-bold text-v2-muted tabular-nums',
        pct: 'whitespace-nowrap text-[13px] font-extrabold text-v2-deep tabular-nums',
        cta: 'shrink-0 rounded-full bg-v2-cta px-4 py-2 text-[13px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97]',
        close: 'h-12 w-full rounded-full bg-v2-surface text-[15px] font-extrabold text-v2-ink ring-1 ring-inset ring-v2-hairline active:opacity-80',
        icon: 'text-v2-deep',
      }
    : {
        sheet: 'bg-white rounded-t-2xl',
        title: 'text-lg font-black text-gray-900',
        sub: 'text-xs font-bold text-gray-500 tabular-nums',
        body: 'text-sm text-gray-600 leading-relaxed',
        label: 'text-xs font-bold text-gray-400 tracking-wide',
        row: 'flex w-full items-center gap-3 rounded-xl bg-gray-50 p-3 text-right active:bg-gray-100 transition-colors',
        rowName: 'truncate text-sm font-bold text-gray-900',
        rowMeta: 'mt-0.5 truncate text-xs font-medium text-gray-500 tabular-nums',
        pct: 'whitespace-nowrap text-sm font-black text-gray-900 tabular-nums',
        cta: 'shrink-0 rounded-full bg-brand-cta px-4 py-1.5 text-xs font-bold text-on-brand active:opacity-80',
        close: 'w-full py-3 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold active:bg-gray-200 transition-colors',
        icon: 'text-gray-900',
      };

  const content = (
    <div className="px-5 pb-2 space-y-5">
      <p className={c.body}>{PARENT_SHEET_EXPLAINER}</p>

      {assessed.length > 0 && (
        <div className="space-y-2">
          <p className={c.label}>תוכניות בנות</p>
          {assessed.map((r) => (
            <button key={r.slug} type="button" onClick={() => openChild(r.slug)} className={c.row}>
              <span className={c.icon}>{getProgramIcon(r.iconKey, 'w-5 h-5')}</span>
              <div className="min-w-0 flex-1">
                <p className={c.rowName}>{r.name}</p>
                <p className={c.rowMeta}>
                  רמה {r.level}{r.maxLevel ? `/${r.maxLevel}` : ''}
                  {r.excludedFromAverage ? ' · לא נכלל בממוצע' : ''}
                </p>
              </div>
              <span className={c.pct}>{r.percent}%</span>
              <ChevronLeft className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
            </button>
          ))}
        </div>
      )}

      {unassessed.length > 0 && (
        <div className="space-y-2">
          <p className={c.label}>עוד לא בדקת רמה</p>
          {unassessed.map((r) => (
            <div key={r.slug} className={c.row}>
              <span className="text-gray-400">{getProgramIcon(r.iconKey, 'w-5 h-5')}</span>
              <div className="min-w-0 flex-1">
                <p className={c.rowName}>{r.name}</p>
                <p className={c.rowMeta}>האימונים לא יכללו את התוכנית עד שתבדקו רמה</p>
              </div>
              <button type="button" onClick={() => checkLevel(r.slug)} className={c.cta}>
                בדקו רמה
              </button>
            </div>
          ))}
        </div>
      )}

      <button type="button" onClick={onClose} className={c.close}>
        סגירה
      </button>
    </div>
  );

  if (v2) {
    return (
      <Sheet
        open={isOpen}
        onClose={onClose}
        // z-[60]/z-[61] (.cursorrules): the Progression screen's sheet band, clears BottomNavbar.
        zIndex={SHEET_Z.drawerPanel}
        scroll="panel"
        keyboardAware={false}
        className="max-h-[85vh]"
        safeArea="max(1.25rem, env(safe-area-inset-bottom, 20px))"
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        ariaLabel={parentName}
      >
        <div className="mx-auto max-w-md">
          <div className="flex items-start justify-between gap-3 px-5 pt-3 pb-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className={c.icon}>{getProgramIcon(parentMeta?.iconKey ?? parentSlug ?? undefined, 'w-6 h-6')}</span>
              <div className="min-w-0">
                <h2 className={`truncate ${c.title}`}>{parentName}</h2>
                <p className={c.sub}>{avg != null ? `רמה ${avg} (ממוצע)` : 'עוד אין רמה'}</p>
              </div>
            </div>
            <IconButton aria-label="סגירה" tone="surface" size={36} className="shrink-0" onClick={onClose}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
          {content}
        </div>
      </Sheet>
    );
  }

  const sheet = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="parent-sheet-backdrop"
            className="fixed inset-0 bg-black/40 z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            key="parent-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={parentName}
            className={`fixed bottom-0 inset-x-0 z-[61] overflow-y-auto ${c.sheet}`}
            style={{ maxHeight: '85vh', paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 20px))' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            dir="rtl"
          >
            <div className="mx-auto max-w-md">
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-gray-200" />
              </div>

              <div className="flex items-start justify-between gap-3 px-5 pt-3 pb-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={c.icon}>{getProgramIcon(parentMeta?.iconKey ?? parentSlug ?? undefined, 'w-6 h-6')}</span>
                  <div className="min-w-0">
                    <h2 className={`truncate ${c.title}`}>{parentName}</h2>
                    <p className={c.sub}>{avg != null ? `רמה ${avg} (ממוצע)` : 'עוד אין רמה'}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="סגירה"
                  className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full bg-gray-100 active:bg-gray-200"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              {content}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (!mounted) return null;
  return createPortal(sheet, document.body);
}
