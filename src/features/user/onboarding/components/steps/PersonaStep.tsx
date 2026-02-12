'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';

interface PersonaStepProps {
  onNext: () => void;
}

// Lifestyle persona options with gender-specific labels
interface LifestyleOption {
  id: string;
  labelHeMale: string;
  labelHeFemale: string;
  labelEn: string;
  emoji: string;
  emojiMale?: string;
  emojiFemale?: string;
  tags: string[];
  color: string;
}

const LIFESTYLE_OPTIONS: LifestyleOption[] = [
  {
    id: 'parent',
    labelHeMale: 'אבא',
    labelHeFemale: 'אמא',
    labelEn: 'Parent',
    emoji: '👨‍👧',
    emojiMale: '👨‍👧',
    emojiFemale: '👩‍👧',
    tags: ['parent', 'busy'],
    color: '#EC4899',
  },
  {
    id: 'student',
    labelHeMale: 'סטודנט',
    labelHeFemale: 'סטודנטית',
    labelEn: 'Student',
    emoji: '🎓',
    tags: ['student', 'young'],
    color: '#8B5CF6',
  },
  {
    id: 'pupil',
    labelHeMale: 'תלמיד',
    labelHeFemale: 'תלמידה',
    labelEn: 'Pupil',
    emoji: '📚',
    tags: ['pupil', 'young', 'school'],
    color: '#F59E0B',
  },
  {
    id: 'office_worker',
    labelHeMale: 'עובד משרד',
    labelHeFemale: 'עובדת משרד',
    labelEn: 'Office Worker',
    emoji: '💼',
    tags: ['office_worker', 'wfh'],
    color: '#3B82F6',
  },
  {
    id: 'reservist',
    labelHeMale: 'מילואימניק',
    labelHeFemale: 'מילואימניקית',
    labelEn: 'Reservist',
    emoji: '🎖️',
    tags: ['reservist', 'military', 'busy'],
    color: '#16A34A',
  },
  {
    id: 'soldier',
    labelHeMale: 'חייל סדיר',
    labelHeFemale: 'חיילת סדיר',
    labelEn: 'Soldier',
    emoji: '🪖',
    tags: ['soldier', 'military', 'active'],
    color: '#65A30D',
  },
  {
    id: 'vatikim',
    labelHeMale: 'גיל הזהב',
    labelHeFemale: 'גיל הזהב',
    labelEn: 'Golden Age',
    emoji: '🧓',
    tags: ['vatikim', 'senior', 'health'],
    color: '#F97316',
  },
  {
    id: 'pro_athlete',
    labelHeMale: 'ספורטאי קצה',
    labelHeFemale: 'ספורטאית קצה',
    labelEn: 'Pro Athlete',
    emoji: '🏋️',
    tags: ['pro_athlete', 'advanced', 'performance'],
    color: '#DC2626',
  },
];

// Goal options - Short Title (for chips) and Long Description (for Mad-libs)
interface GoalOption {
  id: string;
  // Short title for selection chips
  shortTitleHe: string;
  shortTitleEn: string;
  // Long description for Mad-libs sentence
  longDescHe: string;
  longDescEn: string;
  tag: string;
}

