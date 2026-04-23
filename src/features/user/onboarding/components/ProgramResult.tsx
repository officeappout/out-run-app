"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { getProgram, getLevel } from '@/features/content/programs';
import type { Program, Level } from '@/features/content/programs';
import { getOnboardingLocale, type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';
import { useOnboardingStore } from '../store/useOnboardingStore';
import OnboardingStoryBar from './OnboardingStoryBar';
import { TOTAL_PHASES, STRENGTH_PHASES, STRENGTH_LABELS } from '../constants/onboarding-phases';

// ── Real progression data (Progression Manager — מנהל התקדמות) ──────
// Source of truth: src/features/user/core/types/progression.types.ts
// sessionStorage key "baseGain" per level. Formula: ceil(100 / baseGain).
const BASE_GAIN_BY_LEVEL: Record<number, number> = {
  1: 15, // ~7 sessions
  2: 12, // ~9 sessions
  3: 10, // ~10 sessions
  4: 8,  // ~13 sessions  (Progression Manager screenshot = 8%)
  5: 8,  // ~13 sessions
  6: 7,  // ~15 sessions
  7: 6,  // ~17 sessions
  8: 5,  // ~20 sessions
  9: 5,  // ~20 sessions
  10: 4, // ~25 sessions  (levels 11+ fallback to 4%)
};

function getSessionsToNextLevel(level: number): number {
  const baseGain = BASE_GAIN_BY_LEVEL[Math.min(level, 10)] ?? 4;
  return Math.ceil(100 / baseGain);
}

// Gauge always shows 1% — the "Start Line" of the new level.
const STARTING_PROGRESS = 1;

// ── Official brand gradient (Figma: #0CF2E3 → #00BAF7) ────────────
const BRAND_GRADIENT = 'linear-gradient(98deg, #0CF2E3 0%, #00BAF7 98%)';

// ── Canonical category colors ──────────────────────────────────────
// Authoritative source: src/features/user/onboarding/components/visual-assessment/VisualSlider.tsx
// Do NOT change these without updating VisualSlider.tsx simultaneously.
const CATEGORY_DISPLAY = [
  { key: 'push' as const, en: 'Push', he: 'דחיפה',          emoji: '💪', color: '#5BC2F2', lightBg: '#5BC2F212' },
  { key: 'pull' as const, en: 'Pull', he: 'משיכה',          emoji: '🤸', color: '#8b5cf6', lightBg: '#8b5cf612' },
  { key: 'legs' as const, en: 'Legs', he: 'פלג גוף תחתון', emoji: '🦵', color: '#10b981', lightBg: '#10b98112' },
  { key: 'core' as const, en: 'Core', he: 'ליבה',           emoji: '🔥', color: '#f59e0b', lightBg: '#f59e0b12' },
];

// ── Reveal phase state machine ─────────────────────────────────────
type RevealPhase = 'calculating' | 'cards' | 'gauge' | 'insights';

// ── Props ──────────────────────────────────────────────────────────
interface ProgramResultProps {
  levelNumber: number;
  levelId?: string;
  programId?: string;
  userName: string;
  language?: OnboardingLanguage;
  onContinue: () => void;
  assessmentLevels?: Partial<Record<'push' | 'pull' | 'legs' | 'core', number>>;
}

// ── Confetti particle ──────────────────────────────────────────────
const ConfettiParticle = ({ delay, x, color, windowHeight }: {
  delay: number; x: number; color: string; windowHeight: number;
}) => {
  if (typeof window === 'undefined' || windowHeight === 0) return null;
  return (
    <motion.div
      className={`absolute w-3 h-3 ${color} rounded-sm pointer-events-none`}
      style={{ left: `${x}%`, top: '-10px' }}
      initial={{ y: 0, rotate: 0, opacity: 1 }}
      animate={{ y: windowHeight + 100, rotate: 720, opacity: [1, 1, 0] }}
      transition={{ duration: 2.5, delay, ease: 'easeOut' }}
    />
  );
};

// ── Sparkle effect ─────────────────────────────────────────────────
const SparkleEffect = ({ delay, angle, distance }: {
  delay: number; angle: number; distance: number;
}) => {
  const x = Math.cos(angle) * distance;
  const y = Math.sin(angle) * distance;
  return (
    <motion.div
      className="absolute w-2 h-2"
      style={{ left: '50%', top: '50%' }}
      initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
      animate={{ x: [0, x, x * 1.2], y: [0, y, y * 1.2], scale: [0, 1.2, 0], opacity: [0, 1, 0] }}
      transition={{ duration: 1.5, delay, ease: 'easeOut' }}
    >
      <Sparkles className="w-4 h-4 text-[#5BC2F2]" />
    </motion.div>
  );
};

// ── Circular Progress Gauge ────────────────────────────────────────
// The gauge always shows 1% (starting progress for the new level).
// The LEVEL NUMBER is the hero element, displayed huge inside the ring.
const CircularGauge = ({
  levelNumber,
  levelName,
  onCountComplete,
}: {
  levelNumber: number;
  levelName: string | null;
  onCountComplete?: () => void;
}) => {
  const [arcPct, setArcPct] = useState(0);
  const countCompleteRef    = useRef(false);

  const size          = 220;
  const strokeWidth   = 14;
  const radius        = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (arcPct / 100) * circumference;

  // Animate the tiny 1% arc in, then fire sparkles
  useEffect(() => {
    const timer = setTimeout(() => {
      setArcPct(STARTING_PROGRESS);
      if (!countCompleteRef.current) {
        countCompleteRef.current = true;
        setTimeout(() => onCountComplete?.(), 600);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [onCountComplete]);

  return (
    <div className="flex flex-col items-center gap-2">
      {/* SVG ring */}
      <div className="relative" style={{ width: size, height: size }}>
        {/* Glow pulse */}
        <motion.div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(91,194,242,0.25) 0%, transparent 65%)' }}
          animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        />
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E2E8F0" strokeWidth={strokeWidth} />
          <circle
            cx={size / 2} cy={size / 2} r={radius} fill="none"
            stroke="url(#pgGradient)" strokeWidth={strokeWidth} strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
          />
          <defs>
            {/* Official Figma brand gradient: #0CF2E3 → #00BAF7 */}
            <linearGradient id="pgGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="#0CF2E3" />
              <stop offset="98%"  stopColor="#00BAF7" />
            </linearGradient>
          </defs>
        </svg>

        {/* CENTER: Level number is THE HERO */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className="text-[11px] font-bold text-slate-400 uppercase tracking-widest"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            רמה
          </motion.span>
          <motion.span
            className="text-7xl font-black leading-none"
            style={{ color: '#5BC2F2' }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: 'spring', stiffness: 180, damping: 14 }}
          >
            {levelNumber}
          </motion.span>
          <motion.span
            className="text-sm font-semibold text-slate-400 mt-0.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            / 25
          </motion.span>
        </div>
      </div>

      {/* Level name + starting-line badge below the ring */}
      <motion.div
        className="text-center flex flex-col items-center gap-1"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.4 }}
      >
        {levelName && (
          <p className="text-lg font-black text-slate-700">{levelName}</p>
        )}
        <span
          className="text-[11px] font-bold px-3 py-0.5 rounded-full text-white"
          style={{ background: BRAND_GRADIENT }}
        >
          1% — קו ההתחלה שלך
        </span>
      </motion.div>
    </div>
  );
};

// ── Category Card — Monochrome brand style ─────────────────────────
// All cards are visually identical; no per-category colors.
// Category colors are preserved in CATEGORY_DISPLAY for use elsewhere.
const CategoryCard = ({ cat, levelValue, delay }: {
  cat: typeof CATEGORY_DISPLAY[number];
  levelValue: number | undefined;
  delay: number;
}) => (
  <motion.div
    className="flex-1 min-w-0 flex flex-col bg-white rounded-2xl overflow-hidden"
    style={{
      border: '1.5px solid #E2E8F0',
      boxShadow: '0 4px 16px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.03)',
    }}
    initial={{ opacity: 0, scale: 0.55, y: 28 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    transition={{ delay, type: 'spring', stiffness: 280, damping: 20 }}
  >
    {/* Top accent stripe — brand cyan, same for all cards */}
    <div className="h-[3px] w-full" style={{ background: BRAND_GRADIENT }} />

    {/* Card body */}
    <div className="flex flex-col items-center py-3 px-2 gap-1.5">
      {/* Emoji in a soft-gray bubble — icon slot ready for custom SVGs */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-[18px] leading-none shrink-0 bg-slate-100"
        aria-label={cat.en}
      >
        {cat.emoji}
      </div>

      {/* Category name */}
      <span className="text-[9px] font-bold text-slate-400 text-center leading-tight tracking-wide">
        {cat.he}
      </span>

      {/* Level — Hebrew format, brand color */}
      <span className="text-sm font-black leading-none text-[#00BAF7]">
        {levelValue != null && levelValue > 0 ? `רמה ${levelValue}` : '—'}
      </span>
    </div>
  </motion.div>
);


// ── Main Component ─────────────────────────────────────────────────
export default function ProgramResult({
  levelNumber,
  levelId,
  programId,
  userName,
  language = 'he',
  onContinue,
  assessmentLevels,
}: ProgramResultProps) {
  void getOnboardingLocale(language); // keep import used

  const [program,       setProgram]       = useState<Program | null>(null);
  const [level,         setLevel]         = useState<Level | null>(null);
  const [programLoading, setProgramLoading] = useState(true);
  const [revealPhase,   setRevealPhase]   = useState<RevealPhase>('calculating');
  const [showConfetti,  setShowConfetti]  = useState(true);
  const [showSparkles,  setShowSparkles]  = useState(false);
  const [windowHeight,  setWindowHeight]  = useState(0);
  const [programPath,   setProgramPath]   = useState<string | null>(null);

  const direction = language === 'he' ? 'rtl' : 'ltr';
  const sessions  = useMemo(() => getSessionsToNextLevel(levelNumber), [levelNumber]);

  // ── Sequential reveal state machine ───────────────────────────
  // calculating (0ms) → cards (1500ms) → gauge (2400ms) → insights (3200ms)
  useEffect(() => {
    const t1 = setTimeout(() => setRevealPhase('cards'),    1500);
    const t2 = setTimeout(() => setRevealPhase('gauge'),    2400);
    const t3 = setTimeout(() => setRevealPhase('insights'), 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  // ── sessionStorage reads ───────────────────────────────────────
  useEffect(() => {
    try { setProgramPath(sessionStorage.getItem('onboarding_program_path')); } catch { /* ssr */ }
  }, []);

  // ── Fetch program & level names ────────────────────────────────
  useEffect(() => {
    const fetchData = async () => {
      try {
        setProgramLoading(true);
        const [p, l] = await Promise.all([
          programId ? getProgram(programId) : Promise.resolve(null),
          levelId   ? getLevel(levelId)     : Promise.resolve(null),
        ]);
        setProgram(p);
        setLevel(l);
      } catch (err) {
        console.error('[ProgramResult] fetch:', err);
      } finally {
        setProgramLoading(false);
      }
    };
    fetchData();
  }, [programId, levelId]);


  // ── Window height ───────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setWindowHeight(window.innerHeight);
    const h = () => setWindowHeight(window.innerHeight);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setShowConfetti(false), 3500);
    return () => clearTimeout(t);
  }, []);

  // ── Derived values ─────────────────────────────────────────────
  const levelName: string | null = programLoading ? null : ((level?.name as string | undefined) ?? null);

  const getProgramName = () => {
    if (programPath === 'health') return language === 'he' ? 'תוכנית גוף מלא' : 'Full Body Program';
    if (program?.name) return program.name;
    if (level?.name)   return language === 'he' ? `תוכנית ${level.name}` : `${level.name} Program`;
    return language === 'he' ? 'תוכנית אימונים מותאמת אישית' : 'Personalized Training Program';
  };

  const hasCategoryData = assessmentLevels != null &&
    CATEGORY_DISPLAY.some(c => (assessmentLevels[c.key] ?? 0) > 0);

  // Gender-aware social proof — aligned with the "1% start line" narrative
  const gender = typeof window !== 'undefined'
    ? (sessionStorage.getItem('onboarding_personal_gender') ?? 'male')
    : 'male';
  const nextLevel = levelNumber + 1;
  const achievementText = gender === 'female'
    ? `כ-1,280 משתמשות התחילו ב-1% בדיוק כמוך — רובן הגיעו לרמה ${nextLevel} תוך כ-${sessions} אימונים.`
    : `כ-1,280 משתמשים התחילו ב-1% בדיוק כמוך — רובם הגיעו לרמה ${nextLevel} תוך כ-${sessions} אימונים.`;

  const continueLabel =
    language === 'ru' ? 'Продолжим: Адаптация к стилю жизни'
    : language === 'en' ? "Let's continue: Lifestyle Adaptation"
    : 'בואו נמשיך: התאמה לסגנון החיים';

  // ── Confetti ────────────────────────────────────────────────────
  const confettiColors = [
    'bg-[#5BC2F2]', 'bg-[#00E5FF]', 'bg-[#00B8D4]',
    'bg-yellow-400', 'bg-green-400', 'bg-purple-400', 'bg-pink-400',
  ];
  const confettiParticles = useMemo(() =>
    Array.from({ length: 40 }).map((_, i) => ({
      id: i, delay: Math.random() * 0.8, x: Math.random() * 100,
      color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
    })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  const sparklePositions = useMemo(() =>
    Array.from({ length: 8 }).map((_, i) => ({
      id: i, angle: (i / 8) * Math.PI * 2,
      distance: 120 + Math.random() * 40, delay: i * 0.1,
    })),
  []);

  const handleCountComplete = () => {
    setShowSparkles(true);
    setTimeout(() => setShowSparkles(false), 2000);
  };

  const setMajorRoadmapStep = useOnboardingStore(s => s.setMajorRoadmapStep);
  const handleContinueClick = () => { setMajorRoadmapStep(1); onContinue(); };

  // ── Render ────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col font-simpler overflow-y-auto"
      style={{ background: 'linear-gradient(to bottom, #D8F3FF 0%, #F8FDFF 40%, white 100%)' }}
      dir={direction}
    >
      {/* Story bar */}
      <div
        className="sticky top-0 left-0 right-0 z-20"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <OnboardingStoryBar
          totalPhases={TOTAL_PHASES}
          currentPhase={STRENGTH_PHASES.RESULT}
          phaseLabel={STRENGTH_LABELS[STRENGTH_PHASES.RESULT]}
        />
      </div>

      {/* Confetti layer */}
      <AnimatePresence>
        {showConfetti && (
          <div className="fixed inset-0 pointer-events-none z-10">
            {confettiParticles.map(p => (
              <ConfettiParticle
                key={p.id} delay={p.delay} x={p.x}
                color={p.color} windowHeight={windowHeight}
              />
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Light burst (one-time on mount) */}
      <motion.div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 50% 40%, rgba(91,194,242,0.35) 0%, transparent 55%)',
        }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 2.5, opacity: [0, 0.9, 0] }}
        transition={{ duration: 2.2, ease: 'easeOut' }}
      />

      {/* ── PHASE: Calculating ────────────────────────────────────── */}
      <AnimatePresence>
        {revealPhase === 'calculating' && (
          <motion.div
            className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-6 px-8"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4 }}
          >
            {/* Pulsing icon cluster */}
            <div className="flex gap-3">
              {CATEGORY_DISPLAY.map((cat, i) => (
                <motion.div
                  key={cat.key}
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl"
                  style={{ backgroundColor: `${cat.color}20`, border: `1.5px solid ${cat.color}50` }}
                  animate={{ y: [0, -8, 0], opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 1.2, delay: i * 0.2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  {cat.emoji}
                </motion.div>
              ))}
            </div>
            <div className="text-center" dir="rtl">
              <motion.p
                className="text-xl font-black text-slate-700"
                animate={{ opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              >
                מנתח את הביצועים שלך...
              </motion.p>
              <p className="text-sm text-slate-400 mt-1 font-medium">
                {getProgramName()}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── MAIN CONTENT (cards → gauge → insights) ───────────────── */}
      <div className="flex flex-col items-center px-5 pt-4 pb-10 gap-4 relative z-10">

        {/* ── Category Cards — appear first, stagger in ────────────── */}
        <AnimatePresence>
          {revealPhase !== 'calculating' && (
            <motion.div
              className="w-full max-w-sm flex gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              {hasCategoryData
                ? CATEGORY_DISPLAY.map((cat, i) => (
                    <CategoryCard
                      key={cat.key}
                      cat={cat}
                      levelValue={assessmentLevels?.[cat.key]}
                      delay={i * 0.18}
                    />
                  ))
                : CATEGORY_DISPLAY.map((cat, i) => (
                    // Skeleton if no data yet (e.g. path 3/skills)
                    <motion.div
                      key={cat.key}
                      className="flex-1 rounded-2xl h-20 bg-slate-100"
                      style={{ border: `2px solid ${cat.color}30` }}
                      initial={{ opacity: 0, scale: 0.7, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ delay: i * 0.18, type: 'spring', stiffness: 280, damping: 22 }}
                    />
                  ))
              }
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Hero Card with CircularGauge — appears second ────────── */}
        <AnimatePresence>
          {(revealPhase === 'gauge' || revealPhase === 'insights') && (
            <motion.div
              className="w-full max-w-sm relative"
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.55, ease: 'easeOut' }}
            >
              {/* Sparkle effects */}
              <AnimatePresence>
                {showSparkles && (
                  <div className="absolute inset-0 pointer-events-none">
                    {sparklePositions.map(s => (
                      <SparkleEffect key={s.id} delay={s.delay} angle={s.angle} distance={s.distance} />
                    ))}
                  </div>
                )}
              </AnimatePresence>

              <div
                className="bg-white rounded-[40px] p-7 text-center"
                style={{ boxShadow: '0 20px 50px rgba(91,194,242,0.22), 0 6px 18px rgba(0,0,0,0.07)' }}
              >
                {/* Program name */}
                <h2 className="text-xl font-black text-slate-800 mb-5" dir="rtl">
                  {getProgramName()}
                </h2>

                {/* Gauge */}
                <div className="flex justify-center mb-5">
                  {programLoading ? (
                    <div
                      className="w-[200px] h-[200px] rounded-full bg-slate-100 animate-pulse
                                 flex items-center justify-center"
                    >
                      <div className="w-10 h-10 border-2 border-slate-300 border-t-cyan-400 rounded-full animate-spin" />
                    </div>
                  ) : (
                    <CircularGauge
                      levelNumber={levelNumber}
                      levelName={levelName}
                      onCountComplete={handleCountComplete}
                    />
                  )}
                </div>

                {/* Achievement / social-proof text */}
                <p className="text-sm text-slate-500 leading-relaxed px-2" dir="rtl">
                  {achievementText}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Educational copy + Continue button — appear last ────────── */}
        <AnimatePresence>
          {revealPhase === 'insights' && (
            <motion.div
              className="w-full max-w-sm flex flex-col gap-4"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            >
              {/* Progression education copy */}
              <p
                className="text-center text-base text-slate-500 leading-relaxed px-2 font-medium"
                dir="rtl"
              >
                המסע שלך מתחיל עכשיו! כל אימון בתוכנית יעלה אותך באחוזים, עד שתגיע/י לרמה הבאה.
              </p>

              <button
                onClick={handleContinueClick}
                className="w-full text-white font-black text-lg py-4 rounded-2xl
                           shadow-lg transition-all duration-200 active:scale-95"
                style={{ background: BRAND_GRADIENT, boxShadow: '0 8px 24px rgba(0,186,247,0.35)' }}
                dir="rtl"
              >
                {continueLabel}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
