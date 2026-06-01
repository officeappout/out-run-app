'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, CheckCircle2, UserCircle } from 'lucide-react';
import {
  type MuscleGroup,
} from '@/features/content/exercises/core/exercise.types';
import OnboardingLayout from '@/features/user/onboarding/components/OnboardingLayout';
import { STRENGTH_PHASES } from '@/features/user/onboarding/constants/onboarding-phases';

/** Muscle icon paths — used inside chips */
const MUSCLE_ICON_PATHS: Record<string, string> = {
  chest: '/assets/icons/muscles/chest.svg',
  back: '/assets/icons/muscles/back.svg',
  shoulders: '/assets/icons/muscles/shoulders.svg',
  biceps: '/assets/icons/muscles/biceps.svg',
  triceps: '/assets/icons/muscles/triceps.svg',
  legs: '/assets/icons/muscles/quads.svg',
  core: '/assets/icons/muscles/abs.svg',
};

/** Hebrew chip labels for each muscle group ID */
const MUSCLE_CHIP_LABELS: Record<string, string> = {
  chest: 'חזה',
  back: 'גב',
  shoulders: 'כתפיים',
  biceps: 'יד קדמית',
  triceps: 'יד אחורית',
  legs: 'רגליים',
  core: 'בטן וליבה',
};

/** Calisthenics skill programs — slug matches Firestore program IDs.
 *  'calisthenics_upper' is the master chip and rendered separately as full-width. */
const SKILL_MASTER_ID = 'calisthenics_upper';

const SKILL_PROGRAMS: { id: string; nameHe: string }[] = [
  { id: 'calisthenics_upper', nameHe: 'קליסטניקס עליון (כל האלמנטים)' },
  { id: 'front_lever',        nameHe: 'פרונט לבר' },
  { id: 'muscle_up',          nameHe: 'עליית כוח' },
  { id: 'planche',            nameHe: 'פלאנץ׳' },
  { id: 'handstand',          nameHe: 'עמידת ידיים' },
  { id: 'hspu',               nameHe: 'שכיבות סמיכה בעמידת ידיים' },
  { id: 'one_arm_pullup',     nameHe: 'מתח יד אחת' },
];

/** Movement-pattern classification for the Orange Flow balance heuristic.
 *  SKILL_MASTER_ID ('calisthenics_upper') already covers both axes and is
 *  intentionally exempt from the recommendation engine. */
const PUSH_SKILLS: ReadonlySet<string> = new Set(['planche', 'hspu', 'handstand']);
const PULL_SKILLS: ReadonlySet<string> = new Set(['front_lever', 'one_arm_pullup', 'muscle_up']);

/** Icon paths per skill — hidden via onError when file is absent */
const SKILL_ICON_PATHS: Record<string, string> = {
  calisthenics_upper: '/icons/programs/calisthenics_upper.svg',
  front_lever:        '/icons/programs/front_lever.svg',
  muscle_up:          '/icons/programs/muscle_up_bar.svg',
  planche:            '/icons/programs/planche.svg',
  handstand:          '/icons/programs/handstand.svg',
  hspu:               '/icons/programs/hspu.svg',
  one_arm_pullup:     '/icons/programs/one_arm_pullup.svg',
};

const MUSCLE_FOCUS_IDS: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'legs',
  'core',
];

type ProgramPathType = 'health' | 'body_focus' | 'skills' | null;

function persistToStorage(path: ProgramPathType, muscleIds: string[], skillIds: string[]) {
  if (typeof window === 'undefined') return;
  if (path) {
    sessionStorage.setItem('onboarding_program_path', path);
  }
  sessionStorage.setItem('onboarding_muscle_focus', JSON.stringify(muscleIds));
  sessionStorage.setItem('onboarding_skill_focus', JSON.stringify(skillIds));
}