const GOAL_OPTIONS: GoalOption[] = [
  { 
    id: 'routine', 
    shortTitleHe: 'שגרה קבועה', 
    shortTitleEn: 'Routine',
    longDescHe: 'להתמיד ולבנות שגרה קבועה',
    longDescEn: 'build and maintain a steady routine',
    tag: 'goal_routine' 
  },
  { 
    id: 'aesthetics', 
    shortTitleHe: 'חיטוב ואסתטיקה', 
    shortTitleEn: 'Toning',
    longDescHe: 'לבנות גוף חטוב ואסתטי',
    longDescEn: 'build a toned and aesthetic body',
    tag: 'goal_aesthetics' 
  },
  { 
    id: 'fitness', 
    shortTitleHe: 'כושר ובריאות', 
    shortTitleEn: 'Health',
    longDescHe: 'לשמור על כושר כללי ובריאות לטווח ארוך',
    longDescEn: 'maintain general fitness and long-term health',
    tag: 'goal_fitness' 
  },
  { 
    id: 'performance', 
    shortTitleHe: 'שיפור ביצועים', 
    shortTitleEn: 'Performance',
    longDescHe: 'להשתפר בביצועים בענף הספורט שלי',
    longDescEn: 'improve performance in my sport',
    tag: 'goal_performance' 
  },
  { 
    id: 'skills', 
    shortTitleHe: 'מיומנות מתקדמת', 
    shortTitleEn: 'Skills',
    longDescHe: 'ללמוד תרגילים מתקדמים (מתח, פלאנץ\' וכו\')',
    longDescEn: 'learn advanced exercises (pull-ups, planche, etc.)',
    tag: 'goal_skills' 
  },
  { 
    id: 'community', 
    shortTitleHe: 'קהילה', 
    shortTitleEn: 'Community',
    longDescHe: 'להכיר שותפים חדשים ולהצטרף לקהילה מקומית',
    longDescEn: 'meet new partners and join a local community',
    tag: 'goal_community' 
  },
];

const MAX_GOALS = 2;

