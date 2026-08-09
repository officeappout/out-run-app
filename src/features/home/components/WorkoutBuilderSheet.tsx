'use client';

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Trees, Home, Dumbbell, Shield, Plus, ChevronDown, ChevronUp, Lock, CalendarDays, Clock, Wrench, type LucideIcon } from 'lucide-react';
import { getAllGearDefinitions } from '@/features/content/equipment/gear';
import type { GearDefinition } from '@/features/content/equipment/gear';
import { useUserStore } from '@/features/user';
import { generateHomeWorkout } from '@/features/workout-engine/services/home-workout.service';
import { resolveWorkoutContext } from '@/features/workout-engine/services/workout-context-resolver';
import { useWeeklyVolumeStore } from '@/features/workout-engine/core/store/useWeeklyVolumeStore';
import type { DifficultyLevel, GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';
import type { ExecutionLocation } from '@/features/content/exercises/core/exercise.types';
import type { Program } from '@/features/content/programs/core/program.types';
import { getAllPrograms } from '@/features/content/programs/core/program.service';
import { KNOWN_MASTER_PROGRAMS } from '@/features/user/progression/services/progression.service';
import { resolveIconKey, ICON_MAP } from '@/features/content/programs/core/program-icon.util';
import WorkoutPreviewDrawer from '@/features/workouts/components/WorkoutPreviewDrawer';
import EquipmentFilterSheet from '@/features/content/exercises/client/components/EquipmentFilterSheet';
import { BODYWEIGHT_SENTINEL } from '@/features/content/exercises/client/store/useExerciseLibraryStore';
import { resolveEquipmentSvgPathList } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import { DrumTimePicker } from '@/components/ui/DrumTimePicker';
import { upsertScheduleEntry } from '@/features/user/scheduling/services/userSchedule.service';
import { MUSCLE_CHIPS, domainsToChipIds } from '@/features/home/constants/muscle-chips';
import { deriveActiveProgramFromMuscleFocus } from '@/features/user/onboarding/services/assessment-path-config.service';
import { resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';
import {
  startMiniDomainAssessment,
  resolveBaseCategoryForProgramId,
} from '@/features/user/onboarding/services/mini-domain-assessment';

// ─── Types & config ──────────────────────────────────────────────────────────

export type LocationId = 'park' | 'gym' | 'home' | 'service';

interface DisplayProgram {
  id: string;
  label: string;
  level: number;
  isMaster: boolean;
  children: string[];
  isLocked: boolean;
  /** True when the program exists in the system but the user is not yet enrolled. */
  isUnenrolled?: boolean;
  IconComp: React.ComponentType<{ className?: string }> | null;
}

export interface WorkoutBuilderSheetProps {
  mode?: string;
  date?: string;
  defaultProgramIds?: string;
  defaultDuration?: string;
  defaultLocation?: string;
  defaultIntensity?: string;
  onClose: () => void;
}

export const LOCATION_OPTIONS: {
  id: LocationId;
  label: string;
  sub: string;
  Icon: LucideIcon;
}[] = [
  // חדר כושר removed from every user-facing location picker — no gym footage exists.
  // 'gym' intentionally REMAINS in the ExecutionLocation type + LocationId so already
  // gym-tagged content stays valid; it is simply not offerable.
  { id: 'park',    label: 'בחוץ',     sub: 'פארק / מגרש', Icon: Trees },
  { id: 'home',    label: 'בבית',     sub: 'אימון ביתי',   Icon: Home },
  // 'service' (צבא/שירות) is a SWAP-only variant, gated to military personas in
  // AnchorLocationChip. It is intentionally filtered out of the builder-sheet GENERATION
  // picker below (generation PARK-FORCEs, so generating "at service" would be a no-op).
  { id: 'service', label: 'צבא/שירות', sub: 'מוצב / בסיס',  Icon: Shield },
];

const TIME_OPTIONS = [15, 30, 45, 60] as const;

const TIME_MOTIVATION: Record<number | 'other', { male: string; female: string }> = {
  15:    { male: 'קצר? בטח. עדיף על כלום',              female: 'קצר? בטח. עדיף על כלום' },
  30:    { male: 'קלאסי. הזמן שעובד לרוב',              female: 'קלאסי. הזמן שעובד לרוב' },
  45:    { male: 'אימון מספק שתרגיש אותו',              female: 'אימון מספק שתרגישי אותו' },
  60:    { male: 'למי שאוהב להשקיע בעצמו',              female: 'למי שאוהבת להשקיע בעצמה' },
  other: { male: 'תבחר בדיוק מה שמתאים לך',           female: 'תבחרי בדיוק מה שמתאים לך' },
};

const BOLT_LABELS: Record<1 | 2 | 3, string> = { 1: 'קליל', 2: 'מאוזן', 3: 'עצים' };

// ── Hebrew fallback labels for program slugs ──────────────────────────────────
// Prevents raw English slugs ('upper_body', 'pull', etc.) from leaking into
// the program-pill UI when programs[] Firestore state is still loading or when
// a program document has no name field.  Acts as a third-tier fallback after
// ICON_MAP and doc.name in the displayPrograms label cascade.
const SLUG_HEBREW_FALLBACK: Record<string, string> = {
  full_body:          'כל הגוף',
  upper_body:         'פלג עליון',
  lower_body:         'פלג תחתון',
  push:               'לחיצה',
  pull:               'משיכה',
  legs:               'רגליים',
  core:               'ליבה',
  calisthenics_upper: 'כלים',
  planche:            'פלאנץ׳',
  front_lever:        'פרונט לבר',
  handstand:          'עמידת ידיים',
  handstand_pushup:   'לחיצת ידיים',
  muscle_up:          'מאסל אפ',
  back_lever:         'באק לבר',
  one_arm_pullup:     'מתח יד אחת',
};

// Bolt SVG filters — same values as WorkoutSelectionCarousel
const BOLT_FILTER_FILLED_INACTIVE =
  'brightness(0) saturate(100%) invert(68%) sepia(65%) saturate(2000%) hue-rotate(160deg) brightness(102%) contrast(101%)';
const BOLT_FILTER_EMPTY_INACTIVE =
  'brightness(0) saturate(100%) invert(22%) sepia(10%) saturate(750%) hue-rotate(176deg) brightness(95%) contrast(90%)';
// When button is active (cyan bg): white bolts
const BOLT_FILTER_FILLED_ACTIVE = 'brightness(0) invert(1)';
const BOLT_FILTER_EMPTY_ACTIVE   = 'brightness(0) invert(1) opacity(0.35)';

// Shared pill styles (exact match to UserWorkoutAdjuster)
const ACTIVE_PILL   = 'bg-[#00BAF7] border-[#00BAF7] text-white shadow-md shadow-cyan-400/30';
const INACTIVE_PILL = 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300';

// ── Leaf-program slug allowlist for enrollment detection ─────────────────────
// Only track keys matching these known leaf slugs count as explicit enrollment.
// Excludes master-derived slugs written by recalculateMasterLevel (e.g.
// 'full_body', 'upper_body') so aggregate shells never appear as "enrolled"
// for a user who tracks only a single split like "push".
const LEAF_SLUGS = new Set([
  'push', 'pull', 'legs', 'core',
  'planche', 'front_lever', 'handstand', 'handstand_pushup',
  'muscle_up', 'back_lever', 'one_arm_pullup',
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getNextFullHour(): string {
  const now = new Date();
  let h = now.getHours() + 1;
  if (h < 5)  h = 5;
  if (h > 22) h = 22;
  return `${String(h).padStart(2, '0')}:00`;
}

const HEBREW_DAY_NAMES: Record<number, string> = {
  0: 'ראשון', 1: 'שני', 2: 'שלישי', 3: 'רביעי', 4: 'חמישי', 5: 'שישי', 6: 'שבת',
};
function formatScheduleDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const day = HEBREW_DAY_NAMES[d.getDay()] ?? '';
  return `יום ${day}, ${d.getDate()}/${d.getMonth() + 1}`;
}

/** 'easy'|'medium'|'hard'|'blast' → DifficultyLevel */
function paramToDifficulty(s: string | null | undefined): DifficultyLevel {
  if (s === 'easy')   return 1;
  if (s === 'hard')   return 3;
  return 2;
}

// ─── Section wrapper ─────────────────────────────────────────────────────────
function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-base font-bold text-gray-900 dark:text-white">{title}</h2>
        {sub && <span className="text-xs text-gray-400">{sub}</span>}
      </div>
      {children}
    </div>
  );
}

// ─── Program pill ─────────────────────────────────────────────────────────────
const SUGGESTED_PILL = 'bg-amber-50 border-amber-300 border-dashed text-amber-700';

function ProgramPill({
  prog,
  isSelected,
  isSuggested,
  onSelect,
}: {
  prog: DisplayProgram;
  isSelected: boolean;
  isSuggested?: boolean;
  onSelect: () => void;
}) {
  const { IconComp } = prog;
  const pillStyle = prog.isLocked
    ? 'opacity-40 cursor-not-allowed bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400'
    : prog.isUnenrolled
      ? 'opacity-40 grayscale cursor-pointer bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400'
      : isSelected
        ? ACTIVE_PILL
        : isSuggested
          ? SUGGESTED_PILL
          : INACTIVE_PILL;

  return (
    <button
      onClick={prog.isLocked ? undefined : onSelect}
      className={`
        relative flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2.5 rounded-2xl border
        text-xs font-bold transition-all active:scale-95
        ${pillStyle}
      `}
      style={{ minWidth: 68 }}
    >
      {prog.isLocked && (
        <Lock size={10} className="absolute top-1.5 right-1.5 text-gray-400" />
      )}
      {isSuggested && !isSelected && !prog.isLocked && (
        <span className="absolute top-1 right-1 text-[8px] text-amber-500">✦</span>
      )}
      <div className="w-[22px] h-[22px] flex items-center justify-center flex-shrink-0">
        {IconComp ? (
          <IconComp className={`w-full h-full ${isSelected ? 'text-white' : isSuggested ? 'text-amber-600' : 'text-gray-600 dark:text-gray-300'}`} />
        ) : (
          <span className="text-base leading-none">💪</span>
        )}
      </div>
      <span className="text-center leading-tight">{prog.label}</span>
      <span className={`text-[10px] font-medium ${isSelected ? 'text-blue-100' : isSuggested ? 'text-amber-500' : 'text-gray-400'}`}>
        {prog.isMaster ? `${prog.children.length} תוכניות` : `רמה ${prog.level}`}
      </span>
    </button>
  );
}

// ─── WorkoutBuilderSheet ──────────────────────────────────────────────────────
export default function WorkoutBuilderSheet({
  mode,
  date: scheduleDateParam,
  defaultProgramIds: defaultProgramIdsParam,
  defaultDuration: defaultDurationParam,
  defaultLocation: defaultLocationParam,
  defaultIntensity: defaultIntensityParam,
  onClose,
}: WorkoutBuilderSheetProps) {
  const { profile } = useUserStore();
  const gender = useUserStore((s) => (s.profile?.core as any)?.gender === 'female' ? 'female' : 'male') as 'male' | 'female';
  const router = useRouter();

  const isScheduleMode = mode === 'schedule' && !!scheduleDateParam;

  // Initialised once from props — stable refs so useState picks them up
  const initLocation = useRef<LocationId>(
    defaultLocationParam && ['park','gym','home'].includes(defaultLocationParam)
      ? (defaultLocationParam as LocationId) : 'park',
  );
  const initDuration = useRef<number>(
    (() => {
      const n = Number(defaultDurationParam);
      return (TIME_OPTIONS as readonly number[]).includes(n) ? n : 45;
    })(),
  );
  const initDifficulty = useRef<DifficultyLevel>(paramToDifficulty(defaultIntensityParam));
  const initProgramId = useRef<string | null>(
    defaultProgramIdsParam ? defaultProgramIdsParam.split(',')[0] ?? null : null,
  );

  // ── Firestore: programs + gear definitions ──────────────────────────────
  const [programs, setPrograms]   = useState<Program[]>([]);
  const [gearDefs, setGearDefs]   = useState<GearDefinition[]>([]);
  useEffect(() => {
    getAllPrograms().then(setPrograms).catch(() => setPrograms([]));
    getAllGearDefinitions().then(setGearDefs).catch(() => setGearDefs([]));
  }, []);

  // ── Form state (all preserved on "שנה משהו" — never reset) ──────────────
  const [availableTime, setAvailableTime]   = useState<number>(initDuration.current);
  const [timeMotivation, setTimeMotivation] = useState<string | null>(null);
  const [showCustomTime, setShowCustomTime] = useState(false);
  const [customTime, setCustomTime]         = useState(35);
  const [difficulty, setDifficulty]         = useState<DifficultyLevel>(initDifficulty.current);
  const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>(
    initProgramId.current ? [initProgramId.current] : [],
  );
  const [selectedChips, setSelectedChips]   = useState<string[]>([]);
  const [autoChips, setAutoChips]           = useState<string[]>([]);
  const [muscleExpanded, setMuscleExpanded] = useState(false);

  // ── Location — resets equipment override when changed ──────────────────
  // Seed priority: URL param → profile location preference → 'park' fallback
  const [location, setLocation] = useState<LocationId>(() => {
    if (defaultLocationParam && (['park', 'gym', 'home'] as string[]).includes(defaultLocationParam)) {
      return defaultLocationParam as LocationId;
    }
    const pref = (profile?.lifestyle as any)?.locationPreference as string | undefined;
    if (pref && (['park', 'gym', 'home'] as string[]).includes(pref)) {
      return pref as LocationId;
    }
    return 'park';
  });
  const handleSetLocation = useCallback((loc: LocationId) => {
    setLocation(loc);
    setEquipmentOverride(null);
  }, []);

  // ── Equipment override — null = use location default, array = user-chosen ─
  const [equipmentOverride, setEquipmentOverride] = useState<string[] | null>(null);

  // ── Schedule-mode only: start time ──────────────────────────────────────
  const [startTime, setStartTime] = useState(() => getNextFullHour());

  // ── Equipment filter sheet (builder-local override) ─────────────────────
  const [showEquipmentSheet, setShowEquipmentSheet] = useState(false);

  // ── Gear nudge drawer — global profile equipment editor ──────────────────
  // Opened by the inline GearNudgeBanner when the user has no equipment saved.
  const [showGearNudgeSheet, setShowGearNudgeSheet] = useState(false);

  // ── Unlock modal (unenrolled program discovery) ─────────────────────────
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  // Domain (push/pull/legs/core) that triggered the unlock modal, so its CTA
  // can route straight to the mini-assessment questionnaire for THAT domain
  // instead of just dismissing (previously: "בקרוב..." + close, no action).
  const [unlockDomain, setUnlockDomain] = useState<string | null>(null);

  // ── Generation ──────────────────────────────────────────────────────────
  const [isLoading, setIsLoading]               = useState(false);
  const [error, setError]                       = useState<string | null>(null);
  const [generatedWorkout, setGeneratedWorkout] = useState<GeneratedWorkout | null>(null);
  const [workoutId, setWorkoutId]               = useState<string>('');
  const [showPreview, setShowPreview]           = useState(false);

  // ── Clear generated workout whenever form fields change ─────────────────
  // This ensures the user always sees a fresh result after tweaking settings.
  useEffect(() => {
    setGeneratedWorkout(null);
    setShowPreview(false);
  }, [location, availableTime, difficulty, selectedProgramIds, selectedChips, equipmentOverride]);

  // ── If no explicit defaultProgramId, fall back to user's active program ──
  const activeTemplateId = profile?.progression?.activePrograms?.[0]?.templateId;
  useEffect(() => {
    if (activeTemplateId && selectedProgramIds.length === 0 && !initProgramId.current) {
      setSelectedProgramIds([activeTemplateId]);
    }
  }, [activeTemplateId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Program → auto-select muscle chips ──────────────────────────────────
  useEffect(() => {
    if (selectedProgramIds.length === 0) {
      setAutoChips([]);
      return;
    }
    const chips = new Set<string>();
    for (const pid of selectedProgramIds) {
      const ap = profile?.progression?.activePrograms?.find(
        p => p.templateId === pid || (p as any).id === pid,
      );
      const focusDomains = (ap?.focusDomains as string[] | undefined)?.length
        ? (ap!.focusDomains as string[])
        : [pid];
      domainsToChipIds(focusDomains).forEach(c => chips.add(c));
    }
    setAutoChips([...chips]);
  }, [selectedProgramIds, profile]);

  // ── Build display program list ─────────────────────────────────────────
  // enrolledIds is lifted here so toggleChip can access it for enrollment gating.
  const enrolledIds = useMemo(() => {
    // Seed from explicit activePrograms templateIds — this is the ground truth
    // for "the user consciously chose this program during onboarding/evolution".
    const ids = new Set<string>(
      profile?.progression?.activePrograms?.map(p => p.templateId) ?? [],
    );
    // Supplement with track keys, but ONLY for known leaf-level slugs.
    // Master-derived track entries written by recalculateMasterLevel
    // (e.g. 'full_body', 'upper_body') are intentionally excluded so a
    // Push-only user is never treated as enrolled in aggregate programs.
    for (const key of Object.keys(profile?.progression?.tracks ?? {})) {
      if (LEAF_SLUGS.has(key)) ids.add(key);
    }
    return ids;
  }, [profile]);

  const displayPrograms: DisplayProgram[] = useMemo(() => {
    const tracks  = profile?.progression?.tracks  ?? {};
    const domains = profile?.progression?.domains ?? {};
    if (enrolledIds.size === 0) return [];

    // Use all Firestore programs when loaded; fall back to enrolled-only
    // while the async fetch is in flight so the UI never flashes empty.
    const sourceIds: string[] = programs.length > 0
      ? programs.map(p => p.id)
      : Array.from(enrolledIds);

    const allProgs = sourceIds.map(id => {
      const doc = programs.find(p => p.id === id);
      const isUnenrolled = !enrolledIds.has(id) && !enrolledIds.has(resolveToSlug(id) || id);
      const isMaster = doc?.isMaster ?? (id in KNOWN_MASTER_PROGRAMS);
      const children: string[] = doc?.subPrograms ?? KNOWN_MASTER_PROGRAMS[id as keyof typeof KNOWN_MASTER_PROGRAMS] ?? [];
      const iconMapEntry = ICON_MAP[id as keyof typeof ICON_MAP];
      const label = iconMapEntry?.label ?? doc?.name ?? SLUG_HEBREW_FALLBACK[id] ?? id;
      const resolvedKey = resolveIconKey(doc?.iconKey, id);
      const IconComp = ICON_MAP[resolvedKey]?.component ?? null;
      const level = isUnenrolled ? 0 : (tracks[id] as any)?.currentLevel ?? (tracks[id] as any)?.level ?? 1;
      const domainEntry = (domains as any)[id];
      const isLocked = domainEntry !== undefined && domainEntry.isUnlocked === false;
      return { id, label, level, isMaster, children, isLocked, isUnenrolled, IconComp };
    }).sort((a, b) => {
      // Enrolled programs first; within each group masters before leaf; then by level desc
      if (!!a.isUnenrolled !== !!b.isUnenrolled) return a.isUnenrolled ? 1 : -1;
      if (a.isMaster !== b.isMaster) return a.isMaster ? -1 : 1;
      return b.level - a.level;
    });

    // ── Master-program containment gate ──────────────────────────────────
    // A master program (isMaster === true) is shown only when:
    //   a. The user's activePrograms explicitly lists it as a templateId, OR
    //   b. At least 2 of its declared child splits appear in enrolledIds.
    // This prevents aggregate shells like "כל הגוף" (full_body children:
    // push/pull/legs/core) or "פלג גוף עליון" (upper_body children: push/pull)
    // from polluting the slider for a user tracking only a single split.
    // Leaf programs (planche, front_lever, individual splits) always pass.
    const isMasterEligible = (prog: DisplayProgram): boolean => {
      if (!prog.isMaster) return true;
      const isExplicitlyActive = profile?.progression?.activePrograms?.some(ap =>
        ap.templateId === prog.id || resolveToSlug(ap.templateId) === prog.id,
      ) ?? false;
      if (isExplicitlyActive) return true;

      // full_body override (09.08.2026, David-approved): the general >=2-of-N containment
      // gate above stays for every OTHER master — full_body specifically requires ALL 4 of
      // its known leaf domains (push/pull/legs/core), not just 2. Keyed by id/slug, NOT a
      // generic "children.length === 4" check — the LIVE Firestore full_body doc's
      // subPrograms has 5 entries (a stray nested "upper_body" reference, a data-quality
      // anomaly, verified 09.08.2026), so a raw count check would silently never fire
      // against real data. KNOWN_MASTER_PROGRAMS.full_body is the authoritative 4-leaf set
      // regardless of what the live doc's subPrograms currently holds.
      const resolvedSlug = resolveToSlug(prog.id) || prog.id;
      if (prog.id === 'full_body' || resolvedSlug === 'full_body') {
        return KNOWN_MASTER_PROGRAMS.full_body.every(childId => {
          const slug = resolveToSlug(childId) || childId;
          return enrolledIds.has(childId) || enrolledIds.has(slug);
        });
      }

      const enrolledChildCount = prog.children.filter(childId => {
        const slug = resolveToSlug(childId) || childId;
        return enrolledIds.has(childId) || enrolledIds.has(slug);
      }).length;
      return enrolledChildCount >= 2;
    };

    // Deduplicate by resolved Hebrew label: if two programs resolve to the
    // exact same display string (e.g., a Firestore-doc-name duplicate and a
    // SLUG_HEBREW_FALLBACK entry both yield "כל הגוף"), keep only the first
    // occurrence so every visible pill has a unique name.
    // Skills like 'planche' and 'front_lever' have their own distinct labels
    // and are intentionally preserved alongside their master program pill.
    const seenLabels = new Set<string>();
    return allProgs.filter(isMasterEligible).filter(p => {
      if (seenLabels.has(p.label)) return false;
      seenLabels.add(p.label);
      return true;
    });
  }, [programs, profile, enrolledIds]);

  // ── Resolve scheduledProgramIds for the generator ──────────────────────
  const resolvedScheduledProgramIds: string[] | undefined = useMemo(() => {
    if (selectedProgramIds.length === 0) return undefined;

    // Build a component-owned ID→slug map from the freshly fetched programs
    // array. This mirrors the exact derivation in buildIdToSlugMapFromPrograms
    // (program-hierarchy.utils.ts line 112) so Firestore UIDs selected via
    // the pill UI are always converted to their registered system slugs
    // (e.g. "mfcuylngkxlqwvufo0zt" → "front_lever") before hitting the
    // engine. Fall back to resolveToSlug() for IDs that are already slugs
    // (e.g. the activeTemplateId seed that populates before programs loads).
    const localSlugMap = new Map<string, string>(
      programs.map(p => [
        p.id,
        p.slug ||
          p.movementPattern ||
          (p.name?.toLowerCase().replace(/[\s-]+/g, '_') ?? p.id),
      ]),
    );
    const toSlug = (id: string): string => localSlugMap.get(id) ?? resolveToSlug(id);

    const result: string[] = [];
    const seen = new Set<string>();
    for (const pid of selectedProgramIds) {
      const slug = toSlug(pid);
      const prog = displayPrograms.find(p => p.id === pid);
      if (prog?.isMaster && prog.children.length > 0) {
        // Master programs: lead with resolved master slug (engine uses index 0
        // as activeProgramId), then expand children so the budget infrastructure
        // has all skill tracks — each child also resolved to its clean slug.
        if (!seen.has(slug)) { result.push(slug); seen.add(slug); }
        for (const child of prog.children) {
          const childSlug = toSlug(child);
          if (!seen.has(childSlug)) { result.push(childSlug); seen.add(childSlug); }
        }
      } else {
        if (!seen.has(slug)) { result.push(slug); seen.add(slug); }
      }
    }
    return result;
  }, [selectedProgramIds, displayPrograms, programs]);

  // ── Derived ────────────────────────────────────────────────────────────
  const effectiveChips = useMemo(
    () => [...new Set([...autoChips, ...selectedChips])],
    [autoChips, selectedChips],
  );

  const derivedRequiredDomains: string[] | undefined = useMemo(
    () =>
      effectiveChips.length > 0
        ? [...new Set(effectiveChips.flatMap(id => MUSCLE_CHIPS.find(c => c.id === id)?.domains ?? []))]
        : undefined,
    [effectiveChips],
  );

  // ── When program pills are selected, derive their allowed movement domains
  // so incompatible muscle chips can be gated (disabled + dimmed). ─────────
  const selectedProgramAllowedDomains: Set<string> = useMemo(() => {
    if (selectedProgramIds.length === 0) return new Set();
    // autoChips are already the union of all selected programs via useEffect;
    // derive their domains to build the allowed set.
    const domains = autoChips.flatMap(id => MUSCLE_CHIPS.find(c => c.id === id)?.domains ?? []);
    return new Set(domains);
  }, [selectedProgramIds, autoChips]);

  // ── Chips → suggest a matching enrolled program ──────────────────────────
  const suggestedProgramId = useMemo(() => {
    if (selectedChips.length === 0 || selectedProgramIds.length > 0) return null;
    const derived = deriveActiveProgramFromMuscleFocus(selectedChips);
    const found = displayPrograms.find(p => p.id === derived && !p.isLocked);
    return found?.id ?? null;
  }, [selectedChips, selectedProgramIds, displayPrograms]);

  // ── Auto-applied program (UI-visible, enters generation) ─────────────────
  // Resolution order (stability fix, 08.07.2026):
  //   explicit pill  >  CU master arbitration  >  chip-suggested program.
  // Previously the CU arbitration lived inside handleGenerate with ZERO UI
  // feedback, and suggestedProgramId was a visual badge that never reached
  // the engine. Both now flow through this single memo: the note below the
  // pills shows the user exactly which program will drive generation.
  const autoAppliedProgram = useMemo<{ ids: string[]; label: string; reason: 'cu' | 'suggested' } | null>(() => {
    if (resolvedScheduledProgramIds) return null; // explicit pill wins — never override
    const toSlug = (id: string): string => {
      const p = programs.find(pr => pr.id === id);
      return p?.slug || p?.movementPattern || resolveToSlug(id) || id;
    };
    const chipsTargetUpperBody = (derivedRequiredDomains ?? []).some(d => d === 'push' || d === 'pull');
    const cuProgram = displayPrograms.find(p => p.id === 'calisthenics_upper');
    if (cuProgram && chipsTargetUpperBody) {
      return {
        ids: ['calisthenics_upper', ...cuProgram.children.map(toSlug)],
        label: cuProgram.label,
        reason: 'cu',
      };
    }
    if (suggestedProgramId) {
      const prog = displayPrograms.find(p => p.id === suggestedProgramId);
      if (prog) {
        const ids = prog.isMaster && prog.children.length > 0
          ? [toSlug(prog.id), ...prog.children.map(toSlug)]
          : [toSlug(prog.id)];
        return { ids: Array.from(new Set(ids)), label: prog.label, reason: 'suggested' };
      }
    }
    return null;
  }, [resolvedScheduledProgramIds, derivedRequiredDomains, displayPrograms, suggestedProgramId, programs]);

  // Maps each coarse movement domain to the program slugs that constitute enrollment
  // in that domain.  If none of these slugs appear in enrolledIds, the user hasn't
  // completed a setup questionnaire for that training area and should be redirected
  // to the unlock flow instead of being allowed to build a conflicting session.
  const DOMAIN_ENROLLMENT_SLUGS: Record<string, string[]> = {
    push: ['push', 'upper_body', 'full_body', 'calisthenics_upper',
           'planche', 'handstand', 'handstand_pushup', 'muscle_up'],
    pull: ['pull', 'upper_body', 'full_body', 'calisthenics_upper',
           'front_lever', 'back_lever', 'one_arm_pullup', 'muscle_up'],
    legs: ['legs', 'lower_body', 'full_body'],
    core: ['core', 'lower_body', 'full_body'],
  };

  // Reverse lookup for the mini-assessment CTA: given a program id/slug
  // (e.g. 'planche', 'front_lever', or already a base category), resolve the
  // single push/pull/legs/core category the mini-questionnaire should assess.
  // Pure logic lives in mini-domain-assessment.ts (independently unit-tested);
  // this just binds it to this component's DOMAIN_ENROLLMENT_SLUGS map.
  const resolveBaseCategoryForThisProgram = useCallback(
    (id: string): string => resolveBaseCategoryForProgramId(id, DOMAIN_ENROLLMENT_SLUGS, resolveToSlug),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const toggleChip = useCallback((id: string) => {
    const chip = MUSCLE_CHIPS.find(c => c.id === id);
    if (chip) {
      const isEnrolledForChip = chip.domains.some(domain => {
        const required = DOMAIN_ENROLLMENT_SLUGS[domain] ?? [domain];
        return required.some(
          slug => enrolledIds.has(slug) || enrolledIds.has(resolveToSlug(slug) || slug),
        );
      });
      if (!isEnrolledForChip) {
        console.log(`[WorkoutBuilder] Chip gated — domain not enrolled: ${id} (${chip.domains.join(', ')})`);
        setUnlockDomain(chip.domains[0] ?? null);
        setShowUnlockModal(true);
        return;
      }
    }
    setSelectedChips(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  }, [enrolledIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Equipment chips — show override if set, else profile.equipment[location] ──
  const equipmentChips = useMemo(() => {
    const ids: string[] = (equipmentOverride ?? ((profile?.equipment as any)?.[location] as string[] | undefined) ?? [])
      .filter((id: string) => id !== BODYWEIGHT_SENTINEL);
    return ids.map(id => {
      const def = gearDefs.find(g => g.id === id);
      const svgPaths = resolveEquipmentSvgPathList(id);
      return {
        id,
        label: def?.name?.he ?? def?.name?.en ?? id,
        iconSrc: svgPaths[0] ?? null,
      };
    });
  }, [equipmentOverride, profile, gearDefs, location]);

  // ── Generate (normal mode) ─────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);
    setError(null);
    try {
      const store = useWeeklyVolumeStore.getState();
      const remaining = (store as any).getRemainingBudget?.() ?? undefined;
      const usagePct  = (store as any).getBudgetUsagePercent?.() ?? undefined;
      const autoBlast = difficulty === 3 && availableTime <= 20;

      // Explicit location choice: keep it (allowHomeOverride:false), but resolve
      // the nearest EQUIPPED park's real gear via GPS (Phase 3a/3b) instead of the
      // old no-GPS path that fell straight to ESSENTIAL_PARK_GEAR.
      const isPark = location === 'park' || location === 'street';
      const parkEquipmentIds = isPark
        ? (await resolveWorkoutContext(profile, location as ExecutionLocation, { allowHomeOverride: false })).availableGear
        : undefined;

      // ── Effective program: explicit pill > CU arbitration > suggested ────
      // Single source: the UI-visible autoAppliedProgram memo (see above).
      // The user sees the exact same program the engine receives — no more
      // silent CU promotion, and the chip-suggested program actually
      // reaches generation instead of being a badge-only hint.
      const effectiveScheduledProgramIds: string[] | undefined =
        resolvedScheduledProgramIds ?? autoAppliedProgram?.ids;
      if (autoAppliedProgram) {
        console.log(
          `[WorkoutBuilder] auto-applied program (${autoAppliedProgram.reason}): ` +
          `[${autoAppliedProgram.ids.join(', ')}]`,
        );
      }

      const result = await generateHomeWorkout({
        userProfile:              profile,
        testLocation:             location as ExecutionLocation,
        availableTime,
        difficulty,
        targetDifficulty:         difficulty,
        intentMode:               autoBlast ? 'blast' : undefined,
        scheduledProgramIds:      effectiveScheduledProgramIds,
        requiredDomains:          derivedRequiredDomains,
        strictDomains:            (derivedRequiredDomains?.length ?? 0) > 0,
        equipmentOverride:        equipmentOverride ?? undefined,
        remainingWeeklyBudget:    remaining > 0 ? remaining : undefined,
        weeklyBudgetUsagePercent: usagePct   > 0 ? usagePct  : undefined,
        parkEquipmentIds:         parkEquipmentIds?.length ? parkEquipmentIds : undefined,
        isManualOverride:         true,
      });
      console.log('🚀 [CustomBuilder] SUCCESS! A brand-new customized workout plan structure was synthesized from scratch:', {
        timestamp: new Date().toISOString(),
        formInputsPassed: { availableTime, difficulty, location, equipmentOverride },
        generatedWorkoutDataStructure: result,
      });
      const newId = `workout-builder-${Date.now()}`;
      setWorkoutId(newId);
      setGeneratedWorkout(result.workout);
      setShowPreview(true);
    } catch (err: unknown) {
      console.error('[WorkoutBuilder] Generation failed:', err);
      setError('לא הצלחנו ליצור אימון. נסה שוב.');
    } finally {
      setIsLoading(false);
    }
  }, [profile, location, availableTime, difficulty, resolvedScheduledProgramIds, autoAppliedProgram, derivedRequiredDomains, equipmentOverride, displayPrograms]);

  // ── Schedule save (schedule mode) ─────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);
  const handleScheduleSave = useCallback(async () => {
    if (!profile || !scheduleDateParam || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await upsertScheduleEntry({
        userId: profile.id,
        date: scheduleDateParam,
        startTime,
        programIds: resolvedScheduledProgramIds ?? [],
        scheduledCategories: ['strength'],
        type: 'training',
        source: 'manual',
        completed: false,
      });
      onClose();
    } catch (err) {
      console.error('[WorkoutBuilder] Schedule save failed:', err);
      setError('שמירה נכשלה. נסה שוב.');
      setIsSaving(false);
    }
  }, [profile, scheduleDateParam, startTime, resolvedScheduledProgramIds, onClose, isSaving]);

  // ── Workout shell for WorkoutPreviewDrawer ─────────────────────────────
  const workoutShell = useMemo(() => {
    if (!generatedWorkout || !workoutId) return null;
    const diffMap: Record<number, 'easy' | 'medium' | 'hard'> = { 1: 'easy', 2: 'medium', 3: 'hard' };
    return {
      id:          workoutId,
      title:       generatedWorkout.title       || 'אימון מותאם אישית',
      description: generatedWorkout.description || '',
      difficulty:  diffMap[generatedWorkout.difficulty] ?? 'medium',
      duration:    generatedWorkout.estimatedDuration,
      // No park context here — let the drawer fall through to the real exercise
      // Bunny thumbnail (heroMedia) instead of a foreign stock gym photo.
      coverImage:  '',
      segments:    [] as [],
    };
  }, [generatedWorkout, workoutId]);

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col"
      dir="rtl"
      style={{
        backgroundColor: 'rgba(255,255,255,0.45)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >

      {/* ── Header ── */}
      <div
        className="flex items-center gap-3 px-4 pb-4 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800"
        style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top, 24px))' }}
      >
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700"
          aria-label="חזור"
        >
          <ArrowRight size={20} className="text-gray-700 dark:text-gray-300" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {isScheduleMode ? 'תזמן אימון' : 'בנה אימון משלך'}
          </h1>
          <p className="text-xs text-gray-400">
            {isScheduleMode ? 'בחר תוכנית ושעה לשמירה בלוז' : 'מותאם אישית לפי הבחירות שלך'}
          </p>
        </div>
      </div>

      {/* ── Scrollable form ── */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-7">

        {/* ── Gear nudge banner ─────────────────────────────────────────────
            Shown only when the user has no equipment configured in their
            profile. Tapping opens an in-place EquipmentFilterSheet so they
            never leave this screen. Hides automatically once the profile is
            saved (useUserStore re-hydrates and the condition becomes false). */}
        {(() => {
          const eq = profile?.equipment as Record<string, string[] | undefined> | undefined;
          const hasAnyEquipment =
            (eq?.home?.length ?? 0) > 0 ||
            (eq?.outdoor?.length ?? 0) > 0 ||
            (eq?.office?.length ?? 0) > 0;
          if (hasAnyEquipment) return null;
          return (
            <button
              type="button"
              onClick={() => setShowGearNudgeSheet(true)}
              className="w-full flex items-start gap-3 px-4 py-3.5 bg-cyan-50 rounded-2xl border border-cyan-100 text-right active:scale-[0.99] transition-transform"
              aria-label="הגדר ציוד לאימון מותאם"
            >
              <Wrench size={18} className="flex-shrink-0 mt-0.5 text-cyan-500" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-cyan-700 leading-snug">
                  רוצים אימון מותאם ב-100% לציוד שלכם?
                </p>
                <p className="text-xs text-cyan-500 mt-0.5">
                  לחצו כאן כדי לסמן מה יש לכם בסביבה
                </p>
              </div>
              <ArrowRight size={15} className="flex-shrink-0 mt-1 text-cyan-400 rotate-180" />
            </button>
          );
        })()}

        {/* ── Schedule mode: date + time ── */}
        {isScheduleMode && scheduleDateParam && (
          <>
            {/* Date display (read-only) */}
            <div className="flex items-center gap-2 px-4 py-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-2xl border border-cyan-100 dark:border-cyan-800">
              <CalendarDays className="w-4 h-4 text-cyan-500 flex-shrink-0" />
              <span className="text-sm font-bold text-cyan-700 dark:text-cyan-300">
                {formatScheduleDate(scheduleDateParam)}
              </span>
            </div>

            {/* Time picker */}
            <Section title="שעה" sub="מתי?">
              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 mb-2">
                <Clock className="w-3.5 h-3.5" />
                שעת התחלה
              </label>
              <DrumTimePicker value={startTime} onChange={setStartTime} />
            </Section>
          </>
        )}

        {/* 1. מיקום וציוד — merged section */}
        <Section title="מיקום וציוד">
          {/* Location grid — 2 options since חדר כושר was removed */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            {LOCATION_OPTIONS.filter((o) => o.id !== 'service').map(({ id, label, sub, Icon }) => {
              const active = location === id;
              return (
                <button
                  key={id}
                  onClick={() => handleSetLocation(id)}
                  className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl border text-xs font-bold transition-all active:scale-95 ${active ? ACTIVE_PILL : INACTIVE_PILL}`}
                >
                  <Icon size={18} className={active ? 'text-white' : 'text-gray-500 dark:text-gray-400'} />
                  <span>{label}</span>
                  <span className={`text-[10px] font-medium ${active ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'}`}>
                    {sub}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Equipment chips row */}
          <div
            className="flex items-center gap-1.5 overflow-x-auto pb-0.5"
            style={{ scrollbarWidth: 'none' }}
          >
            {equipmentChips.map(chip => (
              <span
                key={chip.id}
                className="flex-shrink-0 flex items-center gap-1.5 ps-2.5 pe-3 py-1.5 rounded-full border text-xs font-bold bg-white border-gray-200 text-gray-700 whitespace-nowrap"
              >
                {chip.iconSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={chip.iconSrc}
                    alt=""
                    width={16}
                    height={16}
                    className="object-contain flex-shrink-0"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
                  />
                ) : (
                  <span className="w-4 h-4 rounded-full bg-gray-100 flex-shrink-0" />
                )}
                {chip.label}
              </span>
            ))}
            {equipmentChips.length === 0 && (
              <span className="text-xs text-gray-400 flex items-center gap-1.5 ps-2.5 pe-3 py-1.5">
                <Dumbbell size={13} className="text-gray-400" />
                לפי מיקום
              </span>
            )}
            <button
              onClick={() => setShowEquipmentSheet(true)}
              className="flex-shrink-0 w-8 h-8 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-gray-400 active:bg-gray-100 transition-colors"
              aria-label="ערוך ציוד"
            >
              <Plus size={14} />
            </button>
          </div>
        </Section>

        {/* 2. זמן (hidden in schedule mode) */}
        {!isScheduleMode && (
          <Section title="משך זמן">
            {/* Fixed time buttons + "אחר" */}
            <div className="grid grid-cols-5 gap-2">
              {TIME_OPTIONS.map(t => {
                const active = availableTime === t && !showCustomTime;
                return (
                  <button
                    key={t}
                    onClick={() => {
                      setAvailableTime(t);
                      setShowCustomTime(false);
                      setTimeMotivation(TIME_MOTIVATION[t][gender]);
                    }}
                    className={`flex flex-col items-center gap-0.5 py-3 rounded-2xl border text-xs font-bold transition-all active:scale-95 ${active ? ACTIVE_PILL : INACTIVE_PILL}`}
                  >
                    <span className="text-sm font-bold">{t}</span>
                    <span className={`text-[10px] font-medium ${active ? 'text-blue-100' : 'text-gray-400'}`}>דק&apos;</span>
                  </button>
                );
              })}
              {/* "אחר" button */}
              <button
                onClick={() => {
                  setShowCustomTime(true);
                  setAvailableTime(customTime);
                  setTimeMotivation(TIME_MOTIVATION['other'][gender]);
                }}
                className={`flex flex-col items-center gap-0.5 py-3 rounded-2xl border text-xs font-bold transition-all active:scale-95 ${showCustomTime ? ACTIVE_PILL : INACTIVE_PILL}`}
              >
                <span className="text-sm font-bold">✦</span>
                <span className={`text-[10px] font-medium ${showCustomTime ? 'text-blue-100' : 'text-gray-400'}`}>אחר</span>
              </button>
            </div>

            {/* Motivational text */}
            {timeMotivation && (
              <p className="mt-2 text-xs text-gray-500 text-center italic">{timeMotivation}</p>
            )}

            {/* Custom slider (shown when "אחר" is active) */}
            {showCustomTime && (
              <div className="mt-3 space-y-2" dir="rtl">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-700">{customTime} דק׳</span>
                  <span className="text-xs text-gray-400">
                    {gender === 'female' ? 'תבחרי את הזמן שלך' : 'תבחר את הזמן שלך'}
                  </span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={90}
                  step={5}
                  value={customTime}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setCustomTime(v);
                    setAvailableTime(v);
                  }}
                  className="w-full h-2 rounded-full accent-[#00BAF7] cursor-pointer"
                  style={{ direction: 'rtl' }}
                />
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>90 דק׳</span>
                  <span>10 דק׳</span>
                </div>
              </div>
            )}
          </Section>
        )}

        {/* 3. תוכנית */}
        {displayPrograms.length > 0 && (
          <Section title="תוכנית">
            <div className="overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              <div className="flex gap-2 pb-1" style={{ direction: 'rtl' }}>
                <button
                  onClick={() => setSelectedProgramIds([])}
                  className={`flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2.5 rounded-2xl border text-xs font-bold transition-all active:scale-95 ${selectedProgramIds.length === 0 ? ACTIVE_PILL : INACTIVE_PILL}`}
                  style={{ minWidth: 68 }}
                >
                  <span className="text-base leading-none">✨</span>
                  <span>אוטו</span>
                  <span className={`text-[10px] font-medium ${selectedProgramIds.length === 0 ? 'text-blue-100' : 'text-gray-400'}`}>
                    מומלץ
                  </span>
                </button>
                {displayPrograms.map(prog => (
                  <ProgramPill
                    key={prog.id}
                    prog={prog}
                    isSelected={selectedProgramIds.includes(prog.id)}
                    isSuggested={suggestedProgramId === prog.id}
                    onSelect={prog.isUnenrolled
                      ? () => { setUnlockDomain(resolveBaseCategoryForThisProgram(prog.id)); setShowUnlockModal(true); }
                      : () => {
                          setSelectedProgramIds(prev =>
                            prev.includes(prog.id)
                              ? prev.filter(id => id !== prog.id)
                              : [...prev, prog.id],
                          );
                          // Auto-expand muscle panel so the auto-selected
                          // chip highlights are immediately visible.
                          setMuscleExpanded(true);
                        }
                    }
                  />
                ))}
              </div>
            </div>

            {/* Auto-applied program feedback (stability fix ב׳): the engine
                will train by this program — say so instead of deciding
                silently. Tapping a pill above overrides it. */}
            {autoAppliedProgram && (
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-blue-600 bg-blue-50 rounded-xl px-3 py-2">
                <span className="text-sm leading-none">✦</span>
                <span>
                  יאומן לפי <b>{autoAppliedProgram.label}</b> — הותאם אוטומטית לשרירים שבחרת.
                  אפשר לבחור תוכנית אחרת למעלה.
                </span>
              </div>
            )}

            {selectedProgramIds.length > 0 && (() => {
              const masterProgs = selectedProgramIds
                .map(pid => displayPrograms.find(p => p.id === pid))
                .filter((p): p is DisplayProgram => !!p?.isMaster && p.children.length > 0);
              if (masterProgs.length === 0) return null;
              const allChildLabels = [...new Set(masterProgs.flatMap(p => p.children))].map(cid => {
                const slug = resolveToSlug(cid) || cid;
                return (
                  ICON_MAP[slug as keyof typeof ICON_MAP]?.label ??
                  SLUG_HEBREW_FALLBACK[slug] ??
                  ICON_MAP[cid as keyof typeof ICON_MAP]?.label ??
                  SLUG_HEBREW_FALLBACK[cid] ??
                  slug
                );
              }).join(' · ');
              return (
                <p className="mt-2 text-xs text-[#2b6cb0] font-medium">כולל: {allChildLabels}</p>
              );
            })()}
          </Section>
        )}

        {/* 4. שרירים */}
        <Section title="אזור אימון" sub="(ריק = כל הגוף)">
          {!muscleExpanded ? (
            <button
              onClick={() => setMuscleExpanded(true)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border text-sm font-medium transition-all active:scale-[0.98] ${effectiveChips.length > 0 ? 'bg-sky-50 border-sky-200 text-sky-700' : INACTIVE_PILL}`}
            >
              <span>
                {effectiveChips.length > 0
                  ? `${effectiveChips.length} אזורים נבחרו`
                  : 'כל הגוף (לחץ לסינון)'}
              </span>
              <ChevronDown size={16} className="text-gray-400" />
            </button>
          ) : (
            <div className="space-y-4">
              {/* ── Primary row ── */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 mb-2">שרירים ראשיים</p>
                <div
                  className="flex flex-nowrap gap-3 overflow-x-auto pb-1"
                  style={{ scrollbarWidth: 'none' }}
                >
                  {MUSCLE_CHIPS.filter(c => c.group === 'primary').map(chip => {
                    const isManual = selectedChips.includes(chip.id);
                    const isAuto   = autoChips.includes(chip.id);
                    const active   = isManual || isAuto;
                    const isGated  = selectedProgramAllowedDomains.size > 0 &&
                      !chip.domains.some(d => selectedProgramAllowedDomains.has(d));
                    return (
                      <button
                        key={chip.id}
                        onClick={() => !isGated && toggleChip(chip.id)}
                        disabled={isGated}
                        className={`
                          flex-shrink-0 flex flex-col items-center gap-1 px-2 pt-2 pb-1.5 rounded-2xl
                          text-[11px] font-bold min-w-[52px]
                          ${isGated
                            ? 'opacity-30 cursor-not-allowed text-gray-400'
                            : `transition-all active:scale-95 ${active
                                ? (isManual ? 'bg-[#2b6cb0]/10 text-[#2b6cb0]' : 'bg-sky-100 text-sky-600')
                                : 'text-gray-500 hover:bg-gray-50'}`}
                        `}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={chip.svgPath}
                          alt=""
                          width={28}
                          height={28}
                          className="object-contain"
                          style={{ filter: active ? 'none' : 'grayscale(100%) opacity(0.8)' }}
                          onError={(e) => {
                            const el = e.currentTarget;
                            el.style.display = 'none';
                            const fb = el.nextElementSibling as HTMLElement | null;
                            if (fb) fb.style.display = 'inline';
                          }}
                        />
                        <span className="hidden">{chip.emoji}</span>
                        <span className="text-center leading-tight whitespace-nowrap">{chip.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Secondary row ── */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 mb-2">שרירים משניים</p>
                <div
                  className="flex flex-nowrap gap-3 overflow-x-auto pb-1"
                  style={{ scrollbarWidth: 'none' }}
                >
                  {MUSCLE_CHIPS.filter(c => c.group === 'secondary').map(chip => {
                    const isManual = selectedChips.includes(chip.id);
                    const isAuto   = autoChips.includes(chip.id);
                    const active   = isManual || isAuto;
                    const isGated  = selectedProgramAllowedDomains.size > 0 &&
                      !chip.domains.some(d => selectedProgramAllowedDomains.has(d));
                    return (
                      <button
                        key={chip.id}
                        onClick={() => !isGated && toggleChip(chip.id)}
                        disabled={isGated}
                        className={`
                          flex-shrink-0 flex flex-col items-center gap-1 px-2 pt-2 pb-1.5 rounded-2xl
                          text-[11px] font-bold min-w-[52px]
                          ${isGated
                            ? 'opacity-30 cursor-not-allowed text-gray-400'
                            : `transition-all active:scale-95 ${active
                                ? (isManual ? 'bg-[#2b6cb0]/10 text-[#2b6cb0]' : 'bg-sky-100 text-sky-600')
                                : 'text-gray-500 hover:bg-gray-50'}`}
                        `}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={chip.svgPath}
                          alt=""
                          width={28}
                          height={28}
                          className="object-contain"
                          style={{ filter: active ? 'none' : 'grayscale(100%) opacity(0.8)' }}
                          onError={(e) => {
                            const el = e.currentTarget;
                            el.style.display = 'none';
                            const fb = el.nextElementSibling as HTMLElement | null;
                            if (fb) fb.style.display = 'inline';
                          }}
                        />
                        <span className="hidden">{chip.emoji}</span>
                        <span className="text-center leading-tight whitespace-nowrap">{chip.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={() => setMuscleExpanded(false)}
                className="w-full flex items-center justify-center gap-1 py-1 text-xs text-gray-400 active:opacity-70"
              >
                <ChevronUp size={14} />
                <span>סגור</span>
              </button>
            </div>
          )}
        </Section>

        {/* 5. עצימות — bolt selector */}
        <Section title="עוצמה">
          <div className="flex gap-2">
            {([1, 2, 3] as DifficultyLevel[]).map(level => {
              const active = difficulty === level;
              return (
                <button
                  key={level}
                  onClick={() => setDifficulty(level)}
                  className={`flex-1 flex flex-col items-center gap-2 py-3 rounded-2xl border transition-all active:scale-95 ${active ? ACTIVE_PILL : INACTIVE_PILL}`}
                >
                  <span className="flex items-center gap-0.5">
                    {[0, 1, 2].map(i => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src="/icons/ui/Bolt.svg"
                        alt=""
                        width={16}
                        height={16}
                        style={{
                          filter: i < level
                            ? (active ? BOLT_FILTER_FILLED_ACTIVE : BOLT_FILTER_FILLED_INACTIVE)
                            : (active ? BOLT_FILTER_EMPTY_ACTIVE  : BOLT_FILTER_EMPTY_INACTIVE),
                        }}
                      />
                    ))}
                  </span>
                  <span className={`text-xs font-bold ${active ? 'text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                    {BOLT_LABELS[level]}
                  </span>
                </button>
              );
            })}
          </div>
          {/* Auto-blast hint when כוח + short time */}
          {difficulty === 3 && availableTime <= 20 && (
            <p className="mt-2 text-xs text-center text-amber-600 font-medium">
              ⚡ אימון קצר + עצימות גבוהה → בלאסט אוטומטי
            </p>
          )}
        </Section>

      </div>

      {/* ── Error ── */}
      {error && (
        <div className="px-4 pb-2">
          <p className="text-sm text-red-500 text-center bg-red-50 rounded-xl py-2 px-3">{error}</p>
        </div>
      )}

      {/* ── CTA ── */}
      <div
        className="px-4 pt-3 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
      >
        {isScheduleMode ? (
          <button
            onClick={handleScheduleSave}
            disabled={isSaving || !profile}
            className="w-full h-14 rounded-2xl font-bold text-base text-black flex items-center justify-center gap-2 shadow-lg shadow-cyan-400/20 disabled:opacity-50 transition-all active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #00BAF7 0%, #0CF2E3 100%)' }}
          >
            {isSaving ? (
              <>
                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                <span>שומר...</span>
              </>
            ) : 'שמור ללוז ←'}
          </button>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={isLoading || !profile}
            className="w-full h-14 rounded-2xl font-bold text-base text-black flex items-center justify-center gap-2 shadow-lg shadow-cyan-400/20 disabled:opacity-50 transition-all active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #00BAF7 0%, #0CF2E3 100%)' }}
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                <span>מייצר אימון...</span>
              </>
            ) : 'צור אימון'}
          </button>
        )}
      </div>

      {/* ── Unlock modal (unenrolled program discovery) ── */}
      {showUnlockModal && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40"
          onClick={() => setShowUnlockModal(false)}
        >
          <div
            className="w-full max-w-md mx-auto mb-8 bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-6 space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔓</span>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">פתיחת תוכנית חדשה</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              עדיין לא הערכנו את הרמה שלך באזור הזה. בצע/י מבדק כוח קצר של דקה כדי לפתוח את התוכנית.
            </p>
            <button
              onClick={() => {
                const domain = unlockDomain ?? 'push';
                setShowUnlockModal(false);
                startMiniDomainAssessment(router, domain);
              }}
              className="w-full py-3 rounded-2xl bg-[#00BAF7] text-white text-sm font-bold"
            >
              בצע/י מבדק קצר
            </button>
            <button
              onClick={() => setShowUnlockModal(false)}
              className="w-full py-2 rounded-2xl text-sm font-bold text-gray-500 dark:text-gray-400"
            >
              אולי מאוחר יותר
            </button>
          </div>
        </div>
      )}

      {/* ── Equipment filter sheet (builder-local override, mode=filter) ── */}
      <EquipmentFilterSheet
        isOpen={showEquipmentSheet}
        onClose={() => setShowEquipmentSheet(false)}
        initialIds={
          equipmentOverride
            ?? ((profile?.equipment as any)?.[location] as string[] | undefined)
            ?? []
        }
        onApply={(ids) => setEquipmentOverride(ids)}
        activeLocation={location === 'service' ? undefined : location}
      />

      {/* ── Gear nudge sheet (global profile equipment editor, mode=profile) ─
          Writes to Firestore users/{uid}.equipment.home and re-hydrates
          useUserStore automatically. The GearNudgeBanner above will hide
          itself on next render because the profile now has equipment. ── */}
      <EquipmentFilterSheet
        isOpen={showGearNudgeSheet}
        onClose={() => setShowGearNudgeSheet(false)}
        initialIds={
          (profile?.equipment as Record<string, string[] | undefined> | undefined)?.home ?? []
        }
        mode="profile"
        onApply={() => setShowGearNudgeSheet(false)}
      />

      {/* ── Preview drawer (normal mode only) ── */}
      {!isScheduleMode && (
        <WorkoutPreviewDrawer
          isOpen={showPreview}
          onClose={() => setShowPreview(false)}
          workout={workoutShell}
          generatedWorkout={generatedWorkout}
          workoutLocation={location}
        />
      )}
    </div>
  );
}
