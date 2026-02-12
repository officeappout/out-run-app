'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  MapPin, 
  Calendar, 
  Dumbbell,
  TreePine,
  Home,
  Building2,
  Clock,
  ChevronLeft,
  Target,
  TrendingUp,
  Unlock,
  Wrench,
  Scale,
  Plus,
  ChevronDown
} from 'lucide-react';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';
import {
  generateRecommendations,
  buildContextFromOnboarding,
  type Recommendation,
  type RecommendationType,
} from '../../services/recommendation.service';

interface SummaryStepProps {
  onNext: () => void;
}

// Lifestyle persona options (copied from PersonaStep for reference)
interface LifestyleOption {
  id: string;
  labelHeMale: string;
  labelHeFemale: string;
  labelEn: string;
  emoji: string;
  emojiMale?: string;
  emojiFemale?: string;
}

const LIFESTYLE_OPTIONS: LifestyleOption[] = [
  { id: 'parent', labelHeMale: 'אבא', labelHeFemale: 'אמא', labelEn: 'Parent', emoji: '👨‍👧', emojiMale: '👨‍👧', emojiFemale: '👩‍👧' },
  { id: 'student', labelHeMale: 'סטודנט', labelHeFemale: 'סטודנטית', labelEn: 'Student', emoji: '🎓' },
  { id: 'pupil', labelHeMale: 'תלמיד', labelHeFemale: 'תלמידה', labelEn: 'Pupil', emoji: '📚' },
  { id: 'office_worker', labelHeMale: 'עובד משרד', labelHeFemale: 'עובדת משרד', labelEn: 'Office Worker', emoji: '💼' },
  { id: 'reservist', labelHeMale: 'מילואימניק', labelHeFemale: 'מילואימניקית', labelEn: 'Reservist', emoji: '🎖️' },
  { id: 'soldier', labelHeMale: 'חייל סדיר', labelHeFemale: 'חיילת סדיר', labelEn: 'Soldier', emoji: '🪖' },
];

// Goal options
interface GoalOption {
  id: string;
  longDescHe: string;
  longDescEn: string;
}

const GOAL_OPTIONS: GoalOption[] = [
  { id: 'routine', longDescHe: 'להתמיד ולבנות שגרה קבועה', longDescEn: 'build and maintain a steady routine' },
  { id: 'aesthetics', longDescHe: 'לבנות גוף חטוב ואסתטי', longDescEn: 'build a toned and aesthetic body' },
  { id: 'fitness', longDescHe: 'לשמור על כושר כללי ובריאות לטווח ארוך', longDescEn: 'maintain general fitness and long-term health' },
  { id: 'performance', longDescHe: 'להשתפר בביצועים בענף הספורט שלי', longDescEn: 'improve performance in my sport' },
  { id: 'skills', longDescHe: 'ללמוד תרגילים מתקדמים', longDescEn: 'learn advanced exercises' },
  { id: 'community', longDescHe: 'להכיר שותפים חדשים ולהצטרף לקהילה', longDescEn: 'meet new partners and join a community' },
];

// Equipment type icons
const getEquipmentIcon = (type: string) => {
  switch (type) {
    case 'gym': return Building2;
    case 'home': return Home;
    case 'park': return TreePine;
    default: return Dumbbell;
  }
};

// ── Recommendation Icon Helper ──────────────────────────────────────
function getRecommendationIcon(type: RecommendationType) {
  switch (type) {
    case 'ADD_ON': return Unlock;
    case 'UPGRADE': return TrendingUp;
    case 'COMPLEMENTARY': return Scale;
    case 'EQUIPMENT': return Wrench;
    case 'GOAL_ALIGNED': return Target;
    default: return Plus;
  }
}