export default function ProgramPathPage() {
  const router = useRouter();

  // Loading guard — don't render strength content until we've confirmed the
  // user is NOT on the running track. Without this, the strength selector
  // flashes for one frame before the useEffect redirect fires.
  const [isReady, setIsReady] = useState(false);
  const [gender, setGender] = useState<'male' | 'female' | 'other' | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const track = sessionStorage.getItem('gateway_track');
    if (track === 'RUNNING') {
      router.replace('/onboarding-new/dynamic');
      return;
    }
    const g = sessionStorage.getItem('onboarding_personal_gender') as 'male' | 'female' | 'other' | null;
    setGender(g);
    setIsReady(true);
  }, [router]);

  const isFemale = gender === 'female';

  // Refs for each card — used for auto-center scroll on expansion
  const healthCardRef  = useRef<HTMLDivElement>(null);
  const muscleCardRef  = useRef<HTMLDivElement>(null);
  const skillsCardRef  = useRef<HTMLDivElement>(null);

  /** Smoothly scrolls the given card to just below the story bar.
   *  The 150 ms delay lets Framer Motion begin its height reflow first. */
  const scrollCardIntoView = useCallback((ref: React.RefObject<HTMLDivElement>) => {
    setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  }, []);

  const [path, setPath] = useState<ProgramPathType>(null);
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  // ── Orange Flow: complementary-skill recommendation state ──
  // showRecommendation: the inline amber tip + orange-highlighted chips are visible.
  // hasIgnoredRecommendation: user already saw the tip once and chose "המשך בכל זאת",
  //   so subsequent Continue clicks should NOT re-prompt them.
  const [showRecommendation, setShowRecommendation] = useState(false);
  const [hasIgnoredRecommendation, setHasIgnoredRecommendation] = useState(false);

  const FULL_BODY_ID = 'full_body';

  const toggleMuscle = useCallback(
    (id: string) => {
      setSelectedMuscles((prev) => {
        if (id === FULL_BODY_ID) {
          // ON  → include the full_body tag plus every individual muscle so each
          //       chip renders in its active/selected visual state.
          // OFF → clear everything.
          return prev.includes(FULL_BODY_ID)
            ? []
            : [FULL_BODY_ID, ...MUSCLE_FOCUS_IDS];
        }

        // Individual chip tapped — always strip the full_body tag first so the
        // "כל הגוף" button deactivates when the set is no longer complete.
        const withoutFullBody = prev.filter((m) => m !== FULL_BODY_ID);
        const next = withoutFullBody.includes(id)
          ? withoutFullBody.filter((m) => m !== id)
          : [...withoutFullBody, id];

        // Auto-upgrade: if the user has now manually selected every individual
        // muscle, flip the full_body tag back on so the UI stays in sync.
        const allSelected = MUSCLE_FOCUS_IDS.every((m) => next.includes(m));
        return allSelected ? [FULL_BODY_ID, ...MUSCLE_FOCUS_IDS] : next;
      });
    },
    []
  );

  const toggleSkill = useCallback((id: string) => {
    setSelectedSkills((prev) => {
      // Master chip — selecting it clears all individual picks and vice-versa
      if (id === SKILL_MASTER_ID) {
        return prev.includes(SKILL_MASTER_ID) ? [] : [SKILL_MASTER_ID];
      }
      // Selecting an individual skill deselects the master
      const withoutMaster = prev.filter((s) => s !== SKILL_MASTER_ID);
      if (withoutMaster.includes(id)) {
        return withoutMaster.filter((s) => s !== id);
      }
      return [...withoutMaster, id];
    });
  }, []);

  const getSkillOrder = useCallback(
    (id: string) => {
      const idx = selectedSkills.indexOf(id);
      return idx >= 0 ? idx + 1 : null;
    },
    [selectedSkills]
  );

  const isFullBodySelected = selectedMuscles.includes(FULL_BODY_ID);

  // ── Derived balance signal ───────────────────────────────────
  // `missingCategory` is the axis the user is currently NOT covering.
  // null  → no mismatch (both present, or neither because master is selected
  //         or nothing was picked yet).
  // 'push' → user has only pull skills; push chips should glow.
  // 'pull' → user has only push skills; pull chips should glow.
  const hasPushSelected = selectedSkills.some((id) => PUSH_SKILLS.has(id));
  const hasPullSelected = selectedSkills.some((id) => PULL_SKILLS.has(id));
  const missingCategory: 'push' | 'pull' | null =
    hasPushSelected && !hasPullSelected
      ? 'pull'
      : hasPullSelected && !hasPushSelected
        ? 'push'
        : null;

  // Auto-dismiss the recommendation the moment the user resolves the imbalance
  // (either by adding the complementary skill, or by switching to master/none).
  useEffect(() => {
    if (showRecommendation && missingCategory === null) {
      setShowRecommendation(false);
    }
  }, [missingCategory, showRecommendation]);

  const canContinue =
    path !== null &&
    (path === 'health' ||
      (path === 'body_focus' && selectedMuscles.length > 0) ||
      (path === 'skills' && selectedSkills.length > 0));

  const handleContinue = () => {
    if (!canContinue) return;

    // ── Orange Flow gate (skills path only) ────────────────────
    // Master chip ('calisthenics_upper') is inherently balanced — bypass.
    // Once the user has explicitly dismissed the tip, never re-prompt.
    const masterSelected = selectedSkills.includes(SKILL_MASTER_ID);
    if (path === 'skills' && !masterSelected && !hasIgnoredRecommendation) {
      if (missingCategory !== null) {
        if (!showRecommendation) {
          // First press with a mismatch → surface the coach tip + glow,
          // do NOT navigate. The CTA copy will flip to "המשך בכל זאת".
          setShowRecommendation(true);
          return;
        }
        // Second press with the tip still visible → user is consciously
        // overriding the suggestion. Lock the override and fall through
        // to the standard persist + navigate flow.
        setHasIgnoredRecommendation(true);
      }
    }

    const toPersist =
      selectedMuscles.includes(FULL_BODY_ID)
        ? ['push', 'pull', 'legs', 'core']
        : selectedMuscles;
    persistToStorage(path!, toPersist, selectedSkills);
    router.push('/onboarding-new/assessment-visual');
  };

  if (!isReady) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: '#F4FAFD' }}
      >
        <div className="animate-spin w-8 h-8 border-4 border-[#5BC2F2] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <OnboardingLayout
      totalSegments={STRENGTH_PHASES.TOTAL}
      currentSegment={STRENGTH_PHASES.PROGRAM_PATH}
      phaseLabel={STRENGTH_PHASES.labels[STRENGTH_PHASES.PROGRAM_PATH]}
      onBack={() => {
        const hasHistory = typeof window !== 'undefined' && window.history.length > 1;
        if (hasHistory) router.back();
        else router.push('/onboarding-new/profile');
      }}
      onContinue={handleContinue}
      canContinue={canContinue}
      continueLabel={
        showRecommendation
          ? (isFemale ? 'המשיכי בכל זאת' : 'המשך בכל זאת')
          : (isFemale ? 'המשכי' : 'המשך')
      }
    >
      <div className="w-full max-w-md mx-auto px-4 py-6 flex flex-col">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-6"
        >
          <h1
            className="text-2xl font-black mb-2"
            style={{ color: '#182236' }}
          >
            איזה מסלול מתאים לך?
          </h1>
          <p className="text-sm text-slate-500">
            {isFemale ? 'בחרי את הכיוון שתרצי להתמקד בו' : 'בחר את הכיוון שתרצה להתמקד בו'}
          </p>
        </motion.div>

        {/* Option A: Health & Lifestyle */}
        <motion.div
          ref={healthCardRef}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
          className={`scroll-mt-24 bg-white rounded-[24px] shadow-sm transition-colors duration-300 ${
            path === 'health'
              ? 'border border-[#00BAF7]'
              : 'border border-[#E0E9FF]'
          }`}
        >
          <button
            onClick={() => {
              const isOpening = path !== 'health';
              setPath('health');
              setSelectedMuscles([]);
              setSelectedSkills([]);
              if (isOpening) scrollCardIntoView(healthCardRef);
            }}
            className="w-full p-5 min-h-[88px] flex items-center gap-4"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/lemur/lemur-avatar.png"
              alt=""
              className="w-[88px] h-[88px] object-contain shrink-0"
            />
            <div className="flex-1 text-right">
              <p
                className={`text-base font-bold ${
                  path === 'health' ? 'text-[#182236]' : 'text-slate-700'
                }`}
              >
                אורח חיים ובריאות
              </p>
              <p className="text-sm text-slate-500">
                {path === 'health' ? 'בסיס בריאותי מקיף לגוף ולנפש' : 'בניית בסיס, בריאות ואנרגיה יומית'}
              </p>
            </div>
            {path === 'health' && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-6 h-6 rounded-full bg-[#5BC2F2] flex items-center justify-center shrink-0"
              >
                <Check size={14} className="text-white" strokeWidth={3} />
              </motion.div>
            )}
          </button>

          {/* Expanded checklist — shown only when selected */}
          <AnimatePresence>
            {path === 'health' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.28 }}
                style={{ overflow: 'hidden' }}
              >
                <div className="px-5 pb-6">
                  <p className="text-[13px] text-slate-500 text-right mb-3 leading-relaxed">
                    מסלול מקיף לשמירה על חיוניות, תנועה נכונה ואנרגיה גבוהה.
                  </p>
                  <ul className="space-y-2">
                    {[
                      'אימוני כוח לכל הגוף (Full Body) לבניית בסיס איתן',
                      'שילוב מסלולי הליכה מותאמים ויעדי ספירת צעדים יומית',
                      'דגש על שיפור טווחי תנועה, גמישות ויציבה',
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-right">
                        <CheckCircle2
                          size={16}
                          className="text-[#5BC2F2] shrink-0 mt-0.5"
                          strokeWidth={2.5}
                        />
                        <span className="text-[13px] font-medium text-slate-700 leading-snug flex-1 text-right">
                          {item}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Option B: Muscle Focus */}
        <motion.div
          ref={muscleCardRef}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className={`scroll-mt-24 mt-4 bg-white rounded-[24px] shadow-sm transition-colors duration-300 ${
            path === 'body_focus' || selectedMuscles.length > 0
              ? 'border border-[#00BAF7]'
              : 'border border-[#E0E9FF]'
          }`}
        >
          <button
            onClick={() => {
              const isOpening = path !== 'body_focus';
              setPath('body_focus');
              setSelectedSkills([]);
              if (isOpening) scrollCardIntoView(muscleCardRef);
            }}
            className="w-full p-5 min-h-[88px] flex items-center gap-4"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/lemur/lemur-avatar.png"
              alt=""
              className="w-[88px] h-[88px] object-contain shrink-0"
            />
            <div className="flex-1 text-right">
              <p
                className={`text-base font-bold ${
                  path === 'body_focus' || selectedMuscles.length > 0
                    ? 'text-[#182236]'
                    : 'text-slate-700'
                }`}
              >
                מיקוד שרירים וחיטוב
              </p>
              <p className="text-sm text-slate-500 leading-snug">
                {isFullBodySelected
                  ? 'כל הגוף נבחר'
                  : selectedMuscles.length > 0
                    ? `${selectedMuscles.length} אזורים נבחרו`
                    : isFemale
                      ? 'חיטוב וחיזוק הגוף, הגברת האנרגיה ומיקוד באזורים המועדפים עלייך.'
                      : 'בניית מסת שריר, עבודה על עומסים ומיקוד בקבוצות השרירים המועדפות עליך.'}
              </p>
            </div>
            {(path === 'body_focus' || selectedMuscles.length > 0) && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-6 h-6 rounded-full bg-[#5BC2F2] flex items-center justify-center shrink-0"
              >
                <Check size={14} className="text-white" strokeWidth={3} />
              </motion.div>
            )}
          </button>

          <AnimatePresence>
            {path === 'body_focus' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.28 }}
                style={{ overflow: 'hidden' }}
              >
                <div className="px-5 pb-8">
                  <p className="text-[13px] text-slate-500 text-right mb-3">
                    {isFemale ? 'בחרי את האזורים שתרצי לפתח' : 'בחר את האזורים שתרצה לפתח'}
                  </p>
                  <div className="grid grid-cols-2 gap-3 w-full" dir="rtl">
                    {/* "כל הגוף" — full-width anchor */}
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => toggleMuscle(FULL_BODY_ID)}
                      className={`col-span-2 flex items-center justify-between p-3.5 h-12 w-full rounded-xl border transition-all text-right cursor-pointer ${
                        isFullBodySelected
                          ? 'bg-[#00BAF7]/[0.06] border-[#00BAF7] font-semibold'
                          : 'bg-white border-[#E0E9FF] font-medium'
                      }`}
                    >
                      {/* Icon first in DOM = RIGHT edge in dir="rtl" flex */}
                      <UserCircle
                        size={22}
                        className={isFullBodySelected ? 'text-[#00BAF7]' : 'text-slate-400'}
                        strokeWidth={1.5}
                      />
                      <span className="text-[14px] text-slate-800">כל הגוף</span>
                    </motion.button>

                    {/* Individual muscle items */}
                    {MUSCLE_FOCUS_IDS.map((id) => {
                      const label = MUSCLE_CHIP_LABELS[id] ?? id;
                      const isSelected = selectedMuscles.includes(id);
                      const iconSrc = MUSCLE_ICON_PATHS[id];
                      return (
                        <motion.button
                          key={id}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => toggleMuscle(id)}
                          className={`flex items-center justify-between p-3.5 h-12 w-full rounded-xl border transition-all text-right cursor-pointer ${
                            isSelected
                              ? 'bg-[#00BAF7]/[0.06] border-[#00BAF7] font-semibold'
                              : 'bg-white border-[#E0E9FF] font-medium'
                          }`}
                        >
                          {/* Icon first in DOM = RIGHT edge in dir="rtl" flex */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={iconSrc}
                            alt=""
                            className={`w-7 h-7 object-contain shrink-0 transition-all ${
                              isSelected ? 'opacity-100' : 'opacity-55'
                            }`}
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          />
                          <span className="text-[14px] text-slate-800">{label}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Option C: Skills */}
        <motion.div
          ref={skillsCardRef}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`scroll-mt-24 mt-4 bg-white rounded-[24px] shadow-sm transition-colors duration-300 ${
            path === 'skills' || selectedSkills.length > 0
              ? 'border border-[#00BAF7]'
              : 'border border-[#E0E9FF]'
          }`}
        >
          <button
            onClick={() => {
              const isOpening = path !== 'skills';
              setPath('skills');
              setSelectedMuscles([]);
              if (isOpening) scrollCardIntoView(skillsCardRef);
            }}
            className="w-full p-5 min-h-[88px] flex items-center gap-4"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/lemur/lemur-avatar.png"
              alt=""
              className="w-[88px] h-[88px] object-contain shrink-0"
            />
            <div className="flex-1 text-right">
              <p
                className={`text-base font-bold ${
                  path === 'skills' || selectedSkills.length > 0
                    ? 'text-[#182236]'
                    : 'text-slate-700'
                }`}
              >
                קליסטניקס וסקילים
              </p>
              <p className="text-sm text-slate-500 leading-snug">
                {selectedSkills.length > 0
                  ? `${selectedSkills.length} אלמנטים נבחרו (לפי עדיפות)`
                  : isFemale
                    ? 'פיתוח כוח יחסי מטורף, שליטה מלאה במשקל הגוף ופתיחת אלמנטים מתקדמים שמתאימים לך.'
                    : 'פיתוח כוח יחסי מטורף, שליטה מלאה במשקל הגוף ופתיחת אלמנטים מתקדמים שתרצה להשיג.'}
              </p>
            </div>
            {(path === 'skills' || selectedSkills.length > 0) && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-6 h-6 rounded-full bg-[#5BC2F2] flex items-center justify-center shrink-0"
              >
                <Check size={14} className="text-white" strokeWidth={3} />
              </motion.div>
            )}
          </button>

          <AnimatePresence>
            {path === 'skills' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.28 }}
                style={{ overflow: 'hidden' }}
              >
                <div className="px-5 pb-8">
                  <p className="text-[13px] text-slate-500 text-right mb-3">
                    {isFemale
                      ? 'בחרי אלמנטים לפי סדר עדיפות (לחיצה ראשונה = עדיפות 1)'
                      : 'בחר אלמנטים לפי סדר עדיפות (לחיצה ראשונה = עדיפות 1)'}
                  </p>

                  {/* ── Orange Flow: complementary-skill coach tip ── */}
                  <AnimatePresence>
                    {showRecommendation && (
                      <motion.div
                        key="orange-flow-tip"
                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.98 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                        className="mb-3 rounded-2xl border bg-amber-50 border-amber-300 text-amber-900 px-3.5 py-3 text-right shadow-sm"
                        role="status"
                        aria-live="polite"
                      >
                        <p className="text-[13px] font-semibold leading-relaxed">
                          בחרת בסקיל עוצמתי! כדי למנוע פציעות כתפיים ולפתח כוח סימטרי, קלי המאמן הווירטואלי ממליץ לך לסמן לפחות אלמנט משלים אחד מהקבוצה המודגשת בכתום (דחיפה/משיכה).
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="grid grid-cols-2 gap-3 w-full" dir="rtl">
                    {SKILL_PROGRAMS.map((skill) => {
                      const isMaster = skill.id === SKILL_MASTER_ID;
                      const isSelected = selectedSkills.includes(skill.id);
                      const order = !isMaster ? getSkillOrder(skill.id) : null;
                      const iconSrc = SKILL_ICON_PATHS[skill.id];
                      // Orange Flow: glow if this chip belongs to the missing
                      // movement pattern and the tip is currently visible.
                      const isRecommended =
                        showRecommendation &&
                        !isSelected &&
                        !isMaster &&
                        ((missingCategory === 'push' && PUSH_SKILLS.has(skill.id)) ||
                          (missingCategory === 'pull' && PULL_SKILLS.has(skill.id)));
                      return (
                        <motion.button
                          key={skill.id}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => toggleSkill(skill.id)}
                          className={`${isMaster ? 'col-span-2' : ''} flex items-center justify-between p-3.5 h-12 w-full rounded-xl border transition-all text-right cursor-pointer ${
                            isSelected
                              ? 'bg-[#00BAF7]/[0.06] border-[#00BAF7] font-semibold'
                              : isRecommended
                                ? 'bg-orange-50/50 border-orange-400 shadow-sm animate-pulse font-medium'
                                : 'bg-white border-[#E0E9FF] font-medium'
                          }`}
                        >
                          {/* Icon first in DOM = RIGHT edge in dir="rtl" flex */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={iconSrc}
                            alt=""
                            className={`w-8 h-8 object-contain shrink-0 transition-all ${
                              isSelected ? 'opacity-100' : 'opacity-55'
                            }`}
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          />
                          {/* Text + optional priority badge LEFT (second in RTL) */}
                          <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-end">
                            <span className="text-[13px] text-slate-800 leading-tight truncate">
                              {skill.nameHe}
                            </span>
                            {order !== null && (
                              <span
                                className="w-4 h-4 rounded-full bg-[#182236] text-white flex items-center justify-center font-bold shrink-0"
                                style={{ fontSize: 9 }}
                              >
                                {order}
                              </span>
                            )}
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

      </div>
    </OnboardingLayout>
  );
}
