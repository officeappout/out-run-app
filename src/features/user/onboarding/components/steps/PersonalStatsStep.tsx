'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  History, 
  Check, 
  ChevronRight, 
  TreePine, 
  Weight,
  Sofa,
  Footprints,
  Flame,
  Users,
  Home,
  Building2,
  Sparkles,
  Zap,
  Dumbbell,
  Trophy,
  Heart,
  Swords,
  Mountain,
  ChevronDown,
} from 'lucide-react';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';
import WheelPicker from '@/components/ui/WheelPicker';

interface PersonalStatsStepProps {
  onNext: () => void;
}

// Training frequency options - with gender-specific descriptions
interface FrequencyOption {
  id: 'none' | '1-2' | '3+';
  labelHe: string;
  labelEn: string;
  descHeMale: string;
  descHeFemale: string;
  descEn: string;
  Icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  bgClass: string;
  iconColor: string;
}

const FREQUENCY_OPTIONS: FrequencyOption[] = [
  {
    id: 'none',
    labelHe: 'לא התאמנתי',
    labelEn: "I didn't train",
    descHeMale: 'עבר הרבה זמן שאני כבר לא זוכר',
    descHeFemale: 'עבר הרבה זמן שאני כבר לא זוכרת',
    descEn: "It's been so long I can't remember",
    Icon: Sofa,
    bgClass: 'bg-slate-50',
    iconColor: 'text-slate-500',
  },
  {
    id: '1-2',
    labelHe: '1-2 פעמים בשבוע',
    labelEn: '1-2 times a week',
    descHeMale: 'מתאמן מדי פעם',
    descHeFemale: 'מתאמנת מדי פעם',
    descEn: 'Training occasionally',
    Icon: Footprints,
    bgClass: 'bg-blue-50',
    iconColor: 'text-blue-500',
  },
  {
    id: '3+',
    labelHe: '3+ פעמים בשבוע',
    labelEn: '3+ times a week',
    descHeMale: 'מתאמן באופן קבוע',
    descHeFemale: 'מתאמנת באופן קבוע',
    descEn: 'Training regularly',
    Icon: Flame,
    bgClass: 'bg-orange-50',
    iconColor: 'text-orange-500',
  },
];

// Location options - where did you train
interface LocationOption {
  id: string;
  labelHe: string;
  labelEn: string;
  Icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
}

const LOCATION_OPTIONS: LocationOption[] = [
  { id: 'studio', labelHe: 'סטודיו או חוגים', labelEn: 'Studio or Classes', Icon: Users },
  { id: 'park', labelHe: 'גינת כושר', labelEn: 'Outdoor Gym', Icon: TreePine },
  { id: 'home', labelHe: 'אימון ביתי', labelEn: 'Home Workout', Icon: Home },
  { id: 'gym', labelHe: 'חדר כושר', labelEn: 'Gym', Icon: Building2 },
  { id: 'none', labelHe: 'אחר / אף אחד', labelEn: 'Other / None', Icon: Sparkles },
];

// Hierarchical Sport Categories
interface SportSubOption {
  id: string;
  labelHe: string;
  labelEn: string;
}

interface SportCategory {
  id: string;
  labelHe: string;
  labelEn: string;
  Icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  color: string;
  subOptions: SportSubOption[];
}