function getRecommendationColor(type: RecommendationType): string {
  switch (type) {
    case 'ADD_ON': return 'text-emerald-500 bg-emerald-50';
    case 'UPGRADE': return 'text-amber-500 bg-amber-50';
    case 'COMPLEMENTARY': return 'text-blue-500 bg-blue-50';
    case 'EQUIPMENT': return 'text-purple-500 bg-purple-50';
    case 'GOAL_ALIGNED': return 'text-cyan-500 bg-cyan-50';
    default: return 'text-gray-500 bg-gray-50';
  }
}

export default function SummaryStep({ onNext }: SummaryStepProps) {
  const { data } = useOnboardingStore();
  const [isButtonPressed, setIsButtonPressed] = useState(false);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [showAllRecs, setShowAllRecs] = useState(false);
  const [recsLoading, setRecsLoading] = useState(true);
  
  // Get language
  const savedLanguage: OnboardingLanguage = (typeof window !== 'undefined'
    ? (sessionStorage.getItem('onboarding_language') || 'he')
    : 'he') as OnboardingLanguage;
  const isHebrew = savedLanguage === 'he';
  const direction = isHebrew ? 'rtl' : 'ltr';

  // ── Fetch Recommendations ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const fetchRecs = async () => {
      try {
        const context = buildContextFromOnboarding(data);
        const recs = await generateRecommendations(context);
        if (!cancelled) {
          setRecommendations(recs);
        }
      } catch (error) {
        console.error('[SummaryStep] Recommendation engine failed:', error);
      } finally {
        if (!cancelled) setRecsLoading(false);
      }
    };
    fetchRecs();
    return () => { cancelled = true; };
  }, [data]);
  
  // Get user gender
  const userGender = useMemo(() => {
    if (typeof window === 'undefined') return 'male';
    const stored = sessionStorage.getItem('onboarding_personal_gender');
    return stored === 'female' ? 'female' : 'male';
  }, []);
  const isFemale = userGender === 'female';
  
  // Get user name
  const userName = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem('onboarding_personal_name') || (data as any).name || '';
  }, [data]);
  
  // Get selected persona
  const selectedPersonaId = (data as any).selectedPersonaId;
  const selectedPersona = LIFESTYLE_OPTIONS.find(p => p.id === selectedPersonaId);
  const personaEmoji = selectedPersona 
    ? (isFemale && selectedPersona.emojiFemale) || selectedPersona.emojiMale || selectedPersona.emoji
    : '💪';
  const personaLabel = selectedPersona
    ? (isHebrew ? (isFemale ? selectedPersona.labelHeFemale : selectedPersona.labelHeMale) : selectedPersona.labelEn)
    : '';
  
  // Get selected goals
  const selectedGoalIds = (data as any).selectedGoals || [];
  const selectedGoals = GOAL_OPTIONS.filter(g => selectedGoalIds.includes(g.id));
  const goalSentence = selectedGoals.length > 0
    ? selectedGoals.map(g => isHebrew ? g.longDescHe : g.longDescEn).join(isHebrew ? ' ו' : ' and ')
    : (isHebrew ? 'להתחזק ולהתפתח' : 'get stronger and improve');
  
  // Get schedule info
  const scheduleDays = data.scheduleDayIndices || [];
  const dayNames = isHebrew 
    ? ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const selectedDays = scheduleDays.map((i: number) => dayNames[i]).join(', ');
  const trainingTime = data.trainingTime || '18:00';
  
  // Get equipment type
  const hasGym = data.hasGym;
  const equipmentList = data.equipmentList || [];
  const equipmentType = hasGym ? 'gym' : equipmentList.length > 0 ? 'home' : 'park';
  const EquipmentIcon = getEquipmentIcon(equipmentType);
  const equipmentLabel = isHebrew
    ? (hasGym ? 'חדר כושר' : equipmentList.length > 0 ? 'ציוד ביתי' : 'גינת כושר')
    : (hasGym ? 'Gym Access' : equipmentList.length > 0 ? 'Home Equipment' : 'Outdoor Park');
  
  // Get location name and rating
  const selectedParkName = (data as any).selectedParkName || (isHebrew ? 'הגינה שלך' : 'Your Park');
  const selectedParkRating: number | undefined = (data as any).selectedParkRating;
  
  // Handle button press
  const handleStartWorkout = () => {
    setIsButtonPressed(true);
    setTimeout(() => {
      onNext();
    }, 300);
  };

  return (
    <div className="flex flex-col h-full" dir={direction}>
      {/* Header - Personalized Greeting */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-6"
      >
        <h1 className="text-2xl font-black text-slate-900 mb-1">
          {isHebrew 
            ? `הכל מוכן${userName ? `, ${userName}` : ''}!`
            : `All Set${userName ? `, ${userName}` : ''}!`}
        </h1>
        <p className="text-base text-slate-600 font-medium">
          {isHebrew ? 'בואו נתחיל 🚀' : "Let's get started 🚀"}
        </p>
      </motion.div>

      {/* Main Content Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="premium-card p-5 space-y-5 mb-6"
      >
        {/* Persona & Goal Section */}
        <div className="flex items-center gap-4">
          {/* Persona Emoji */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, delay: 0.3 }}
            className="w-16 h-16 rounded-3xl bg-gradient-to-br from-[#5BC2F2]/20 to-[#5BC2F2]/5 flex items-center justify-center text-3xl shadow-lg shadow-[#5BC2F2]/10"
          >
            {personaEmoji}
          </motion.div>
          
          {/* Goal Sentence */}
          <div className="flex-1">
            <p className="text-sm text-slate-500 font-medium mb-1">
              {isHebrew ? 'המטרה שלך' : 'Your Goal'}
            </p>
            <p className="text-base font-bold text-slate-900 leading-snug">
              {goalSentence}
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-slate-100" />

        {/* Plan Details Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Equipment */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="flex items-center gap-2 p-3 rounded-2xl bg-slate-50"
          >
            <div className="w-8 h-8 rounded-xl bg-[#5BC2F2]/10 flex items-center justify-center">
              <EquipmentIcon size={16} className="text-[#5BC2F2]" strokeWidth={2} />
            </div>
            <span className="text-sm font-semibold text-slate-700">{equipmentLabel}</span>
          </motion.div>

          {/* Frequency */}
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.45 }}
            className="flex items-center gap-2 p-3 rounded-2xl bg-slate-50"
          >
            <div className="w-8 h-8 rounded-xl bg-[#10B981]/10 flex items-center justify-center">
              <Calendar size={16} className="text-[#10B981]" strokeWidth={2} />
            </div>
            <span className="text-sm font-semibold text-slate-700">
              {scheduleDays.length} {isHebrew ? 'פעמים בשבוע' : 'times/week'}
            </span>
          </motion.div>

          {/* Location */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="flex items-center gap-2 p-3 rounded-2xl bg-slate-50 col-span-2"
          >
            <div className="w-8 h-8 rounded-xl bg-[#F59E0B]/10 flex items-center justify-center">
              <MapPin size={16} className="text-[#F59E0B]" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-semibold text-slate-700 truncate block">{selectedParkName}</span>
              {selectedParkRating != null && selectedParkRating >= 4 && (
                <span className="text-xs text-amber-500 font-bold">
                  {isHebrew
                    ? `מצאנו לך מגרש מעולה בדירוג ${selectedParkRating.toFixed(1)} כוכבים ⭐`
                    : `We found a great spot rated ${selectedParkRating.toFixed(1)} stars ⭐`}
                </span>
              )}
              {selectedParkRating != null && selectedParkRating > 0 && selectedParkRating < 4 && (
                <span className="text-xs text-amber-500 font-bold">
                  ⭐ {selectedParkRating.toFixed(1)}
                </span>
              )}
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* ── Smart Recommendations: "Next Steps" ──────────────────────── */}
      {!recsLoading && recommendations.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.55 }}
          className="mb-4"
        >
          <div className="flex items-center gap-2 mb-3 px-1">
            <Sparkles size={16} className="text-amber-500" />
            <h3 className="text-sm font-bold text-slate-700">
              {isHebrew ? 'המלצות מותאמות אישית' : 'Personalized Recommendations'}
            </h3>
          </div>

          <div className="space-y-2">
            <AnimatePresence>
              {(showAllRecs ? recommendations : recommendations.slice(0, 3)).map((rec, idx) => {
                const Icon = getRecommendationIcon(rec.type);
                const colorClasses = getRecommendationColor(rec.type);
                const [iconColor, bgColor] = colorClasses.split(' ');

                return (
                  <motion.div
                    key={rec.id}
                    initial={{ opacity: 0, x: isHebrew ? 20 : -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: isHebrew ? 20 : -20 }}
                    transition={{ delay: 0.6 + idx * 0.08 }}
                    className="flex items-center gap-3 p-3 rounded-2xl bg-white border border-slate-100 shadow-sm"
                  >
                    {/* Icon */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${bgColor}`}>
                      <Icon size={16} className={iconColor} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{rec.title}</p>
                      <p className="text-xs text-slate-500 line-clamp-1">{rec.reason}</p>
                    </div>

                    {/* Level badge (if from Level Equivalence) */}
                    {rec.suggestedLevel && (
                      <div className="flex-shrink-0 px-2 py-1 bg-emerald-100 rounded-lg">
                        <span className="text-xs font-bold text-emerald-700">
                          Lvl {rec.suggestedLevel}
                        </span>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Show more / less toggle */}
            {recommendations.length > 3 && (
              <button
                onClick={() => setShowAllRecs(!showAllRecs)}
                className="w-full flex items-center justify-center gap-1 py-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
              >
                <span>
                  {showAllRecs
                    ? (isHebrew ? 'הצג פחות' : 'Show less')
                    : (isHebrew ? `עוד ${recommendations.length - 3} המלצות` : `${recommendations.length - 3} more recommendations`)}
                </span>
                <ChevronDown size={14} className={`transition-transform ${showAllRecs ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>

          <p className="text-[11px] text-slate-400 text-center mt-2">
            {isHebrew
              ? 'ניתן להוסיף תוכניות בכל עת מתוך ההגדרות'
              : 'You can add programs anytime from Settings'}
          </p>
        </motion.div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Magic Button - The Grand Finale */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.6 }}
        className="pb-6"
      >
        <motion.button
          onClick={handleStartWorkout}
          disabled={isButtonPressed}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          animate={!isButtonPressed ? {
            boxShadow: [
              '0 8px 30px rgba(91, 194, 242, 0.4)',
              '0 12px 40px rgba(91, 194, 242, 0.6)',
              '0 8px 30px rgba(91, 194, 242, 0.4)',
            ],
          } : {}}
          transition={!isButtonPressed ? {
            boxShadow: {
              repeat: Infinity,
              duration: 2,
              ease: 'easeInOut',
            },
          } : {}}
          className={`w-full py-5 rounded-2xl font-black text-xl transition-all duration-300 flex items-center justify-center gap-3 ${
            isButtonPressed
              ? 'bg-[#10B981] text-white'
              : 'bg-gradient-to-r from-[#5BC2F2] to-[#3B82F6] text-white'
          }`}
        >
          {isButtonPressed ? (
            <>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400 }}
              >
                <Sparkles size={24} />
              </motion.div>
              <span>{isHebrew ? '!בואו' : "Let's Go!"}</span>
            </>
          ) : (
            <>
              <span>{isHebrew ? 'כניסה לאימון הראשון' : 'Start Your First Workout'}</span>
              <motion.div
                animate={{ x: [0, 5, 0] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              >
                <ChevronLeft size={24} className={!isHebrew ? 'rotate-180' : ''} />
              </motion.div>
            </>
          )}
        </motion.button>
        
        {/* Subtle helper text */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="text-center text-xs text-slate-400 mt-3"
        >
          {isHebrew 
            ? 'תמיד אפשר לשנות את ההעדפות מאוחר יותר'
            : 'You can always change preferences later'}
        </motion.p>
      </motion.div>
    </div>
  );
}
