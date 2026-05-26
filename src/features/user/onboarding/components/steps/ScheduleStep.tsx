'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Coins, Check, Calendar, Clock, ChevronDown, Lightbulb, RefreshCw,
  Sofa, Footprints, Flame, Building2, TreePine, Dumbbell, Home as HomeIcon,
  Bike, Sparkles, Heart, Zap, AlertTriangle, Moon, X,
} from 'lucide-react';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { getOnboardingLocale, type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';
import { Analytics } from '@/features/analytics/AnalyticsService';
import { IS_COIN_SYSTEM_ENABLED } from '@/config/feature-flags';
import StickyActionButton from '@/components/ui/StickyActionButton';
import { useSuppressBottomNav } from '@/features/parks/core/hooks/useSuppressBottomNav';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import {
  buildDefaultTemplate,
  validateSchedule,
  partitionWarnings,
} from '@/features/schedule/engine/scheduleRules';
import {
  type DayOfWeek,
  type PrioritizedSkill,
  type ProgramId,
  type ScheduleDay,
  type ScheduleItemId,
  type SkillId,
  ALL_SKILL_IDS,
  ALL_PROGRAM_IDS,
  MOVEMENT_OF,
  MIN_REST_HOURS,
  SKILL_DISPLAY,
} from '@/features/schedule/types/smartSchedule.types';

interface ScheduleStepProps {
  onNext: () => void;
  isJIT?: boolean;
  isLastStep?: boolean;
}

const DAYS_HEBREW = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

// Coin Fly Animation Component - COIN_SYSTEM_PAUSED: Hidden when disabled
function CoinFly({ 
  startPos, 
  endPos, 
  amount, 
  onComplete 
}: { 
  startPos: { x: number; y: number } | null; 
  endPos: { x: number; y: number } | null;
  amount: number;
  onComplete: () => void;
}) {
  // COIN_SYSTEM_PAUSED: Re-enable in April
  if (!IS_COIN_SYSTEM_ENABLED) {
    // Still trigger onComplete to not break the flow
    React.useEffect(() => {
      onComplete();
    }, [onComplete]);
    return null;
  }
  if (!startPos || !endPos) return null;

  return (
    <motion.div
      initial={{ 
        x: startPos.x - 30,
        y: startPos.y - 12,
        scale: 1,
        opacity: 1
      }}
      animate={{ 
        x: endPos.x - 30,
        y: endPos.y - 12,
        scale: [1, 1.3, 0.8],
        opacity: [1, 1, 0]
      }}
      exit={{ opacity: 0, scale: 0 }}
      transition={{ 
        duration: 0.9,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      onAnimationComplete={onComplete}
      className="fixed pointer-events-none z-[9999]"
      style={{ left: 0, top: 0, pointerEvents: 'none' }}
    >
      <motion.div 
        className="flex items-center gap-1 bg-yellow-200 text-yellow-800 rounded-full px-2 py-1 shadow-lg"
        animate={{ rotate: [0, 180, 360] }}
        transition={{ duration: 0.9, ease: "linear" }}
      >
        <Coins size={16} className="text-yellow-800" strokeWidth={2.5} />
        <span className="text-xs font-bold font-simpler">+{amount}</span>
      </motion.div>
    </motion.div>
  );
}


// ── Smart Schedule v1.3 — Wizard catalog ─────────────────────────────────
// The popover lets users pick from a curated v1.3 menu. These IDs match
// SkillId / ProgramId verbatim and are written into recurringTemplate as-is.
type WizardOption = {
  id: ScheduleItemId;
  kind: 'program' | 'skill';
  labelHe: string;
  labelEn: string;
};

const WIZARD_OPTIONS: WizardOption[] = [
  { id: 'UPPER_BODY', kind: 'program', labelHe: 'פלג גוף עליון', labelEn: 'Upper Body' },
  { id: 'FULL_BODY', kind: 'program', labelHe: 'כל הגוף', labelEn: 'Full Body' },
  { id: 'PLANCHE', kind: 'skill', labelHe: "פלאנץ׳", labelEn: 'Planche' },
  { id: 'FRONT_LEVER', kind: 'skill', labelHe: 'פרונט לבר', labelEn: 'Front Lever' },
  { id: 'HSPU', kind: 'skill', labelHe: 'HSPU', labelEn: 'HSPU' },
  { id: 'OAPU', kind: 'skill', labelHe: 'מתח יד אחת', labelEn: 'OAPU' },
  { id: 'MUSCLE_UP', kind: 'skill', labelHe: 'עליית כוח', labelEn: 'Muscle-Up' },
  { id: 'HANDSTAND', kind: 'skill', labelHe: 'עמידת ידיים', labelEn: 'Handstand' },
];

// ── Active-program → ScheduleItemId resolver ─────────────────────────────
// Maps a Firestore UserActiveProgram's name or templateId to our internal
// SkillId / ProgramId taxonomy. This is the bridge between what Firestore
// stores and what the rule engine understands.

// Maps every slug that can appear in sessionStorage `onboarding_skill_focus`
// or in UserActiveProgram.templateId to our internal ScheduleItemId taxonomy.
const SLUG_TO_SCHEDULE_ID: Record<string, ScheduleItemId> = {
  // ── Skills (exact slugs from program-path/page.tsx SKILL_PROGRAMS) ──
  planche: 'PLANCHE',
  front_lever: 'FRONT_LEVER',
  hspu: 'HSPU',
  oapu: 'OAPU',
  one_arm_pullup: 'OAPU',       // program-path slug
  muscle_up: 'MUSCLE_UP',
  handstand: 'HANDSTAND',
  // ── Programs ──
  calisthenics_upper: 'UPPER_CALISTHENICS',  // master chip in program-path
  upper_calisthenics: 'UPPER_CALISTHENICS',
  full_body: 'FULL_BODY',
  upper_body: 'UPPER_BODY',
};

function resolveScheduleId(name: string, templateId: string): ScheduleItemId | null {
  // 1. Exact slug match (covers both sessionStorage slugs and templateId)
  const slug = templateId.toLowerCase().replace(/-/g, '_');
  const slugMatch = SLUG_TO_SCHEDULE_ID[slug];
  if (slugMatch) return slugMatch;

  // 2. Substring name matching (Hebrew + English) for legacy UserActiveProgram.name
  const n = name.toLowerCase();
  if (n.includes('פלאנץ') || n.includes('planche')) return 'PLANCHE';
  if (n.includes('פרונט') || n.includes('front lever') || n.includes('front_lever')) return 'FRONT_LEVER';
  if (n.includes('hspu') || n.includes('handstand push')) return 'HSPU';
  if (n.includes('מתח יד אחת') || n.includes('oapu') || n.includes('one arm')) return 'OAPU';
  if (n.includes('עליית כוח') || n.includes('muscle up') || n.includes('muscle-up')) return 'MUSCLE_UP';
  if (n.includes('עמידת ידיים') || n.includes('handstand')) return 'HANDSTAND';
  if (n.includes('כל הגוף') || n.includes('full body') || n.includes('full_body')) return 'FULL_BODY';
  if (n.includes('עליון') || n.includes('upper body') || n.includes('upper_body')) return 'UPPER_BODY';
  if (n.includes('קליסטניקס') || n.includes('calisthenics')) return 'UPPER_CALISTHENICS';
  return null;
}

// Default seed — only used if user has zero active programs
const DEFAULT_SEED_PROGRAMS: ProgramId[] = ['UPPER_BODY'];
const DEFAULT_SEED_SKILLS: PrioritizedSkill[] = [];

export default function ScheduleStep({ onNext, isJIT, isLastStep }: ScheduleStepProps) {
  // Focus mode — suppress global bottom navbar while wizard is active.
  useSuppressBottomNav();

  const { updateData, data, claimReward, hasClaimedReward, coins } = useOnboardingStore();

  // ── Derive active programs/skills for template seeding + popover filter ───
  //
  // Data-source priority (first non-empty wins):
  //   1. sessionStorage `onboarding_skill_focus`  — set by program-path/page.tsx
  //      during FRESH onboarding. Contains lowercase slugs like ['planche', 'front_lever'].
  //   2. sessionStorage `onboarding_program_path` — fallback when no skills chosen
  //      (health → FULL_BODY, body_focus → UPPER_BODY).
  //   3. useUserStore activePrograms              — existing user re-entering LifestyleWizard.
  //   4. DEFAULT_SEED_PROGRAMS                    — absolute last resort.
  const userProfile = useUserStore((s) => s.profile);

  const { activeWizardOptions, seedPrograms, seedSkills } = useMemo(() => {
    const resolved: Array<{ id: ScheduleItemId; source: 'skill' | 'program'; name: string }> = [];
    const seen = new Set<ScheduleItemId>();

    const addId = (id: ScheduleItemId) => {
      if (seen.has(id)) return;
      seen.add(id);
      const source = (ALL_SKILL_IDS as readonly string[]).includes(id) ? 'skill' : 'program';
      const label = SKILL_DISPLAY[id]?.shortName ?? id;
      resolved.push({ id, source, name: label });
    };

    // ── Source 1: sessionStorage onboarding_skill_focus ─────────────────────
    if (typeof window !== 'undefined') {
      try {
        const rawSkills = sessionStorage.getItem('onboarding_skill_focus');
        if (rawSkills) {
          const slugs: string[] = JSON.parse(rawSkills);
          slugs.forEach((s) => {
            const id = SLUG_TO_SCHEDULE_ID[s.toLowerCase()];
            if (id) addId(id);
          });
        }
      } catch { /* ignore parse errors */ }

      // ── Source 2: onboarding_program_path fallback ────────────────────────
      if (resolved.length === 0) {
        try {
          const programPath = sessionStorage.getItem('onboarding_program_path');
          if (programPath === 'health') addId('FULL_BODY');
          else if (programPath === 'body_focus') addId('UPPER_BODY');
        } catch { /* ignore */ }
      }
    }

    // ── Source 3: existing user's Firestore active programs ─────────────────
    if (resolved.length === 0) {
      for (const ap of userProfile?.progression?.activePrograms ?? []) {
        const id = resolveScheduleId(ap.name ?? '', ap.templateId ?? '');
        if (id) addId(id);
      }
    }

    // ── Build wizard option list (respects selection order) ─────────────────
    const options: WizardOption[] = resolved.map((r) => {
      const baseOption = WIZARD_OPTIONS.find((o) => o.id === r.id);
      return baseOption ?? {
        id: r.id,
        kind: r.source,
        labelHe: SKILL_DISPLAY[r.id]?.shortName ?? r.name,
        labelEn: r.id,
      };
    });

    // ── Hybrid option (§4.3): inject UPPER_CALISTHENICS when 2+ hard skills ──
    // `buildDefaultTemplate` auto-fills overflow days with UPPER_CALISTHENICS.
    // The popover must include it as a selectable/deselectable row so the user
    // can see and manage that auto-filled state on Thursday (and any overflow day).
    const hardSkillCount = resolved.filter((r) =>
      (ALL_SKILL_IDS as readonly string[]).includes(r.id) && r.id !== 'HANDSTAND',
    ).length;
    const hybridAlreadyPresent = options.some((o) => o.id === 'UPPER_CALISTHENICS');
    if (hardSkillCount >= 2 && !hybridAlreadyPresent) {
      options.push(
        WIZARD_OPTIONS.find((o) => o.id === 'UPPER_CALISTHENICS') ?? {
          id: 'UPPER_CALISTHENICS',
          kind: 'program',
          labelHe: 'קליסט. עליון',
          labelEn: 'Upper Calisthenics',
        },
      );
    }

    // ── Typed seeds for the rule engine ──────────────────────────────────────
    const programs: ProgramId[] = resolved
      .filter((r) => (ALL_PROGRAM_IDS as readonly string[]).includes(r.id))
      .map((r) => r.id as ProgramId);

    const skills: PrioritizedSkill[] = resolved
      .filter((r) => (ALL_SKILL_IDS as readonly string[]).includes(r.id))
      .map((r, idx) => ({
        id: r.id as SkillId,
        priority: idx + 1,
        movementType: (MOVEMENT_OF[r.id] === 'MIXED' ? 'DYNAMIC' : MOVEMENT_OF[r.id]) as any,
        isFreeSlot: r.id === 'HANDSTAND',
        minRestHours: MIN_REST_HOURS[r.id] ?? 24,
        countsTowardCap: r.id !== 'HANDSTAND',
      }));

    return {
      activeWizardOptions: options.length > 0 ? options : WIZARD_OPTIONS,
      seedPrograms: programs.length > 0 ? programs : DEFAULT_SEED_PROGRAMS,
      seedSkills: skills,
    };
  }, [userProfile]);

  // Get current language
  const savedLanguage = typeof window !== 'undefined'
    ? (sessionStorage.getItem('onboarding_language') || 'he') as OnboardingLanguage
    : 'he';
  const locale = getOnboardingLocale(savedLanguage);
  const isHebrew = savedLanguage === 'he';

  // Get gender from sessionStorage
  const gender = typeof window !== 'undefined'
    ? (sessionStorage.getItem('onboarding_personal_gender') || 'male') as 'male' | 'female'
    : 'male';
  
  // Gender-aware translation helper
  const t = (male: string, female: string) => gender === 'female' ? female : male;

  // ── Deep History (merged from HistoryStep) ──────────────────────
  const [historyFreq, setHistoryFreq] = useState<string>(data.historyFrequency || '');
  const [historyLocs, setHistoryLocs] = useState<string[]>(data.historyLocations || []);
  const [historySpts, setHistorySpts] = useState<string[]>(data.historySports || []);
  const historyDone = historyFreq !== '';

  const FREQ_OPTIONS = [
    { id: 'none',  label: isHebrew ? 'לא התאמנתי' : "I didn't train", icon: Sofa,       bg: 'bg-slate-50', color: 'text-slate-500' },
    { id: '1-2',   label: isHebrew ? '1-2 פעמים בשבוע' : '1-2/week',   icon: Footprints, bg: 'bg-blue-50',  color: 'text-blue-500'  },
    { id: '3+',    label: isHebrew ? '3+ פעמים בשבוע' : '3+/week',     icon: Flame,      bg: 'bg-orange-50',color: 'text-orange-500' },
  ];
  const LOC_OPTIONS = [
    { id: 'studio', label: isHebrew ? 'סטודיו/חוגים' : 'Studio',  icon: Building2 },
    { id: 'park',   label: isHebrew ? 'גינת כושר' : 'Park',       icon: TreePine },
    { id: 'home',   label: isHebrew ? 'בית' : 'Home',              icon: HomeIcon },
    { id: 'gym',    label: isHebrew ? 'חדר כושר' : 'Gym',          icon: Dumbbell },
  ];
  const SPORT_OPTIONS = [
    { id: 'running',  label: isHebrew ? 'ריצה' : 'Running',      icon: Zap },
    { id: 'swimming', label: isHebrew ? 'שחייה' : 'Swimming',    icon: Heart },
    { id: 'yoga',     label: isHebrew ? 'יוגה/פילאטיס' : 'Yoga', icon: Sparkles },
    { id: 'cycling',  label: isHebrew ? 'רכיבה' : 'Cycling',     icon: Bike },
    { id: 'strength', label: isHebrew ? 'כוח' : 'Strength',      icon: Dumbbell },
    { id: 'cardio',   label: isHebrew ? 'קרדיו' : 'Cardio',      icon: Heart },
    { id: 'crossfit', label: isHebrew ? 'קרוספיט' : 'CrossFit',  icon: Flame },
  ];

  const handleHistoryFreq = (id: string) => {
    setHistoryFreq(id);
    updateData({ historyFrequency: id });
  };
  const toggleHistoryLoc = (id: string) => {
    const next = historyLocs.includes(id) ? historyLocs.filter(l => l !== id) : [...historyLocs, id];
    setHistoryLocs(next);
    updateData({ historyLocations: next });
  };
  const toggleHistorySport = (id: string) => {
    const next = historySpts.includes(id) ? historySpts.filter(s => s !== id) : [...historySpts, id];
    setHistorySpts(next);
    updateData({ historySports: next });
  };

  // Recommended frequency (default 3, can be based on goal)
  const RECOMMENDED_FREQUENCY = 3;

  // State - Default to recommended frequency
  const [frequency, setFrequency] = useState<number>(data.trainingDays || RECOMMENDED_FREQUENCY);

  // ── [Smart Schedule v1.3] Schedule grid state ───────────────────────────
  // Source of truth for the per-day plan. Replaces the legacy `selectedDays`
  // numeric array. `selectedDays` is now derived for downstream gating
  // (canContinue, reward animation triggers) so the rest of the file does
  // not need to know about the new data shape.
  const initialFrequency = data.trainingDays || RECOMMENDED_FREQUENCY;
  const [scheduleGrid, setScheduleGrid] = useState<ScheduleDay[]>(() => {
    // If returning to the step, rehydrate from prior selections.
    if (data.scheduleGridSessions && data.scheduleGridSessions.length === 7) {
      return data.scheduleGridSessions.map((entry) => ({
        dayOfWeek: entry.dayOfWeek as DayOfWeek,
        sessions: entry.skillIds.map((skillId) => ({
          skillId: skillId as ScheduleItemId,
          volumePercent: 100,
          sessionType: 'FULL' as const,
        })),
        isRestDay: entry.skillIds.length === 0,
        warnings: [],
      }));
    }
    if (data.scheduleDayIndices && data.scheduleDayIndices.length > 0) {
      // Legacy shape — translate to grid by placing the default seed item
      // on each previously-selected day.
      return Array.from({ length: 7 }, (_, dow) => {
        const isPicked = data.scheduleDayIndices?.includes(dow) ?? false;
        return {
          dayOfWeek: dow as DayOfWeek,
          sessions: isPicked
            ? [{ skillId: 'UPPER_BODY' as ScheduleItemId, volumePercent: 100, sessionType: 'FULL' as const }]
            : [],
          isRestDay: !isPicked,
          warnings: [],
        };
      });
    }
    // Use the resolved seeds so the template reflects the user's actual programs.
    return buildDefaultTemplate(seedPrograms, seedSkills, initialFrequency);
  });

  // Derived: which day indices currently have at least one session.
  const selectedDays = useMemo(
    () => scheduleGrid.filter((d) => d.sessions.length > 0).map((d) => d.dayOfWeek as number),
    [scheduleGrid],
  );

  // Live validation — re-runs whenever the grid mutates.
  const liveWarnings = useMemo(() => validateSchedule(scheduleGrid), [scheduleGrid]);
  const { errors: liveErrors, warns: liveWarns } = useMemo(
    () => partitionWarnings(liveWarnings),
    [liveWarnings],
  );

  // Popover state — which day card has its bubble open (-1 = closed).
  const [openPopoverDay, setOpenPopoverDay] = useState<number>(-1);
  const [time, setTime] = useState<string>(data.trainingTime || '18:00');
  // Notification permission is now handled exclusively by the dedicated
  // "notifications" step in LifestyleWizard (which invokes the native
  // FCM pipeline via initPushNotifications + saveNotificationPrefs).
  // The legacy inline Web Notification.requestPermission toggle was
  // removed here to eliminate the dual-API conflict.
  const [calendarSyncEnabled, setCalendarSyncEnabled] = useState<boolean>(() => {
    return (data as any).calendarSyncEnabled ?? true; // ON by default
  });
  const [showRecommendation, setShowRecommendation] = useState<boolean>(false);
  
  // Auto-reveal animation states
  const [showDaysSection, setShowDaysSection] = useState<boolean>(false);
  const [daysPulse, setDaysPulse] = useState<boolean>(false);
  
  // Coin animation states
  const [flyingCoin, setFlyingCoin] = useState<{ 
    startPos: { x: number; y: number } | null;
    endPos: { x: number; y: number } | null;
    amount: number;
  } | null>(null);
  
  // Refs for badge positions
  const frequencyBadgeRef = useRef<HTMLDivElement>(null);
  const daysBadgeRef = useRef<HTMLDivElement>(null);
  const timeBadgeRef = useRef<HTMLDivElement>(null);
  const coinTargetPos = useRef<{ x: number; y: number }>({ x: 50, y: 50 });
  
  useEffect(() => {
    coinTargetPos.current = { 
      x: typeof window !== 'undefined' ? window.innerWidth - 80 : 300,
      y: 80
    };
  }, []);
  
  const triggerCoinFly = (badgeRef: React.RefObject<HTMLDivElement | HTMLButtonElement>, amount: number) => {
    if (!badgeRef.current) return;
    const badgeRect = badgeRef.current.getBoundingClientRect();
    setFlyingCoin({
      startPos: { x: badgeRect.left + badgeRect.width / 2, y: badgeRect.top + badgeRect.height / 2 },
      endPos: coinTargetPos.current,
      amount
    });
  };
  
  const handleCoinFlyComplete = () => setFlyingCoin(null);
  
  // Progressive disclosure - Show time section when days are fully selected
  const [showTimeSection, setShowTimeSection] = useState(false);

  const [hours, minutes] = time.split(':').map(Number);

  // Strict Progressive Disclosure - Auto-reveal Days section after 800ms on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowDaysSection(true);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  // Show time section with staggered delay after days section appears
  useEffect(() => {
    // Only reveal time section if:
    // 1. Days section is visible
    // 2. AND days selection matches frequency (can continue)
    if (showDaysSection && selectedDays.length === frequency && frequency > 0) {
      if (!showTimeSection) {
        // Wait 400ms after days are ready to reveal time picker
        const timer = setTimeout(() => setShowTimeSection(true), 400);
        return () => clearTimeout(timer);
      }
    } else {
      if (showTimeSection) setShowTimeSection(false);
    }
  }, [showDaysSection, selectedDays.length, frequency, showTimeSection]);

  const handleFrequencySelect = (value: number) => {
    setFrequency(value);
    // Regenerate the schedule grid via the rule engine when frequency changes,
    // using the user's real active programs so the auto-fill is correct.
    setScheduleGrid(buildDefaultTemplate(seedPrograms, seedSkills, value));
    setOpenPopoverDay(-1);
    // Trigger pulse animation on Days section
    setDaysPulse(true);
    setTimeout(() => setDaysPulse(false), 500);
    if (showTimeSection) {
      setShowTimeSection(false);
    }
    if (!hasClaimedReward('SCHEDULE_FREQUENCY_REWARD')) {
      const wasClaimed = claimReward('SCHEDULE_FREQUENCY_REWARD', 20);
      if (wasClaimed) triggerCoinFly(frequencyBadgeRef, 20);
    }
  };

  // ── Day card / popover handlers ──────────────────────────────────────
  const handleDayCardClick = (dayIndex: number) => {
    setOpenPopoverDay((prev) => (prev === dayIndex ? -1 : dayIndex));
  };

  const handleClosePopover = () => setOpenPopoverDay(-1);

  // Toggle a single program/skill on a given day. Maintains the
  // sessions[] array shape and the isRestDay flag.
  const handleSessionToggle = (dayIndex: number, optionId: ScheduleItemId) => {
    setScheduleGrid((prev) =>
      prev.map((day) => {
        if (day.dayOfWeek !== dayIndex) return day;
        const exists = day.sessions.some((s) => s.skillId === optionId);
        const nextSessions = exists
          ? day.sessions.filter((s) => s.skillId !== optionId)
          : [
              ...day.sessions,
              { skillId: optionId, volumePercent: 100, sessionType: 'FULL' as const },
            ];
        return {
          ...day,
          sessions: nextSessions,
          isRestDay: nextSessions.length === 0,
        };
      }),
    );
    if (
      selectedDays.length + 1 === frequency &&
      !hasClaimedReward('SCHEDULE_DAYS_REWARD')
    ) {
      const wasClaimed = claimReward('SCHEDULE_DAYS_REWARD', 30);
      if (wasClaimed) triggerCoinFly(daysBadgeRef, 30);
    }
  };

  // Mark the day as a rest day — clears all sessions.
  const handleSetRestDay = (dayIndex: number) => {
    setScheduleGrid((prev) =>
      prev.map((day) =>
        day.dayOfWeek === dayIndex
          ? { ...day, sessions: [], isRestDay: true }
          : day,
      ),
    );
  };

  const handleContinue = async () => {
    if (selectedDays.length === 0) return;

    const dayMap = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
    const scheduleDays = selectedDays.map((index) => dayMap[index]).sort();

    // ── [Smart Schedule v1.3] UTS Bridge — build recurringTemplate ───────
    // Maps Hebrew day letter → array of program/skill IDs for that day.
    // This is what the UTS hydrator reads to seed userSchedule documents,
    // achieving parity with the running onboarding flow.
    const recurringTemplate: Record<string, string[]> = {};
    const scheduleGridSessions = scheduleGrid.map((d) => ({
      dayOfWeek: d.dayOfWeek as number,
      skillIds: d.sessions.map((s) => s.skillId as string),
    }));
    for (const day of scheduleGrid) {
      if (day.sessions.length === 0) continue;
      const letter = dayMap[day.dayOfWeek];
      // Only the persisted program/skill IDs go into the template.
      // HANDSTAND is intentionally retained as a valid template entry —
      // upstream UTS treats unknown program IDs as opaque pass-through
      // and falls back to lifestyle.scheduleDays when no program matches.
      recurringTemplate[letter] = day.sessions.map((s) => s.skillId as string);
    }

    updateData({
      trainingDays: frequency,
      trainingTime: time,
      scheduleDayIndices: selectedDays,
      scheduleDays: scheduleDays,
      recurringTemplate,
      scheduleGridSessions,
      historyFrequency: historyFreq,
      historyLocations: historyLocs,
      historySports: historySpts,
      ...(calendarSyncEnabled && { calendarSyncEnabled: true } as any),
    });

    await Analytics.logOnboardingStepComplete('SCHEDULE', 0);
    onNext();
  };

  // Can continue when at least one training day is set and there are no
  // hard ERR-level violations from the rule engine. Soft warnings do NOT
  // block — the user is informed but can proceed.
  const canContinue =
    frequency > 0 &&
    selectedDays.length > 0 &&
    liveErrors.length === 0;

  // Recommendation logic — uses the local historyFreq state (synced to store)
  const showRecommendationA = historyFreq === 'none' && frequency >= 3;
  const showRecommendationB = (historyFreq === '1-2' || historyFreq === '3+') && frequency === 1;
  const hasRecommendation = showRecommendationA || showRecommendationB;

  return (
    <div dir="rtl" className="w-full max-w-md mx-auto px-4 py-4 flex flex-col min-h-screen relative">
      {/* Coin Fly Animation */}
      <AnimatePresence>
        {flyingCoin && (
          <CoinFly
            startPos={flyingCoin.startPos}
            endPos={flyingCoin.endPos}
            amount={flyingCoin.amount}
            onComplete={handleCoinFlyComplete}
          />
        )}
      </AnimatePresence>
      
      {/* Compact Header - Icon Inline with Title */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4"
      >
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 bg-[#5BC2F2]/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <Calendar size={20} className="text-[#5BC2F2]" />
          </div>
          <h2 className="text-xl font-black text-slate-900">
            {isHebrew ? 'מתי נתאמן?' : 'When do we train?'}
          </h2>
        </div>
        <p className="text-sm text-slate-500 mr-[52px]">
          {isHebrew ? 'נתאים את התוכנית לזמינות שלך' : "We'll adapt to your availability"}
        </p>
      </motion.div>

      {/* Collapsible Recommendation ("Smart Tip") */}
      <AnimatePresence>
        {hasRecommendation && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4"
          >
            <button
              onClick={() => setShowRecommendation(!showRecommendation)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 transition-all hover:bg-amber-100"
            >
              <div className="flex items-center gap-2">
                <Lightbulb size={16} className="text-amber-600" />
                <span className="text-sm font-bold">{isHebrew ? 'המלצה שלנו' : 'Our Recommendation'}</span>
              </div>
              <motion.div
                animate={{ rotate: showRecommendation ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown size={18} className="text-amber-600" />
              </motion.div>
            </button>
            
            <AnimatePresence>
              {showRecommendation && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="pt-2 px-3 pb-3 text-sm text-amber-800 bg-amber-50/50 rounded-b-xl border-x border-b border-amber-200 -mt-1">
                    {showRecommendationA && (
                      <p className="font-medium font-simpler">
                        {isHebrew 
                          ? 'היי, שמנו לב שלא התאמנת הרבה זמן. אנחנו ממליצים להתחיל מ-1-2 פעמים בשבוע כדי לבנות בסיס חזק.'
                          : "Hey, we noticed you haven't trained in a while. We recommend starting with 1-2 times a week to build a strong foundation."
                        }
                      </p>
                    )}
                    {showRecommendationB && (
                      <p className="font-medium font-simpler">
                        {t(
                          'שים לב, ראינו שיש לך רקע קודם. אנחנו ממליצים לשלב לפחות 2 אימונים בשבוע. אל תדאג, אנחנו נעזור לך!',
                          'שימי לב, ראינו שיש לך רקע קודם. אנחנו ממליצים לשלב לפחות 2 אימונים בשבוע. אל תדאגי, אנחנו נעזור לך!'
                        )}
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Deep History Section (merged from HistoryStep) ────────── */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-5 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm text-right space-y-4"
      >
        {/* Q1: Frequency */}
        <div className="space-y-2">
          <h4 className="text-sm font-bold text-slate-800">
            {t('איך נראתה שגרת האימונים שלך בחודש האחרון?', 'איך נראתה שגרת האימונים שלך בחודש האחרון?')}
          </h4>
          <div className="space-y-1.5">
            {FREQ_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const sel = historyFreq === opt.id;
              return (
                <motion.button
                  key={opt.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleHistoryFreq(opt.id)}
                  className={`w-full p-3 rounded-xl border transition-all flex items-center gap-3 ${
                    sel ? 'bg-[#00C9F2]/8 border-[#00C9F2]/50' : 'bg-white border-slate-100'
                  }`}
                >
                  <div className={`p-1.5 rounded-lg ${sel ? 'bg-[#00C9F2]/15' : opt.bg}`}>
                    <Icon size={16} className={sel ? 'text-[#00C9F2]' : opt.color} strokeWidth={2} />
                  </div>
                  <span className={`text-sm flex-1 text-right ${sel ? 'font-bold text-slate-900' : 'font-medium text-slate-600'}`}>
                    {opt.label}
                  </span>
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center ${sel ? 'bg-[#00C9F2]' : 'bg-slate-100'}`}>
                    {sel && <Check size={10} className="text-white" strokeWidth={3} />}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Q2+Q3: Location + Sports (revealed after Q1) */}
        <AnimatePresence>
          {historyDone && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 overflow-hidden"
            >
              <div className="h-px bg-slate-100" />
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-slate-800">
                  {t('איפה התאמנת בדרך כלל?', 'איפה התאמנת בדרך כלל?')}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {LOC_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const sel = historyLocs.includes(opt.id);
                    return (
                      <motion.button
                        key={opt.id}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => toggleHistoryLoc(opt.id)}
                        className={`px-3 py-1.5 rounded-xl border text-sm flex items-center gap-1.5 transition-all ${
                          sel ? 'bg-[#00C9F2]/10 border-[#00C9F2]/50 text-[#00C9F2] font-semibold' : 'bg-white border-slate-100 text-slate-600'
                        }`}
                      >
                        <Icon size={13} strokeWidth={2} />
                        <span>{opt.label}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-bold text-slate-800">
                  {isHebrew ? 'באילו ענפי ספורט?' : 'Which sports?'}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {SPORT_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const sel = historySpts.includes(opt.id);
                    return (
                      <motion.button
                        key={opt.id}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => toggleHistorySport(opt.id)}
                        className={`px-3 py-1.5 rounded-xl border text-sm flex items-center gap-1.5 transition-all ${
                          sel ? 'bg-[#00C9F2]/10 border-[#00C9F2]/50 text-[#00C9F2] font-semibold' : 'bg-white border-slate-100 text-slate-600'
                        }`}
                      >
                        <Icon size={13} strokeWidth={2} />
                        <span>{opt.label}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>

      {/* Section 1: Frequency */}
      <section className="mb-5 text-right">
        <div className="flex items-center justify-start gap-2 mb-2">
          {IS_COIN_SYSTEM_ENABLED && (
            <div className="relative" ref={frequencyBadgeRef}>
              <motion.div
                initial={false}
                animate={{ opacity: hasClaimedReward('SCHEDULE_FREQUENCY_REWARD') ? 1 : 0.4 }}
                className={`flex items-center gap-1 rounded-full px-2 py-1 shadow-sm border transition-colors ${
                  hasClaimedReward('SCHEDULE_FREQUENCY_REWARD')
                    ? 'bg-amber-100 text-amber-700 border-amber-200' 
                    : 'bg-gray-100 text-gray-400 border-gray-200'
                }`}
              >
                <Coins size={14} strokeWidth={2.5} />
                <span className="text-xs font-bold font-simpler">
                  {hasClaimedReward('SCHEDULE_FREQUENCY_REWARD') ? '20 🪙' : '+20'}
                </span>
              </motion.div>
            </div>
          )}
          <h3 className="text-base font-bold text-slate-900">
            {isHebrew ? 'כמה פעמים בשבוע?' : 'How many times a week?'}
          </h3>
        </div>
        
        <div className="flex flex-wrap justify-center gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((num) => {
            const isRecommended = num === RECOMMENDED_FREQUENCY;
            const isSelected = frequency === num;
            
            return (
              <div key={num} className="relative">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleFrequencySelect(num)}
                  className={`w-11 h-11 flex items-center justify-center rounded-2xl text-lg transition-all duration-200 ${
                    isSelected
                      ? 'bg-[#5BC2F2] text-white shadow-[0_4px_12px_rgba(91,194,242,0.2)]'
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                  }`}
                  style={{ fontFamily: 'var(--font-simpler)', fontWeight: isSelected ? 700 : 500 }}
                >
                  {num}
                </motion.button>
                
                {/* "מומלץ עבורך" badge for recommended frequency */}
                {isRecommended && isSelected && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap"
                  >
                    <span 
                      className="text-[10px] px-2 py-0.5 rounded-full bg-[#5BC2F2]/10 text-[#5BC2F2]"
                      style={{ fontWeight: 600 }}
                    >
                      {isHebrew ? 'מומלץ עבורך' : 'Recommended'}
                    </span>
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>
        
        {/* Spacer for the badge */}
        <div className="h-3" />
      </section>

      {/* Section 2: Days Selection - Auto-reveal after 800ms with height animation */}
      <AnimatePresence>
        {showDaysSection && (
      <motion.section
        initial={{ opacity: 0, height: 0, y: 10 }}
        animate={{ 
          opacity: 1, 
          height: 'auto',
          y: 0,
          scale: daysPulse ? [1, 1.02, 1] : 1
        }}
        exit={{ opacity: 0, height: 0, y: -10 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="mb-5 text-right overflow-hidden"
      >
        <div className="flex items-center justify-between mb-2">
          {/* Right side: Title with coin badge */}
          <div className="flex items-center gap-2">
            {IS_COIN_SYSTEM_ENABLED && (
              <div className="relative" ref={daysBadgeRef}>
                <motion.div
                  initial={false}
                  animate={{ opacity: hasClaimedReward('SCHEDULE_DAYS_REWARD') ? 1 : 0.4 }}
                  className={`flex items-center gap-1 rounded-full px-2 py-1 shadow-sm border transition-colors ${
                    hasClaimedReward('SCHEDULE_DAYS_REWARD')
                      ? 'bg-amber-100 text-amber-700 border-amber-200' 
                      : 'bg-gray-100 text-gray-400 border-gray-200'
                  }`}
                >
                  <Coins size={14} strokeWidth={2.5} />
                  <span className="text-xs font-bold font-simpler">
                    {hasClaimedReward('SCHEDULE_DAYS_REWARD') ? '30 🪙' : '+30'}
                  </span>
                </motion.div>
              </div>
            )}
            <h3 className="text-base font-bold text-slate-900">
              {isHebrew ? 'באילו ימים?' : 'Which days?'}
            </h3>
          </div>
          
          {/* Left side: Calendar Sync Toggle (inline) - Delicate styling */}
          <button
            onClick={() => {
              const newValue = !calendarSyncEnabled;
              setCalendarSyncEnabled(newValue);
              // Sync to store immediately
              updateData({ calendarSyncEnabled: newValue } as any);
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all duration-200 ${
              calendarSyncEnabled 
                ? 'bg-[#5BC2F2]/10 text-[#5BC2F2]' 
                : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
            }`}
          >
            <RefreshCw size={10} strokeWidth={1.5} className={calendarSyncEnabled ? 'text-[#5BC2F2]' : 'text-slate-400'} />
            <span className="text-[11px] font-medium">{isHebrew ? 'סנכרון ליומן' : 'Sync'}</span>
            {/* Subtle check mark indicator */}
            <div className={`w-3 h-3 rounded-full flex items-center justify-center transition-all ${
              calendarSyncEnabled 
                ? 'bg-[#5BC2F2]' 
                : 'bg-slate-200'
            }`}>
              {calendarSyncEnabled && <Check size={7} className="text-white" strokeWidth={2.5} />}
            </div>
          </button>
        </div>
        
        <p className={`text-xs font-bold mb-2 ${
          selectedDays.length === frequency ? 'text-green-600' : 'text-orange-500'
        }`}>
          {isHebrew
            ? `נבחרו ${selectedDays.length} מתוך ${frequency} ימים`
            : `${selectedDays.length} of ${frequency} days selected`}
        </p>

        {/* ── [Smart Schedule v1.3] Horizontal 7-day grid ─────────────── */}
        {/* Each column = day capsule (letter) + skill icons below, all one tap target */}
        <div className="grid grid-cols-7 gap-1 relative">
          {DAYS_HEBREW.map((dayLabel, index) => {
            const day = scheduleGrid[index];
            const isRest = day.sessions.length === 0;
            const isSaturday = index === 6;
            const isPopoverOpen = openPopoverDay === index;
            const hasWarningOnDay = liveWarnings.some((w) =>
              w.affectedDays.includes(index),
            );

            return (
              <div key={index} className="relative">
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => handleDayCardClick(index)}
                  className={`w-full flex flex-col items-center gap-1 py-2 px-0.5 rounded-xl transition-all duration-200 border ${
                    isRest
                      ? isSaturday
                        ? 'bg-slate-50 border-slate-100'
                        : 'bg-white border-slate-200'
                      : 'bg-[#5BC2F2]/6 border-[#5BC2F2]/35 shadow-[0_2px_6px_rgba(91,194,242,0.10)]'
                  } ${isPopoverOpen ? 'ring-2 ring-[#5BC2F2] ring-offset-1' : ''}`}
                  aria-label={`${dayLabel} — ${isRest ? 'יום מנוחה' : `${day.sessions.length} סשנים`}`}
                >
                  {/* ── Day Capsule — independent rounded chip ── */}
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      isRest
                        ? 'bg-slate-100 text-slate-500'
                        : 'bg-[#5BC2F2]/15 text-[#5BC2F2]'
                    } ${isPopoverOpen ? 'bg-[#5BC2F2] text-white' : ''}`}
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    {dayLabel}
                  </span>

                  {/* ── Icons below capsule — emoji only, no text ── */}
                  {isRest ? (
                    <Moon size={15} className="text-slate-300 mt-0.5" strokeWidth={1.8} />
                  ) : (
                    <div className="flex flex-col items-center gap-0.5">
                      {day.sessions.slice(0, 2).map((session, si) => {
                        const display = SKILL_DISPLAY[session.skillId];
                        if (!display) return null;
                        return (
                          <div
                            key={si}
                            className={`w-7 h-7 rounded-full ${display.tint} flex items-center justify-center overflow-hidden`}
                            aria-hidden
                            title={display.shortName}
                          >
                            <img
                              src={display.iconPath}
                              alt={display.shortName}
                              className="w-4 h-4 object-contain"
                              onError={(e) => {
                                // Fallback: hide broken img and show emoji sibling
                                e.currentTarget.style.display = 'none';
                                const next = e.currentTarget.nextElementSibling as HTMLElement | null;
                                if (next) next.style.display = '';
                              }}
                            />
                            <span className="hidden text-sm leading-none">{display.icon}</span>
                          </div>
                        );
                      })}
                      {day.sessions.length > 2 && (
                        <span className="text-[9px] text-slate-400 font-bold leading-none">
                          +{day.sessions.length - 2}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Warning dot */}
                  {hasWarningOnDay && !isPopoverOpen && (
                    <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-orange-400" />
                  )}
                </motion.button>
              </div>
            );
          })}
        </div>

        {/* ── DayPopover — anchored beneath the grid (full-width sheet) ─ */}
        <AnimatePresence>
          {openPopoverDay !== -1 && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              className="mt-3 rounded-2xl bg-white border border-slate-200 shadow-[0_12px_32px_rgba(15,23,42,0.12)] overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
                <h4
                  className="text-sm font-bold text-slate-800"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  {isHebrew
                    ? `מה מתאמנים ביום ${DAYS_HEBREW[openPopoverDay]}׳?`
                    : `Day ${DAYS_HEBREW[openPopoverDay]} — pick programs`}
                </h4>
                <button
                  onClick={handleClosePopover}
                  className="p-1 rounded-full hover:bg-slate-100 transition-colors"
                  aria-label="Close"
                >
                  <X size={16} className="text-slate-500" />
                </button>
              </div>
              <div className="max-h-[280px] overflow-y-auto p-2 space-y-1">
                {activeWizardOptions.map((opt) => {
                  const day = scheduleGrid[openPopoverDay];
                  const isPicked = day.sessions.some((s) => s.skillId === opt.id);
                  const display = SKILL_DISPLAY[opt.id];
                  return (
                    <button
                      key={opt.id}
                      onClick={() => handleSessionToggle(openPopoverDay, opt.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${
                        isPicked
                          ? 'bg-[#5BC2F2]/10 border border-[#5BC2F2]/40'
                          : 'bg-white border border-slate-100 hover:border-slate-200'
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full ${display.tint} flex items-center justify-center overflow-hidden shrink-0`}
                      >
                        <img
                          src={display.iconPath}
                          alt={display.shortName}
                          className="w-5 h-5 object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const next = e.currentTarget.nextElementSibling as HTMLElement | null;
                            if (next) next.style.display = '';
                          }}
                        />
                        <span className="hidden text-base leading-none">{display.icon}</span>
                      </div>
                      <span
                        className={`flex-1 text-right text-sm ${
                          isPicked ? 'font-bold text-slate-900' : 'font-medium text-slate-600'
                        }`}
                        style={{ fontFamily: 'var(--font-simpler)' }}
                      >
                        {isHebrew ? opt.labelHe : opt.labelEn}
                      </span>
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
                          isPicked ? 'bg-[#5BC2F2]' : 'bg-slate-100 border border-slate-200'
                        }`}
                      >
                        {isPicked && <Check size={12} className="text-white" strokeWidth={3} />}
                      </div>
                    </button>
                  );
                })}

                {/* Rest day toggle */}
                <button
                  onClick={() => {
                    handleSetRestDay(openPopoverDay);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all mt-1 ${
                    scheduleGrid[openPopoverDay]?.sessions.length === 0
                      ? 'bg-slate-100 border border-slate-200'
                      : 'bg-white border border-slate-100 hover:border-slate-200'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                    <Moon size={16} className="text-slate-500" />
                  </div>
                  <span
                    className="flex-1 text-right text-sm font-medium text-slate-700"
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    {isHebrew ? 'יום מנוחה' : 'Rest day'}
                  </span>
                </button>
              </div>
              <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button
                  onClick={handleClosePopover}
                  className="text-xs font-bold text-[#5BC2F2] hover:text-[#3BA4D8] transition-colors"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  {isHebrew ? 'סיימתי' : 'Done'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Floating Dynamic Warning Box ─────────────────────────────── */}
        <AnimatePresence>
          {(liveErrors.length > 0 || liveWarns.length > 0) && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="mt-3 space-y-2"
            >
              {liveErrors.length > 0 && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle size={14} className="text-red-600" strokeWidth={2.5} />
                    <span
                      className="text-xs font-bold text-red-700"
                      style={{ fontFamily: 'var(--font-simpler)' }}
                    >
                      {isHebrew ? 'שגיאות חובה לתקן' : 'Errors to resolve'}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {liveErrors.map((w) => (
                      <li
                        key={w.code}
                        className="text-xs text-red-700"
                        style={{ fontFamily: 'var(--font-simpler)' }}
                      >
                        {w.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {liveWarns.length > 0 && (
                <div className="rounded-xl bg-orange-50 border border-orange-200 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle size={14} className="text-orange-600" strokeWidth={2.5} />
                    <span
                      className="text-xs font-bold text-orange-700"
                      style={{ fontFamily: 'var(--font-simpler)' }}
                    >
                      {isHebrew ? 'אזהרות מהמנוע החכם' : 'Smart engine warnings'}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {liveWarns.map((w, i) => (
                      <li
                        key={`${w.code}-${i}`}
                        className="text-xs text-orange-800"
                        style={{ fontFamily: 'var(--font-simpler)' }}
                      >
                        {w.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
        )}
      </AnimatePresence>

      {/* Section 3: Time Picker - Progressive Disclosure with height animation */}
      <AnimatePresence>
        {showTimeSection && (
          <motion.section
            initial={{ opacity: 0, height: 0, y: 10 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -10 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            className="mb-5 text-right overflow-hidden"
          >
            <div className="flex items-center gap-2 mb-3">
              {IS_COIN_SYSTEM_ENABLED && (
                <div className="relative" ref={timeBadgeRef}>
                  <motion.div
                    initial={false}
                    animate={{ opacity: hasClaimedReward('SCHEDULE_TIME_REWARD') ? 1 : 0.4 }}
                    className={`flex items-center gap-1 rounded-full px-2 py-1 shadow-sm border transition-colors ${
                      hasClaimedReward('SCHEDULE_TIME_REWARD')
                        ? 'bg-amber-100 text-amber-700 border-amber-200'
                        : 'bg-gray-100 text-gray-400 border-gray-200'
                    }`}
                  >
                    <Coins size={14} strokeWidth={2.5} />
                    <span className="text-xs font-bold font-simpler">
                      {hasClaimedReward('SCHEDULE_TIME_REWARD') ? '20 🪙' : '+20'}
                    </span>
                  </motion.div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-[#5BC2F2]" />
                <h3 className="text-base font-bold text-slate-900">
                  {isHebrew
                    ? t('באיזו שעה אתה מתאמן?', 'באיזו שעה את מתאמנת?')
                    : 'What time do you train?'
                  }
                </h3>
              </div>
            </div>
            
            {/* Time Picker - Fixed: HH : MM (Hours LEFT, Minutes RIGHT) */}
            <div className="relative py-3 flex justify-center items-center select-none">
              <div className="flex items-center gap-4" style={{ direction: 'ltr' }}>
                {/* Hours Column (LEFT - first in LTR) */}
                <div className="flex flex-col gap-1">
                  {[hours - 1, hours, hours + 1].map((h, idx) => {
                    const displayHour = h < 0 ? 23 : h > 23 ? 0 : h;
                    const isSelected = displayHour === hours;
                    return (
                      <button
                        key={`hour-${displayHour}-${idx}`}
                        onClick={() => {
                          setTime((prevTime) => {
                            const [, prevMinutes] = prevTime.split(':');
                            return `${String(displayHour).padStart(2, '0')}:${prevMinutes}`;
                          });
                          if (!hasClaimedReward('SCHEDULE_TIME_REWARD')) {
                            const wasClaimed = claimReward('SCHEDULE_TIME_REWARD', 20);
                            if (wasClaimed) triggerCoinFly(timeBadgeRef, 20);
                          }
                        }}
                        className={`w-14 h-9 rounded-xl flex items-center justify-center transition-all duration-200 ${
                          isSelected
                            ? 'bg-[#5BC2F2] text-white text-lg shadow-[0_4px_12px_rgba(91,194,242,0.2)]'
                            : 'bg-white text-slate-400 text-sm border border-slate-200 hover:border-slate-300'
                        }`}
                        style={{ fontFamily: 'var(--font-simpler)', fontWeight: isSelected ? 700 : 500 }}
                      >
                        {String(displayHour).padStart(2, '0')}
                      </button>
                    );
                  })}
                </div>
                
                {/* Separator */}
                <span className="text-2xl font-bold text-slate-900">:</span>
                
                {/* Minutes Column (RIGHT - second in LTR) */}
                <div className="flex flex-col gap-1">
                  {[
                    Math.round(minutes / 5) * 5 - 5,
                    Math.round(minutes / 5) * 5,
                    Math.round(minutes / 5) * 5 + 5
                  ].map((m, idx) => {
                    let displayMinute = m;
                    if (m < 0) displayMinute = 55;
                    else if (m > 55) displayMinute = 0;
                    const roundedMinutes = Math.round(minutes / 5) * 5;
                    const isSelected = displayMinute === roundedMinutes;
                    return (
                      <button
                        key={`min-${displayMinute}-${idx}`}
                        onClick={() => {
                          setTime((prevTime) => {
                            const [prevHours] = prevTime.split(':');
                            return `${prevHours}:${String(displayMinute).padStart(2, '0')}`;
                          });
                          if (!hasClaimedReward('SCHEDULE_TIME_REWARD')) {
                            const wasClaimed = claimReward('SCHEDULE_TIME_REWARD', 20);
                            if (wasClaimed) triggerCoinFly(timeBadgeRef, 20);
                          }
                        }}
                        className={`w-14 h-9 rounded-xl flex items-center justify-center transition-all duration-200 ${
                          isSelected
                            ? 'bg-[#5BC2F2] text-white text-lg shadow-[0_4px_12px_rgba(91,194,242,0.2)]'
                            : 'bg-white text-slate-400 text-sm border border-slate-200 hover:border-slate-300'
                        }`}
                        style={{ fontFamily: 'var(--font-simpler)', fontWeight: isSelected ? 700 : 500 }}
                      >
                        {String(displayMinute).padStart(2, '0')}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Section 4 removed - Calendar Sync & Reminders are now inline in their respective section headers */}

      {/* Spacer */}
      <div className="flex-grow"></div>

      <StickyActionButton
        variant="premium"
        label={isJIT
          ? (savedLanguage === 'he' ? 'שמירת שינויים' : 'Save Changes')
          : isLastStep
            ? (savedLanguage === 'he' ? 'בואו נתחיל!' : "Let's Go!")
            : (savedLanguage === 'he' ? t('המשך', 'המשיכי') : locale.common.continue)}
        successLabel={isJIT
          ? (savedLanguage === 'he' ? 'הלו״ז עודכן!' : 'Schedule Updated!')
          : undefined}
        disabled={!canContinue}
        onPress={handleContinue}
      />
    </div>
  );
}