const SPORT_HIERARCHY: SportCategory[] = [
  {
    id: 'cardio',
    labelHe: 'אירובי וסיבולת',
    labelEn: 'Cardio & Endurance',
    Icon: Zap,
    color: '#3B82F6',
    subOptions: [
      { id: 'running', labelHe: 'ריצה', labelEn: 'Running' },
      { id: 'walking', labelHe: 'הליכה', labelEn: 'Walking' },
      { id: 'cycling', labelHe: 'אופניים', labelEn: 'Cycling' },
      { id: 'swimming', labelHe: 'שחייה', labelEn: 'Swimming' },
    ],
  },
  {
    id: 'strength',
    labelHe: 'כוח ותנועה',
    labelEn: 'Strength & Movement',
    Icon: Dumbbell,
    color: '#8B5CF6',
    subOptions: [
      { id: 'calisthenics', labelHe: 'קליסטניקס', labelEn: 'Calisthenics' },
      { id: 'crossfit', labelHe: 'קרוספיט', labelEn: 'CrossFit' },
      { id: 'functional', labelHe: 'אימון פונקציונלי', labelEn: 'Functional Training' },
      { id: 'movement', labelHe: 'מובמנט', labelEn: 'Movement' },
    ],
  },
  {
    id: 'ball_games',
    labelHe: 'משחקי כדור',
    labelEn: 'Ball Games',
    Icon: Trophy,
    color: '#F59E0B',
    subOptions: [
      { id: 'basketball', labelHe: 'כדורסל', labelEn: 'Basketball' },
      { id: 'football', labelHe: 'כדורגל', labelEn: 'Football' },
      { id: 'tennis_padel', labelHe: 'טניס ופאדל', labelEn: 'Tennis & Padel' },
    ],
  },
  {
    id: 'mind_body',
    labelHe: 'גוף ונפש',
    labelEn: 'Mind & Body',
    Icon: Heart,
    color: '#10B981',
    subOptions: [
      { id: 'yoga', labelHe: 'יוגה', labelEn: 'Yoga' },
      { id: 'pilates', labelHe: 'פילאטיס', labelEn: 'Pilates' },
      { id: 'stretching', labelHe: 'מתיחות', labelEn: 'Stretching' },
    ],
  },
  {
    id: 'martial_arts',
    labelHe: 'אומנויות לחימה',
    labelEn: 'Martial Arts',
    Icon: Swords,
    color: '#EF4444',
    subOptions: [
      { id: 'boxing', labelHe: 'איגרוף', labelEn: 'Boxing' },
      { id: 'mma', labelHe: 'קראטה/MMA', labelEn: 'Karate/MMA' },
      { id: 'self_defense', labelHe: 'הגנה עצמית', labelEn: 'Self Defense' },
    ],
  },
  {
    id: 'extreme',
    labelHe: 'אקסטרים וטיפוס',
    labelEn: 'Extreme & Climbing',
    Icon: Mountain,
    color: '#EC4899',
    subOptions: [
      { id: 'climbing', labelHe: 'טיפוס (בולידר)', labelEn: 'Climbing (Bouldering)' },
      { id: 'skateboard', labelHe: 'סקייטבורד ורולר', labelEn: 'Skateboard & Roller' },
    ],
  },
];

// Outdoor gym experience options - gender specific
interface OutdoorGymOption {
  id: 'yes' | 'sometimes' | 'never';
  labelHeMale: string;
  labelHeFemale: string;
  labelEn: string;
}

const OUTDOOR_GYM_OPTIONS: OutdoorGymOption[] = [
  { id: 'yes', labelHeMale: 'כן, מכיר היטב', labelHeFemale: 'כן, מכירה היטב', labelEn: 'Yes, I know them well' },
  { id: 'sometimes', labelHeMale: 'קצת, לא באופן קבוע', labelHeFemale: 'קצת, לא באופן קבוע', labelEn: 'A bit, not regularly' },
  { id: 'never', labelHeMale: 'אף פעם לא', labelHeFemale: 'אף פעם לא', labelEn: 'Never' },
];