export default function PersonaStep({ onNext }: PersonaStepProps) {
  const { updateData, data } = useOnboardingStore();
  
  // Get user gender from sessionStorage
  const userGender = useMemo(() => {
    if (typeof window === 'undefined') return 'male';
    const stored = sessionStorage.getItem('onboarding_personal_gender');
    return stored === 'female' ? 'female' : 'male';
  }, []);
  
  // Local state - multi-select for personas, multi-select (max 2) for goals
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>(() => {
    const storedIds = (data as any).selectedPersonaIds;
    if (Array.isArray(storedIds) && storedIds.length > 0) {
      return storedIds;
    }
    const singleId = data.selectedPersonaId;
    return singleId ? [singleId] : [];
  });
  
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>(() => {
    // Support migration from single goal to multi
    const storedGoals = (data as any).selectedGoalIds;
    if (Array.isArray(storedGoals) && storedGoals.length > 0) {
      return storedGoals;
    }
    const singleGoal = (data as any).selectedGoal;
    return singleGoal ? [singleGoal] : [];
  });
  
  // Get language
  const savedLanguage: OnboardingLanguage = (typeof window !== 'undefined'
    ? (sessionStorage.getItem('onboarding_language') || 'he')
    : 'he') as OnboardingLanguage;
  const isHebrew = savedLanguage === 'he';
  const direction = isHebrew ? 'rtl' : 'ltr';

  // Check if can continue - need at least one persona AND at least one goal
  const canContinue = selectedPersonaIds.length > 0 && selectedGoalIds.length > 0;

  // Get label based on gender
  const getPersonaLabel = (option: LifestyleOption): string => {
    if (!isHebrew) return option.labelEn;
    return userGender === 'female' ? option.labelHeFemale : option.labelHeMale;
  };
  
  // Get emoji based on gender
  const getPersonaEmoji = (option: LifestyleOption): string => {
    if (userGender === 'female' && option.emojiFemale) return option.emojiFemale;
    if (userGender === 'male' && option.emojiMale) return option.emojiMale;
    return option.emoji;
  };

  // Collect all lifestyle tags
  const collectAllTags = (personaIds: string[], goalIds: string[]): string[] => {
    const tags: string[] = [];
    personaIds.forEach(id => {
      const option = LIFESTYLE_OPTIONS.find(o => o.id === id);
      if (option) tags.push(...option.tags);
    });
    goalIds.forEach(id => {
      const goal = GOAL_OPTIONS.find(g => g.id === id);
      if (goal) tags.push(goal.tag);
    });
    return Array.from(new Set(tags));
  };

  // Handle persona toggle (multi-select)
  const handlePersonaToggle = (option: LifestyleOption) => {
    let newSelectedIds: string[];
    
    if (selectedPersonaIds.includes(option.id)) {
      newSelectedIds = selectedPersonaIds.filter(id => id !== option.id);
    } else {
      newSelectedIds = [...selectedPersonaIds, option.id];
    }
    
    setSelectedPersonaIds(newSelectedIds);
    const allTags = collectAllTags(newSelectedIds, selectedGoalIds);
    
    updateData({
      selectedPersonaId: newSelectedIds[0] || null,
      selectedPersonaIds: newSelectedIds,
      lifestyleTags: allTags,
    } as any);
    
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('onboarding_selected_persona_ids', JSON.stringify(newSelectedIds));
      sessionStorage.setItem('onboarding_selected_persona_tags', JSON.stringify(allTags));
    }
  };

  // Handle goal toggle (multi-select, max 2)
  const handleGoalToggle = (goal: GoalOption) => {
    let newSelectedIds: string[];
    
    if (selectedGoalIds.includes(goal.id)) {
      // Deselect
      newSelectedIds = selectedGoalIds.filter(id => id !== goal.id);
    } else {
      // Select - check max limit
      if (selectedGoalIds.length >= MAX_GOALS) {
        // Replace oldest selection
        newSelectedIds = [...selectedGoalIds.slice(1), goal.id];
      } else {
        newSelectedIds = [...selectedGoalIds, goal.id];
      }
    }
    
    setSelectedGoalIds(newSelectedIds);
    const allTags = collectAllTags(selectedPersonaIds, newSelectedIds);
    
    // Get short titles for store and long descriptions for display
    const goalShortTitles = newSelectedIds.map(id => {
      const g = GOAL_OPTIONS.find(go => go.id === id);
      return g ? (isHebrew ? g.shortTitleHe : g.shortTitleEn) : '';
    }).filter(Boolean);
    
    const goalLongDescs = newSelectedIds.map(id => {
      const g = GOAL_OPTIONS.find(go => go.id === id);
      return g ? (isHebrew ? g.longDescHe : g.longDescEn) : '';
    }).filter(Boolean);
    
    updateData({
      selectedGoal: newSelectedIds[0] || null,
      selectedGoalIds: newSelectedIds,
      selectedGoalLabel: goalShortTitles.join(isHebrew ? ' ו-' : ' & '),
      selectedGoalDescription: goalLongDescs.join('; '),
      lifestyleTags: allTags,
    } as any);
    
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('onboarding_selected_goals', JSON.stringify(newSelectedIds));
    }
  };

  // Handle continue
  const handleContinue = () => {
    if (canContinue) onNext();
  };

  // Get selected lifestyles label for Mad-libs sentence
  const getSelectedLifestyleLabel = () => {
    if (selectedPersonaIds.length === 0) return '___';
    
    if (selectedPersonaIds.length === 1) {
      const option = LIFESTYLE_OPTIONS.find(o => o.id === selectedPersonaIds[0]);
      return option ? getPersonaLabel(option) : '___';
    }
    
    if (selectedPersonaIds.length === 2) {
      const option1 = LIFESTYLE_OPTIONS.find(o => o.id === selectedPersonaIds[0]);
      const option2 = LIFESTYLE_OPTIONS.find(o => o.id === selectedPersonaIds[1]);
      if (isHebrew) {
        return `${option1 ? getPersonaLabel(option1) : ''} ו${option2 ? getPersonaLabel(option2) : ''}`;
      }
      return `${option1?.labelEn} & ${option2?.labelEn}`;
    }
    
    // 3+ selections
    if (selectedPersonaIds.length === 3) {
      const options = selectedPersonaIds.map(id => LIFESTYLE_OPTIONS.find(o => o.id === id));
      if (isHebrew) {
        return `${options[0] ? getPersonaLabel(options[0]) : ''}, ${options[1] ? getPersonaLabel(options[1]) : ''} ו${options[2] ? getPersonaLabel(options[2]) : ''}`;
      }
      return `${options[0]?.labelEn}, ${options[1]?.labelEn} & ${options[2]?.labelEn}`;
    }
    
    return isHebrew ? (userGender === 'female' ? 'פעילה במגוון תחומים' : 'פעיל במגוון תחומים') : 'multi-faceted';
  };

  // Get selected goals LONG DESCRIPTION for Mad-libs sentence (THE FLIP!)
  const getSelectedGoalsLabel = () => {
    if (selectedGoalIds.length === 0) return '___';
    
    if (selectedGoalIds.length === 1) {
      const goal = GOAL_OPTIONS.find(g => g.id === selectedGoalIds[0]);
      return goal ? (isHebrew ? goal.longDescHe : goal.longDescEn) : '___';
    }
    
    // 2 goals - join with "ו-"
    const goal1 = GOAL_OPTIONS.find(g => g.id === selectedGoalIds[0]);
    const goal2 = GOAL_OPTIONS.find(g => g.id === selectedGoalIds[1]);
    if (isHebrew) {
      return `${goal1?.longDescHe} ו${goal2?.longDescHe}`;
    }
    return `${goal1?.longDescEn} & ${goal2?.longDescEn}`;
  };

  return (
    <div className="flex flex-col h-full" dir={direction}>
      {/* Mad-libs Sentence Card - Sticky at top with blur */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/90 backdrop-blur-md rounded-2xl p-4 mb-4 shadow-[0_4px_20px_rgba(91,194,242,0.1)] border border-slate-100/80 sticky top-0 z-10"
      >
        <div className={`text-base font-bold text-slate-800 leading-relaxed text-center ${isHebrew ? 'font-simpler' : ''}`}>
          {isHebrew ? (
            <>
              אני{' '}
              <span className={`inline-block px-2 py-0.5 rounded-md text-sm transition-all ${
                selectedPersonaIds.length > 0
                  ? 'bg-[#5BC2F2]/10 text-[#5BC2F2] border border-[#5BC2F2]/50' 
                  : 'bg-slate-100 text-slate-400 border border-dashed border-slate-200'
              }`}>
                {getSelectedLifestyleLabel()}
              </span>
              {' '}שרוצה{' '}
              <span className={`inline-block px-2 py-0.5 rounded-md text-sm transition-all ${
                selectedGoalIds.length > 0
                  ? 'bg-[#5BC2F2]/10 text-[#5BC2F2] border border-[#5BC2F2]/50' 
                  : 'bg-slate-100 text-slate-400 border border-dashed border-slate-200'
              }`}>
                {getSelectedGoalsLabel()}
              </span>
            </>
          ) : (
            <>
              I&apos;m a{' '}
              <span className={`inline-block px-2 py-0.5 rounded-md text-sm transition-all ${
                selectedPersonaIds.length > 0
                  ? 'bg-[#5BC2F2]/10 text-[#5BC2F2] border border-[#5BC2F2]/50' 
                  : 'bg-slate-100 text-slate-400 border border-dashed border-slate-200'
              }`}>
                {getSelectedLifestyleLabel()}
              </span>
              {' '}who wants to{' '}
              <span className={`inline-block px-2 py-0.5 rounded-md text-sm transition-all ${
                selectedGoalIds.length > 0
                  ? 'bg-[#5BC2F2]/10 text-[#5BC2F2] border border-[#5BC2F2]/50' 
                  : 'bg-slate-100 text-slate-400 border border-dashed border-slate-200'
              }`}>
                {getSelectedGoalsLabel()}
              </span>
            </>
          )}
        </div>
      </motion.div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 pb-2">
        {/* Persona Selection - Compact 2-column grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-5"
        >
          <div className="mb-3 px-1">
            <p className="text-xs text-slate-500 mb-2 leading-relaxed" style={{ fontFamily: 'var(--font-simpler)' }}>
              {isHebrew 
                ? 'סמנו את מה שהכי מגדיר אתכם. אם יש כמה, בחרו אותם לפי סדר החשיבות עבורכם.'
                : 'Select what defines you best. If multiple apply, choose them in order of importance.'}
            </p>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-600">
                {isHebrew ? (userGender === 'female' ? 'מי את?' : 'מי אתה?') : 'Who are you?'}
              </h3>
              {selectedPersonaIds.length > 0 && (
                <span className="text-xs font-bold text-[#5BC2F2] bg-[#5BC2F2]/10 px-2 py-0.5 rounded-full">
                  {selectedPersonaIds.length}
                </span>
              )}
            </div>
          </div>
          
          {/* Compact 2-column grid */}
          <div className="grid grid-cols-2 gap-2">
            {LIFESTYLE_OPTIONS.map((option, index) => {
              const isSelected = selectedPersonaIds.includes(option.id);
              return (
                <motion.button
                  key={option.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.05 + index * 0.02 }}
                  onClick={() => handlePersonaToggle(option)}
                  className={`relative flex items-center gap-2.5 p-3 rounded-xl transition-all duration-200 ${
                    isSelected
                      ? 'bg-white shadow-[0_4px_16px_rgba(91,194,242,0.12)]'
                      : 'bg-slate-50/80 hover:bg-white hover:shadow-sm'
                  }`}
                  style={{
                    borderWidth: '1.5px',
                    borderStyle: 'solid',
                    borderColor: isSelected ? option.color : 'transparent',
                  }}
                >
                  {/* Emoji */}
                  <span className="text-xl flex-shrink-0">{getPersonaEmoji(option)}</span>
                  
                  {/* Label */}
                  <span className={`text-sm font-bold flex-1 text-right ${
                    isSelected ? 'text-slate-900' : 'text-slate-600'
                  }`}>
                    {getPersonaLabel(option)}
                  </span>
                  
                  {/* Selection Indicator */}
                  <AnimatePresence>
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: option.color }}
                      >
                        <Check size={12} className="text-white" strokeWidth={3} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        {/* Goal Selection - Multi-Select (Max 2) - SHORT TITLES on Chips */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-4"
        >
          <div className="flex items-center justify-between mb-2 px-1">
            <h3 className="text-sm font-bold text-slate-600">
              {isHebrew ? 'מה המטרות שלך? (עד 2)' : 'Your goals? (up to 2)'}
            </h3>
            {selectedGoalIds.length > 0 && (
              <span className="text-xs font-bold text-[#5BC2F2] bg-[#5BC2F2]/10 px-2 py-0.5 rounded-full">
                {selectedGoalIds.length}/{MAX_GOALS}
              </span>
            )}
          </div>
          
          {/* Goal Chips - Show SHORT Title */}
          <div className="flex flex-wrap gap-2">
            {GOAL_OPTIONS.map((goal) => {
              const isSelected = selectedGoalIds.includes(goal.id);
              return (
                <motion.button
                  key={goal.id}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleGoalToggle(goal)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    isSelected
                      ? 'bg-[#5BC2F2] text-white shadow-[0_4px_16px_rgba(91,194,242,0.25)]'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {isSelected && (
                    <motion.span
                      initial={{ scale: 0, width: 0 }}
                      animate={{ scale: 1, width: 'auto' }}
                      className="flex items-center justify-center w-4 h-4 bg-white/25 rounded-full"
                    >
                      <Check size={10} className="text-white" strokeWidth={3} />
                    </motion.span>
                  )}
                  <span>{isHebrew ? goal.shortTitleHe : goal.shortTitleEn}</span>
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* Fixed Bottom - Continue Button */}
      <div className="flex-shrink-0 pt-2 pb-4 bg-gradient-to-t from-white via-white to-transparent">
        {/* Validation hint */}
        <AnimatePresence>
          {!canContinue && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="text-center text-xs text-slate-400 mb-2"
            >
              {isHebrew 
                ? (userGender === 'female' ? 'בחרי לפחות פרסונה אחת ומטרה אחת' : 'בחר לפחות פרסונה אחת ומטרה אחת')
                : 'Select at least one persona and one goal'
              }
            </motion.p>
          )}
        </AnimatePresence>
        
        <button
          onClick={handleContinue}
          disabled={!canContinue}
          className={`w-full py-3.5 rounded-2xl font-black text-base transition-all duration-300 ${
            canContinue
              ? 'bg-[#5BC2F2] text-white shadow-lg shadow-[#5BC2F2]/30 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          {isHebrew ? 'המשך' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
