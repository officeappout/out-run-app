'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Dumbbell, Circle, Activity, Package, Anchor, Search, X,
  ArrowRight, Coins, Check
} from 'lucide-react';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { getAllGearDefinitions } from '@/features/content/equipment/gear';
import { GearDefinition } from '@/features/content/equipment/gear';
import { getOnboardingLocale, type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';
import * as LucideIcons from 'lucide-react';

interface EquipmentStepProps {
  onNext: () => void;
}

/**
 * Icon mapping function - maps equipment names/icons to Lucide React icons
 */
function getIconForEquipment(gear: GearDefinition): React.ComponentType<any> {
  // If gear has a custom icon URL, use a placeholder
  if (gear.customIconUrl) {
    return Circle; // Default icon for custom images
  }

  // If gear has an icon name, try to use it
  if (gear.icon) {
    const IconComponent = (LucideIcons as any)[gear.icon];
    if (IconComponent) {
      return IconComponent;
    }
  }

  // Fallback: Map by category or name
  const nameHe = gear.name?.he?.toLowerCase() || '';
  const nameEn = gear.name?.en?.toLowerCase() || '';
  const category = gear.category?.toLowerCase() || '';

  // Category-based mapping
  if (category === 'suspension') return Anchor;
  if (category === 'resistance') return Activity;
  if (category === 'weights') return Dumbbell;
  if (category === 'accessories') return Package;
  if (category === 'stationary') return Circle;

  // Name-based mapping (Hebrew)
  if (nameHe.includes('מתח') || nameHe.includes('מתח')) return ArrowRight;
  if (nameHe.includes('מקבילים') || nameHe.includes('דיפ')) return Circle;
  if (nameHe.includes('trx')) return Anchor;
  if (nameHe.includes('גומיות') || nameHe.includes('גומיה')) return Activity;
  if (nameHe.includes('טבעות') || nameHe.includes('רינג')) return Circle;
  if (nameHe.includes('משקולות') || nameHe.includes('דמבל')) return Dumbbell;
  if (nameHe.includes('קיטלבל')) return Circle;
  if (nameHe.includes('חבל') || nameHe.includes('קפיצה')) return Activity;
  if (nameHe.includes('מזרן') || nameHe.includes('מחצלת')) return Package;

  // Name-based mapping (English)
  if (nameEn.includes('pull') || nameEn.includes('chin')) return ArrowRight;
  if (nameEn.includes('dip') || nameEn.includes('parallel')) return Circle;
  if (nameEn.includes('trx')) return Anchor;
  if (nameEn.includes('band') || nameEn.includes('resistance')) return Activity;
  if (nameEn.includes('ring')) return Circle;
  if (nameEn.includes('dumbbell') || nameEn.includes('weight')) return Dumbbell;
  if (nameEn.includes('kettlebell')) return Circle;
  if (nameEn.includes('rope') || nameEn.includes('jump')) return Activity;
  if (nameEn.includes('mat') || nameEn.includes('yoga')) return Package;

  // Default fallback
  return Dumbbell;
}

/**
 * Get popular equipment items (first 6-8 items)
 */
function getPopularEquipment(equipment: GearDefinition[]): GearDefinition[] {
  // Return first 6 items as "popular"
  return equipment.slice(0, 6);
}

/**
 * Group equipment by category (family)
 */
function groupByCategory(equipment: GearDefinition[]): Record<string, GearDefinition[]> {
  return equipment.reduce((acc, gear) => {
    const category = gear.category || 'other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(gear);
    return acc;
  }, {} as Record<string, GearDefinition[]>);
}

/**
 * Category display names (Hebrew)
 */
const categoryNames: Record<string, string> = {
  suspension: 'תלייה',
  resistance: 'התנגדות',
  weights: 'משקולות',
  stationary: 'סטטי',
  accessories: 'אביזרים',
  cardio: 'קרדיו',
  other: 'אחר',
};

export default function EquipmentStep({ onNext }: EquipmentStepProps) {
  // Store destructuring - must come first
  const { updateData, data, addCoins } = useOnboardingStore();
  
  // All state declarations - must come after store, before const declarations
  const [allEquipment, setAllEquipment] = useState<GearDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMoreModal, setShowMoreModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'NONE' | 'HOME' | 'GYM' | null>(null);
  const [showCoinAnimation, setShowCoinAnimation] = useState(false);
  const [coinsEarned, setCoinsEarned] = useState(false);
  const [hasEarnedReward, setHasEarnedReward] = useState(false);
  
  // All const declarations - must come before useEffect hooks that use them
  // Get selected equipment IDs from store
  const selectedEquipmentIds = data.equipmentList || [];
  const hasEquipment = data.hasEquipment ?? false;
  const hasGym = data.hasGym ?? false;

  // Get gender from sessionStorage
  const gender = typeof window !== 'undefined'
    ? (sessionStorage.getItem('onboarding_personal_gender') || 'male') as 'male' | 'female'
    : 'male';
  
  // Gender-aware translation helper
  const t = (male: string, female: string) => gender === 'female' ? female : male;

  // Get current language
  const savedLanguage = typeof window !== 'undefined'
    ? (sessionStorage.getItem('onboarding_language') || 'he') as OnboardingLanguage
    : 'he';
  const locale = getOnboardingLocale(savedLanguage);

  // All useEffect hooks - must come after all const declarations they depend on
  // Check if coins should be earned (user has made a selection)
  useEffect(() => {
    if (selectedType !== null || selectedEquipmentIds.length > 0) {
      setCoinsEarned(true);
    }
  }, [selectedType, selectedEquipmentIds]);

  // Fetch equipment on mount
  useEffect(() => {
    async function fetchEquipment() {
      try {
        const equipment = await getAllGearDefinitions();
        setAllEquipment(equipment);
      } catch (error) {
        console.error('Error fetching equipment:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchEquipment();
  }, []);

  // Get popular equipment (first 6)
  const popularEquipment = useMemo(() => getPopularEquipment(allEquipment), [allEquipment]);

  // Get remaining equipment (for modal)
  const remainingEquipment = useMemo(() => {
    return allEquipment.slice(6);
  }, [allEquipment]);

  // Filter equipment by search query
  const filteredRemainingEquipment = useMemo(() => {
    if (!searchQuery.trim()) return remainingEquipment;

    const query = searchQuery.toLowerCase();
    return remainingEquipment.filter((gear) => {
      const nameHe = gear.name?.he?.toLowerCase() || '';
      const nameEn = gear.name?.en?.toLowerCase() || '';
      const descriptionHe = gear.description?.he?.toLowerCase() || '';
      const descriptionEn = gear.description?.en?.toLowerCase() || '';
      const category = gear.category?.toLowerCase() || '';

      return (
        nameHe.includes(query) ||
        nameEn.includes(query) ||
        descriptionHe.includes(query) ||
        descriptionEn.includes(query) ||
        category.includes(query) ||
        categoryNames[category]?.includes(query)
      );
    });
  }, [remainingEquipment, searchQuery]);

  // Group filtered equipment by category
  const groupedEquipment = useMemo(() => {
    return groupByCategory(filteredRemainingEquipment);
  }, [filteredRemainingEquipment]);

  // Toggle equipment selection
  const toggleEquipment = (gearId: string) => {
    const currentList = selectedEquipmentIds || [];
    const isAdding = !currentList.includes(gearId);
    const newList = isAdding
      ? [...currentList, gearId]
      : currentList.filter((id) => id !== gearId);

    updateData({
      equipmentList: newList,
      hasEquipment: newList.length > 0,
    });

    // Show coin animation and add coins immediately when adding equipment (only once)
    if (isAdding && !hasEarnedReward) {
      setShowCoinAnimation(true);
      addCoins(10); // Real-time coin update
      setHasEarnedReward(true);
      setTimeout(() => setShowCoinAnimation(false), 1000);
    }
  };

  // Handle no equipment toggle
  const handleNoEquipment = () => {
    const newSelectedType = selectedType === 'NONE' ? null : 'NONE';
    setSelectedType(newSelectedType);
    updateData({
      hasEquipment: false,
      equipmentList: [],
    });
    // Add coins immediately when selecting this option (only once)
    if (newSelectedType === 'NONE' && !hasEarnedReward) {
      setShowCoinAnimation(true);
      addCoins(10); // Real-time coin update
      setHasEarnedReward(true);
      setTimeout(() => setShowCoinAnimation(false), 1000);
    }
  };

  // Handle home equipment toggle (accordion)
  const handleHomeEquipmentToggle = () => {
    const newSelectedType = selectedType === 'HOME' ? null : 'HOME';
    setSelectedType(newSelectedType);
    if (newSelectedType === 'HOME') {
      // Expand accordion - no need to update store until equipment is selected
    } else {
      // Collapse accordion - clear selections if needed
      if (selectedEquipmentIds.length === 0) {
        updateData({
          hasEquipment: false,
          equipmentList: [],
        });
      }
    }
  };

  // Handle gym toggle
  const handleGymToggle = () => {
    const newSelectedType = selectedType === 'GYM' ? null : 'GYM';
    setSelectedType(newSelectedType);
    updateData({
      hasGym: newSelectedType === 'GYM',
    });
    // Add coins immediately when selecting this option (only once)
    if (newSelectedType === 'GYM' && !hasEarnedReward) {
      setShowCoinAnimation(true);
      addCoins(10); // Real-time coin update
      setHasEarnedReward(true);
      setTimeout(() => setShowCoinAnimation(false), 1000);
    }
  };

  // Handle continue
  const handleContinue = () => {
    // Don't add coins again if already earned
    if (!hasEarnedReward) {
      addCoins(10);
    }
    onNext();
  };

  // Get equipment name in current language
  const getEquipmentName = (gear: GearDefinition): string => {
    if (savedLanguage === 'he') {
      return gear.name?.he || gear.name?.en || '';
    }
    if (savedLanguage === 'en') {
      return gear.name?.en || gear.name?.he || '';
    }
    // Russian - fallback to English
    return gear.name?.en || gear.name?.he || '';
  };

  // Check if equipment is selected
  const isEquipmentSelected = (gearId: string): boolean => {
    return selectedEquipmentIds.includes(gearId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-slate-600">טוען ציוד...</div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="w-full max-w-md mx-auto px-6 py-6 pb-8 space-y-4 flex flex-col min-h-screen bg-white">
      {/* Title with Coins - Left aligned */}
      <div className="mb-6 relative">
        <div className="flex items-center justify-start gap-2">
          <div className="relative">
            <motion.div
              initial={false}
              animate={{
                opacity: hasEarnedReward ? 1 : 0.4,
                scale: showCoinAnimation ? [1, 1.2, 1] : 1,
              }}
              transition={{
                opacity: { duration: 0.3 },
                scale: { duration: 0.4, times: [0, 0.5, 1] }
              }}
              className={`flex items-center gap-1 rounded-full px-2 py-1 shadow-sm border transition-colors ${
                hasEarnedReward 
                  ? 'bg-amber-100 text-amber-700 border-amber-200' 
                  : 'bg-gray-100 text-gray-400 border-gray-200'
              }`}
            >
              <Coins 
                size={16} 
                className={hasEarnedReward ? 'text-amber-700' : 'text-gray-400'} 
                strokeWidth={2.5} 
              />
              <span className={`text-sm font-bold font-simpler ${hasEarnedReward ? 'text-amber-700' : 'text-gray-400'}`}>
                +10
              </span>
            </motion.div>
            {/* Float animation */}
            <AnimatePresence>
              {showCoinAnimation && (
                <motion.div
                  initial={{ opacity: 1, y: 0, scale: 1 }}
                  animate={{ opacity: 0, y: -30, scale: 1.2 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none z-20"
                >
                  <div className="flex items-center gap-1 bg-amber-200 text-amber-800 rounded-full px-2 py-1 shadow-lg border border-amber-300">
                    <Coins size={16} className="text-amber-800" strokeWidth={2.5} />
                    <span className="text-sm font-bold font-simpler">+10</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 font-simpler">
            {locale.equipment.title}
          </h1>
        </div>
      </div>

      {/* Card A: No Equipment */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={handleNoEquipment}
        className={`w-full bg-white p-5 rounded-2xl shadow-sm border transition-all min-h-[64px] flex items-center justify-center ${
          selectedType === 'NONE'
            ? 'border-[#60A5FA] bg-[#60A5FA]/5'
            : 'border-slate-100 hover:border-slate-200'
        }`}
      >
        <p className="text-lg font-medium text-center font-simpler text-slate-900">
          {t('אין לי ציוד — מתאמן בבית בלי אביזרים', 'אין לי ציוד — מתאמנת בבית בלי אביזרים')}
        </p>
      </motion.button>

      {/* Card B: Home Equipment (Accordion) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className={`bg-white rounded-2xl shadow-sm border transition-all ${
          selectedEquipmentIds.length > 0 || selectedType === 'HOME'
            ? 'border-[#60A5FA]/40'
            : 'border-slate-100'
        }`}
      >
        {/* Accordion Header - Always visible */}
        <motion.button
          onClick={handleHomeEquipmentToggle}
          className="w-full p-5 text-center min-h-[64px] flex items-center justify-center"
        >
          <h3 className="text-lg font-bold font-simpler text-slate-900">
            {t('יש לי ציוד אישי בבית — מתאמן בבית', 'יש לי ציוד אישי בבית — מתאמנת בבית')}
          </h3>
        </motion.button>

        {/* Accordion Content - Only visible when expanded */}
        <AnimatePresence>
          {selectedType === 'HOME' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden px-5 pb-5"
            >
              <p className="text-slate-600 text-sm mb-4 text-center font-simpler">
                {locale.equipment.selectEquipment}
              </p>

              {/* Dynamic Equipment Grid - From API/Store */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                {popularEquipment.map((gear) => {
                  const Icon = getIconForEquipment(gear);
                  const isSelected = isEquipmentSelected(gear.id);

                  return (
                    <motion.button
                      key={gear.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => toggleEquipment(gear.id)}
                      className={`flex items-center justify-between p-3 rounded-xl transition-all border h-14 shadow-lg ${
                        isSelected
                          ? 'bg-[#60A5FA]/5 border-2 border-[#60A5FA]'
                          : 'bg-white border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className={`text-sm font-simpler text-slate-900 ${
                          isSelected ? 'font-bold text-[#60A5FA]' : 'font-medium'
                        }`}
                      >
                        {getEquipmentName(gear)}
                      </span>
                      <Icon
                        size={20}
                        className={isSelected ? 'text-[#60A5FA]' : 'text-slate-500'}
                        strokeWidth={2}
                      />
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Card C: Gym */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        onClick={handleGymToggle}
        className={`w-full bg-white p-5 rounded-2xl shadow-sm border transition-all min-h-[64px] flex items-center justify-center ${
          selectedType === 'GYM'
            ? 'border-[#60A5FA] bg-[#60A5FA]/5'
            : 'border-slate-100 hover:border-slate-200'
        }`}
      >
        <p className="text-lg font-medium text-center font-simpler text-slate-900">
          {t('אני מתאמן גם בחדר כושר עם ציוד', 'אני מתאמנת גם בחדר כושר עם ציוד')}
        </p>
      </motion.button>

      {/* Spacer to push button to bottom */}
      <div className="flex-grow"></div>

      {/* Continue Button - Fixed at bottom */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-auto pb-10"
      >
        <button
          onClick={handleContinue}
          className="relative w-full bg-[#60A5FA] hover:bg-[#4a90d9] text-white font-bold py-4 rounded-2xl text-xl shadow-lg shadow-[#60A5FA]/20 transition-all active:scale-[0.98] overflow-hidden"
        >
          <span className="relative z-10 font-bold font-simpler">
            {locale.common.continue}
          </span>
        </button>
      </motion.div>

      {/* More Equipment Modal */}
      <AnimatePresence>
        {showMoreModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMoreModal(false)}
              className="fixed inset-0 bg-black/50 z-40"
            />

            {/* Bottom Sheet Modal */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-50 max-h-[80vh] flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-200">
                <h2 className="text-xl font-bold font-simpler text-slate-900">{locale.equipment.selectEquipment}</h2>
                <button
                  onClick={() => setShowMoreModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X size={24} className="text-slate-600" />
                </button>
              </div>

              {/* Search Bar */}
              <div className="p-4 border-b border-slate-200">
                <div className="relative">
                  <Search size={20} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={locale.equipment.searchPlaceholder}
                    className="w-full pr-10 pl-4 py-3 rounded-xl border border-slate-200 bg-white text-right font-simpler text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#60A5FA]"
                  />
                </div>
              </div>

              {/* Equipment List by Category */}
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {Object.entries(groupedEquipment).map(([category, equipment]) => (
                  <div key={category}>
                    {/* Category Header */}
                    <h3 className="text-sm font-bold text-slate-600 mb-3 font-simpler">
                      {categoryNames[category] || category}
                    </h3>

                    {/* Equipment Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      {equipment.map((gear) => {
                        const Icon = getIconForEquipment(gear);
                        const isSelected = isEquipmentSelected(gear.id);

                        return (
                          <motion.button
                            key={gear.id}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => toggleEquipment(gear.id)}
                            className={`flex items-center justify-between p-3 rounded-xl transition-all border h-14 ${
                              isSelected
                                ? 'bg-[#60A5FA]/5 border-2 border-[#60A5FA]'
                                : 'bg-white border border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <span
                              className={`text-sm font-simpler text-slate-900 ${
                                isSelected ? 'font-bold text-[#60A5FA]' : 'font-medium'
                              }`}
                            >
                              {getEquipmentName(gear)}
                            </span>
                            <Icon
                              size={20}
                              className={isSelected ? 'text-[#60A5FA]' : 'text-slate-500'}
                              strokeWidth={2}
                            />
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {Object.keys(groupedEquipment).length === 0 && (
                  <div className="text-center py-8 text-slate-600 font-simpler">
                    {locale.equipment.noResults}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