export default function PersonalStatsStep({ onNext }: PersonalStatsStepProps) {
  const { updateData, data } = useOnboardingStore();
  
  // Refs for auto-scroll
  const locationSectionRef = useRef<HTMLDivElement>(null);
  const sportsSectionRef = useRef<HTMLDivElement>(null);
  const outdoorGymSectionRef = useRef<HTMLDivElement>(null);
  const continueButtonRef = useRef<HTMLDivElement>(null);
  
  // Smart scroll helper - centers the new section in the viewport
  const scrollToElement = (element: HTMLElement | null, centerInView: boolean = true) => {
    if (!element) return;
    
    setTimeout(() => {
      if (centerInView) {
        // Center the element in the viewport
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      } else {
        // Position at top with some breathing room
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
        // Add offset after scroll
        setTimeout(() => {
          window.scrollBy({ top: -40, behavior: 'smooth' });
        }, 100);
      }
    }, 350); // 350ms delay to show selection state and animation
  };
  
  // Get user gender from sessionStorage (stored during Phase 1)
  const userGender = useMemo(() => {
    if (typeof window === 'undefined') return 'male';
    const stored = sessionStorage.getItem('onboarding_personal_gender');
    return stored === 'female' ? 'female' : 'male';
  }, []);
  
  const isFemale = userGender === 'female';
  
  // Local state
  const [weight, setWeight] = useState<number>((data as any).weight || 70);
  const [trainingFrequency, setTrainingFrequency] = useState<'none' | '1-2' | '3+' | null>(
    (data as any).trainingHistory || null
  );
  const [selectedLocations, setSelectedLocations] = useState<string[]>(
    (data as any).historyLocations || []
  );
  const [selectedSports, setSelectedSports] = useState<string[]>(
    (data as any).historySports || []
  );
  const [outdoorGymExperience, setOutdoorGymExperience] = useState<'yes' | 'sometimes' | 'never' | null>(
    (data as any).outdoorGymExperience || null
  );
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const [currentSection, setCurrentSection] = useState<'weight' | 'history'>('weight');
  
  // Get language
  const savedLanguage: OnboardingLanguage = (typeof window !== 'undefined'
    ? (sessionStorage.getItem('onboarding_language') || 'he')
    : 'he') as OnboardingLanguage;
  const isHebrew = savedLanguage === 'he';
  const direction = isHebrew ? 'rtl' : 'ltr';

  // Progressive Disclosure - Step visibility conditions
  // Step 1: Frequency question - always visible
  // Step 2: Location question - visible after Step 1 is answered
  const showLocationStep = trainingFrequency !== null;
  
  // Step 3: Sports question - visible after at least one location is selected (or "none")
  const showSportsStep = showLocationStep && selectedLocations.length > 0;
  
  // Step 4: Outdoor gym question - visible after Step 3 AND if "park" NOT selected
  const showOutdoorGymQuestion = showSportsStep && 
    selectedSports.length > 0 && 
    !selectedLocations.includes('park');

  // Track previous values to detect changes
  const prevFrequency = useRef<typeof trainingFrequency>(null);
  const prevLocationsLength = useRef<number>(0);
  const prevSportsLength = useRef<number>(0);
  const prevOutdoorGymExp = useRef<typeof outdoorGymExperience>(null);
  
  // Auto-scroll to location section after frequency selection (Single-Select trigger)
  useEffect(() => {
    if (trainingFrequency && prevFrequency.current === null && locationSectionRef.current) {
      scrollToElement(locationSectionRef.current, true); // Center in view
    }
    prevFrequency.current = trainingFrequency;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainingFrequency]);
  
  // Auto-scroll to sports section when it first appears (after first location selection)
  useEffect(() => {
    if (selectedLocations.length === 1 && prevLocationsLength.current === 0 && sportsSectionRef.current) {
      scrollToElement(sportsSectionRef.current, true); // Center in view
    }
    prevLocationsLength.current = selectedLocations.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocations.length]);
  
  // Auto-scroll to outdoor gym section when it first appears (if shown)
  useEffect(() => {
    if (selectedSports.length === 1 && prevSportsLength.current === 0 && showOutdoorGymQuestion && outdoorGymSectionRef.current) {
      scrollToElement(outdoorGymSectionRef.current, true); // Center in view
    }
    // Update prevSportsLength only if sports changed
    if (selectedSports.length !== prevSportsLength.current) {
      prevSportsLength.current = selectedSports.length;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSports.length, showOutdoorGymQuestion]);
  
  // Auto-scroll to continue button after outdoor gym selection (Single-Select trigger)
  useEffect(() => {
    if (outdoorGymExperience && prevOutdoorGymExp.current === null && continueButtonRef.current) {
      scrollToElement(continueButtonRef.current, true); // Center continue button
    }
    prevOutdoorGymExp.current = outdoorGymExperience;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outdoorGymExperience]);
  
  // Auto-scroll to continue button when all sections complete without outdoor gym
  useEffect(() => {
    if (selectedSports.length === 1 && prevSportsLength.current === 0 && !showOutdoorGymQuestion && continueButtonRef.current) {
      scrollToElement(continueButtonRef.current, true); // Center continue button
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSports.length, showOutdoorGymQuestion]);

  // Check if can continue - need weight, frequency, at least one location, at least one sport
  // (outdoor gym required only if shown)
  const canContinue = weight > 0 && 
    trainingFrequency !== null && 
    selectedLocations.length > 0 &&
    selectedSports.length > 0 &&
    (!showOutdoorGymQuestion || outdoorGymExperience !== null);

  // Get gender-specific description
  const getFrequencyDesc = (option: FrequencyOption): string => {
    if (!isHebrew) return option.descEn;
    return isFemale ? option.descHeFemale : option.descHeMale;
  };

  // Get gender-specific outdoor gym label
  const getOutdoorGymLabel = (option: OutdoorGymOption): string => {
    if (!isHebrew) return option.labelEn;
    return isFemale ? option.labelHeFemale : option.labelHeMale;
  };

  // Handle weight change
  const handleWeightChange = (newWeight: number) => {
    setWeight(newWeight);
    updateData({ weight: newWeight } as any);
    
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('onboarding_weight', String(newWeight));
    }
  };

  // Handle frequency selection
  const handleFrequencySelect = (option: FrequencyOption) => {
    setTrainingFrequency(option.id);
    
    // If selecting 'none', clear locations and sports
    if (option.id === 'none') {
      setSelectedLocations([]);
      setSelectedSports([]);
      setOutdoorGymExperience(null);
      updateData({ 
        trainingHistory: option.id,
        historyFrequency: option.id,
        historyLocations: [],
        historySports: [],
        outdoorGymExperience: null,
      } as any);
    } else {
      updateData({ 
        trainingHistory: option.id,
        historyFrequency: option.id,
      } as any);
    }
    
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('onboarding_training_frequency', option.id);
    }
  };

  // Handle location toggle (multi-select)
  const handleLocationToggle = (location: LocationOption) => {
    let newSelectedLocations: string[];
    
    if (selectedLocations.includes(location.id)) {
      newSelectedLocations = selectedLocations.filter(id => id !== location.id);
    } else {
      newSelectedLocations = [...selectedLocations, location.id];
    }
    
    setSelectedLocations(newSelectedLocations);
    updateData({ historyLocations: newSelectedLocations } as any);
    
    // If user selects "park", clear outdoor gym experience (no longer needed)
    if (newSelectedLocations.includes('park')) {
      setOutdoorGymExperience(null);
      updateData({ outdoorGymExperience: null } as any);
    }
    
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('onboarding_history_locations', JSON.stringify(newSelectedLocations));
    }
  };

  // Handle category chip click - expand/collapse sub-options
  const handleCategoryToggle = (categoryId: string) => {
    setExpandedCategoryId(prev => prev === categoryId ? null : categoryId);
  };

  // Handle sub-option sport toggle (multi-select across categories)
  const handleSubSportToggle = (subOptionId: string) => {
    let newSelectedSports: string[];
    
    if (selectedSports.includes(subOptionId)) {
      newSelectedSports = selectedSports.filter(id => id !== subOptionId);
    } else {
      newSelectedSports = [...selectedSports, subOptionId];
    }
    
    setSelectedSports(newSelectedSports);
    
    // Generate sport tags (e.g. 'running' -> 'sport_running')
    const sportTags = newSelectedSports.map(id => `sport_${id}`);
    
    updateData({ 
      historySports: newSelectedSports,
      otherSportsTags: newSelectedSports,
      sportTags: sportTags,
    } as any);
    
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('onboarding_history_sports', JSON.stringify(newSelectedSports));
      sessionStorage.setItem('onboarding_selected_sports', JSON.stringify(newSelectedSports));
      sessionStorage.setItem('onboarding_sport_tags', JSON.stringify(sportTags));
    }
  };

  // Helper: get count of selected sub-options in a category
  const getSelectedCountInCategory = (category: SportCategory): number => {
    return category.subOptions.filter(sub => selectedSports.includes(sub.id)).length;
  };

  // Handle outdoor gym experience selection
  const handleOutdoorGymSelect = (option: OutdoorGymOption) => {
    setOutdoorGymExperience(option.id);
    updateData({ outdoorGymExperience: option.id } as any);
    
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('onboarding_outdoor_gym_exp', option.id);
    }
  };

  // Handle continue
  const handleContinue = () => {
    if (canContinue) {
      onNext();
    }
  };

  // Handle section navigation
  const goToHistory = () => {
    if (weight > 0) {
      setCurrentSection('history');
    }
  };

  const goToWeight = () => {
    setCurrentSection('weight');
  };

  return (
    <div className="flex flex-col h-full" dir={direction}>
      {/* Section Indicator */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-center gap-2 mb-4"
      >
        <button
          onClick={goToWeight}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
            currentSection === 'weight'
              ? 'bg-[#5BC2F2] text-white shadow-lg shadow-[#5BC2F2]/30'
              : weight > 0 
                ? 'bg-slate-100 text-slate-700' 
                : 'bg-slate-100 text-slate-400'
          }`}
        >
          <Weight size={16} />
          <span className="text-sm font-bold">{isHebrew ? 'משקל' : 'Weight'}</span>
          {weight > 0 && currentSection !== 'weight' && (
            <Check size={14} className="text-[#10B981]" />
          )}
        </button>
        <button
          onClick={goToHistory}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
            currentSection === 'history'
              ? 'bg-[#5BC2F2] text-white shadow-lg shadow-[#5BC2F2]/30'
              : trainingFrequency 
                ? 'bg-slate-100 text-slate-700'
                : 'bg-slate-100 text-slate-400'
          }`}
        >
          <History size={16} />
          <span className="text-sm font-bold">{isHebrew ? 'היסטוריה' : 'History'}</span>
          {trainingFrequency && currentSection !== 'history' && (
            <Check size={14} className="text-[#10B981]" />
          )}
        </button>
      </motion.div>

      {/* Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-1">
        <AnimatePresence mode="wait">
          {currentSection === 'weight' ? (
            <motion.div
              key="weight"
              initial={{ opacity: 0, x: isHebrew ? 20 : -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: isHebrew ? -20 : 20 }}
              transition={{ duration: 0.3 }}
              className="h-full flex flex-col"
            >
              {/* Hero Header */}
              <div className="text-center pt-4 mb-4">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
                  className="w-14 h-14 bg-gradient-to-br from-[#5BC2F2]/20 to-[#5BC2F2]/5 rounded-2xl flex items-center justify-center mx-auto mb-3"
                >
                  <Weight size={28} className="text-[#5BC2F2]" />
                </motion.div>
                <h2 className="text-xl font-bold text-slate-900">
                  {isHebrew ? 'מה המשקל שלך?' : 'What is your weight?'}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {isHebrew 
                    ? 'נשתמש בזה כדי לחשב את צריכת הקלוריות ולהתאים תוכנית אישית' 
                    : "We'll use this to calculate your calorie burn and personalize your plan"}
                </p>
              </div>

              {/* Weight Picker — centered hero element */}
              <div className="flex-1 flex items-center justify-center py-4">
                <WheelPicker
                  value={weight}
                  onChange={handleWeightChange}
                  min={40}
                  max={150}
                  step={1}
                  unit="ק״ג"
                />
              </div>

              {/* Next Section Button */}
              <div className="pt-4 pb-6">
                <button
                  onClick={goToHistory}
                  className="w-full py-4 rounded-2xl font-bold text-lg bg-[#5BC2F2] text-white shadow-xl shadow-[#5BC2F2]/30 hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <span>{isHebrew ? 'המשך' : 'Continue'}</span>
                  <ChevronRight size={20} className={isHebrew ? 'rotate-180' : ''} />
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="history"
              initial={{ opacity: 0, x: isHebrew ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: isHebrew ? 20 : -20 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col pb-4"
            >
              {/* Premium Card Container */}
              <div className="premium-card p-5 space-y-5 mb-4">
                {/* Question 1: Training Routine */}
                <div className="space-y-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {isHebrew ? 'איך נראתה שגרת האימונים שלך בחודש האחרון?' : 'What did your workout routine look like last month?'}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5 font-normal">
                      {isHebrew ? 'נתאים את התוכנית לפי הרקע שלך' : "We'll tailor the program to your background"}
                    </p>
                  </div>
                  
                  {/* Frequency Options - Compact Cards with Descriptions */}
                  <div className="space-y-2">
                    {FREQUENCY_OPTIONS.map((option, index) => {
                      const Icon = option.Icon;
                      const isSelected = trainingFrequency === option.id;

                      return (
                        <motion.button
                          key={option.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleFrequencySelect(option)}
                          className={`w-full p-3.5 rounded-2xl border transition-all flex items-center gap-3 ${
                            isSelected
                              ? 'bg-[#5BC2F2]/8 border-[#5BC2F2]/50'
                              : 'bg-white border-slate-100 hover:border-slate-200'
                          }`}
                        >
                          {/* Icon */}
                          <div className={`p-2 rounded-xl ${isSelected ? 'bg-[#5BC2F2]/15' : option.bgClass}`}>
                            <Icon 
                              size={20} 
                              className={isSelected ? 'text-[#5BC2F2]' : option.iconColor}
                              strokeWidth={2}
                            />
                          </div>
                          
                          {/* Label & Description */}
                          <div className="flex-1 text-right">
                            <span className={`text-sm block ${
                              isSelected ? 'font-bold text-slate-900' : 'font-medium text-slate-600'
                            }`}>
                              {isHebrew ? option.labelHe : option.labelEn}
                            </span>
                            <span className="text-xs text-slate-400 block mt-0.5">
                              {getFrequencyDesc(option)}
                            </span>
                          </div>
                          
                          {/* Selection Indicator */}
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                            isSelected ? 'bg-[#5BC2F2]' : 'bg-slate-100'
                          }`}>
                            {isSelected && <Check size={12} className="text-white" strokeWidth={3} />}
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* Divider - Only show when Step 2 (Location) is visible */}
                {showLocationStep && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-px bg-slate-100"
                  />
                )}

                {/* Question 2: Location - Progressive Disclosure Step 2 */}
                <AnimatePresence>
                  {showLocationStep && (
                    <motion.div
                      ref={locationSectionRef}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.4, ease: 'easeInOut' }}
                      className="space-y-3 overflow-hidden"
                    >
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <span>{isHebrew ? 'איפה התאמנת בדרך כלל?' : 'Where did you usually train?'}</span>
                        <span className="text-xs font-medium text-slate-400">({selectedLocations.length})</span>
                      </h3>
                      
                      {/* Location Tags */}
                      <div className="flex flex-wrap gap-2">
                        {LOCATION_OPTIONS.map((location, index) => {
                          const Icon = location.Icon;
                          const isSelected = selectedLocations.includes(location.id);

                          return (
                            <motion.button
                              key={location.id}
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: 0.1 + index * 0.03 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleLocationToggle(location)}
                              className={`px-3 py-2 rounded-2xl border transition-all flex items-center gap-1.5 text-sm ${
                                isSelected
                                  ? 'bg-[#5BC2F2]/10 border-[#5BC2F2]/50 text-[#5BC2F2] font-semibold'
                                  : 'bg-white border-slate-100 text-slate-600 font-medium hover:border-slate-200'
                              }`}
                            >
                              <Icon size={14} strokeWidth={2} />
                              <span>{isHebrew ? location.labelHe : location.labelEn}</span>
                            </motion.button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Divider - Only show when Step 3 (Sports) is visible */}
                {showSportsStep && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-px bg-slate-100"
                  />
                )}

                {/* Question 3: Sports - Hierarchical Categories with Sub-options */}
                <AnimatePresence>
                  {showSportsStep && (
                    <motion.div
                      ref={sportsSectionRef}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.4, ease: 'easeInOut' }}
                      className="space-y-3 overflow-hidden"
                    >
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <span>{isHebrew ? 'ובאילו ענפי ספורט?' : 'Which sports?'}</span>
                        {selectedSports.length > 0 && (
                          <span className="text-xs font-bold text-[#5BC2F2] bg-[#5BC2F2]/10 px-2 py-0.5 rounded-full">
                            {selectedSports.length}
                          </span>
                        )}
                      </h3>
                      
                      {/* Category Chips */}
                      <div className="flex flex-wrap gap-2">
                        {SPORT_HIERARCHY.map((category, index) => {
                          const CategoryIcon = category.Icon;
                          const isExpanded = expandedCategoryId === category.id;
                          const selectedCount = getSelectedCountInCategory(category);

                          return (
                            <motion.button
                              key={category.id}
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: 0.15 + index * 0.04 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleCategoryToggle(category.id)}
                              className={`px-3 py-2.5 rounded-2xl border transition-all flex items-center gap-2 text-sm ${
                                isExpanded
                                  ? 'border-2 shadow-md'
                                  : selectedCount > 0
                                    ? 'bg-white border-slate-200 shadow-sm'
                                    : 'bg-white border-slate-100 hover:border-slate-200 hover:shadow-sm'
                              }`}
                              style={{
                                borderColor: isExpanded ? category.color : undefined,
                                backgroundColor: isExpanded ? `${category.color}10` : undefined,
                              }}
                            >
                              {/* Category Icon */}
                              <div 
                                className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                                style={{ 
                                  backgroundColor: isExpanded || selectedCount > 0 
                                    ? `${category.color}15` 
                                    : '#F1F5F9',
                                }}
                              >
                                <CategoryIcon 
                                  size={14} 
                                  strokeWidth={2.2}
                                  className="flex-shrink-0"
                                  style={{ 
                                    color: isExpanded || selectedCount > 0 
                                      ? category.color 
                                      : '#64748B' 
                                  }}
                                />
                              </div>
                              
                              {/* Label */}
                              <span className={`font-medium ${
                                isExpanded ? 'font-semibold' : selectedCount > 0 ? 'text-slate-800' : 'text-slate-600'
                              }`}
                                style={{ color: isExpanded ? category.color : undefined }}
                              >
                                {isHebrew ? category.labelHe : category.labelEn}
                              </span>
                              
                              {/* Selected count badge (when collapsed) */}
                              {selectedCount > 0 && !isExpanded && (
                                <span 
                                  className="text-[10px] font-bold w-5 h-5 rounded-full text-white flex items-center justify-center flex-shrink-0"
                                  style={{ backgroundColor: category.color }}
                                >
                                  {selectedCount}
                                </span>
                              )}
                              
                              {/* Expand/collapse chevron */}
                              <motion.div
                                animate={{ rotate: isExpanded ? 180 : 0 }}
                                transition={{ duration: 0.2 }}
                                className="flex-shrink-0"
                              >
                                <ChevronDown 
                                  size={14} 
                                  strokeWidth={2.5}
                                  style={{ color: isExpanded ? category.color : '#94A3B8' }}
                                />
                              </motion.div>
                            </motion.button>
                          );
                        })}
                      </div>

                      {/* Expanded Sub-Options */}
                      <AnimatePresence mode="wait">
                        {expandedCategoryId && (
                          <motion.div
                            key={expandedCategoryId}
                            initial={{ opacity: 0, height: 0, y: -8 }}
                            animate={{ opacity: 1, height: 'auto', y: 0 }}
                            exit={{ opacity: 0, height: 0, y: -8 }}
                            transition={{ duration: 0.3, ease: 'easeInOut' }}
                            className="overflow-hidden"
                          >
                            {(() => {
                              const category = SPORT_HIERARCHY.find(c => c.id === expandedCategoryId);
                              if (!category) return null;

                              return (
                                <div 
                                  className="flex flex-wrap gap-2 p-3.5 rounded-2xl border"
                                  style={{ 
                                    backgroundColor: `${category.color}06`,
                                    borderColor: `${category.color}25`,
                                  }}
                                >
                                  {category.subOptions.map((sub, subIndex) => {
                                    const isSelected = selectedSports.includes(sub.id);

                                    return (
                                      <motion.button
                                        key={sub.id}
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: subIndex * 0.05 }}
                                        whileTap={{ scale: 0.93 }}
                                        onClick={() => handleSubSportToggle(sub.id)}
                                        className={`px-3.5 py-2 rounded-xl border-2 transition-all flex items-center gap-1.5 text-sm ${
                                          isSelected
                                            ? 'text-white font-semibold shadow-sm'
                                            : 'bg-white font-medium text-slate-600 border-slate-150 hover:border-slate-300'
                                        }`}
                                        style={{
                                          backgroundColor: isSelected ? category.color : undefined,
                                          borderColor: isSelected ? category.color : '#E2E8F0',
                                        }}
                                      >
                                        {isSelected && <Check size={13} strokeWidth={3} />}
                                        <span>{isHebrew ? sub.labelHe : sub.labelEn}</span>
                                      </motion.button>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>

                      {/* Question 4: Outdoor Gym Experience - Conditional */}
                      <AnimatePresence>
                        {showOutdoorGymQuestion && (
                          <motion.div
                            ref={outdoorGymSectionRef}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3 }}
                            className="space-y-3 overflow-hidden"
                          >
                            <div className="h-px bg-slate-100" />
                            
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 bg-[#10B981]/10 rounded-lg flex items-center justify-center">
                                <TreePine size={14} className="text-[#10B981]" />
                              </div>
                              <h3 className="text-base font-bold text-slate-900">
                                {isHebrew 
                                  ? (isFemale ? 'האם התאמנת בעבר בגינות כושר?' : 'האם התאמנת בעבר בגינות כושר?')
                                  : 'Have you trained at outdoor gyms before?'
                                }
                              </h3>
                            </div>
                            
                            {/* Outdoor Gym Options */}
                            <div className="space-y-2">
                              {OUTDOOR_GYM_OPTIONS.map((option, index) => {
                                const isSelected = outdoorGymExperience === option.id;
                                return (
                                  <motion.button
                                    key={option.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => handleOutdoorGymSelect(option)}
                                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                                      isSelected
                                        ? 'bg-[#10B981]/10 border border-[#10B981]/50'
                                        : 'bg-slate-50 border border-transparent hover:bg-slate-100'
                                    }`}
                                  >
                                    <span className={`text-sm flex-1 text-right ${
                                      isSelected ? 'font-semibold text-[#10B981]' : 'font-medium text-slate-700'
                                    }`}>
                                      {getOutdoorGymLabel(option)}
                                    </span>
                                    {isSelected && (
                                      <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="w-5 h-5 rounded-full bg-[#10B981] flex items-center justify-center"
                                      >
                                        <Check size={12} className="text-white" strokeWidth={3} />
                                      </motion.div>
                                    )}
                                  </motion.button>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
              </div>

              {/* Continue Button */}
              <div ref={continueButtonRef} className="pt-2 pb-4">
                <button
                  onClick={handleContinue}
                  disabled={!canContinue}
                  className={`w-full py-4 rounded-2xl font-bold text-lg transition-all duration-300 ${
                    canContinue
                      ? 'bg-[#5BC2F2] text-white shadow-xl shadow-[#5BC2F2]/30 hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98]'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {isHebrew ? 'המשך' : 'Continue'}
                </button>
                {!canContinue && (
                  <p className="text-center text-xs text-slate-400 mt-2">
                    {isHebrew 
                      ? (!trainingFrequency 
                          ? 'בחר/י את שגרת האימונים שלך'
                          : selectedLocations.length === 0 
                            ? 'איפה התאמנת בדרך כלל?'
                            : selectedSports.length === 0
                              ? 'באילו ענפי ספורט עסקת?'
                              : showOutdoorGymQuestion && !outdoorGymExperience
                                ? 'האם יש לך ניסיון בגינות כושר?'
                                : 'יש להשלים את כל השאלות')
                      : (!trainingFrequency 
                          ? 'Select your training routine'
                          : selectedLocations.length === 0 
                            ? 'Where did you usually train?'
                            : selectedSports.length === 0
                              ? 'Which sports did you do?'
                              : showOutdoorGymQuestion && !outdoorGymExperience
                                ? 'Do you have outdoor gym experience?'
                                : 'Please complete all questions')
                    }
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
