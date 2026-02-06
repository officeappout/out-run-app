'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { getAllPersonas, getDefaultPersonas } from '@/features/content/personas';
import { Persona } from '@/features/content/personas';
import { getLocalizedText } from '@/features/content/shared/localized-text.types';
import { useAppStore } from '@/store/useAppStore';
import { useUserStore } from '@/features/user';
import { getOnboardingLocale, type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';
import OnboardingLayout from '@/features/user/onboarding/components/OnboardingLayout';
import { Check, Sparkles, AlertCircle, RefreshCw } from 'lucide-react';

export default function PersonaSelectionPage() {
  const router = useRouter();
  const { language: storeLanguage } = useAppStore();
  const { profile, updateProfile } = useUserStore();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Local language state
  const [selectedLanguage, setSelectedLanguage] = useState<OnboardingLanguage>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('onboarding_language') as OnboardingLanguage | null;
      if (saved && (saved === 'he' || saved === 'en' || saved === 'ru')) {
        return saved;
      }
    }
    return (storeLanguage === 'he' || storeLanguage === 'en') ? storeLanguage : 'he';
  });
  
  // Get translations for current language
  const locale = getOnboardingLocale(selectedLanguage);
  const direction = selectedLanguage === 'he' ? 'rtl' : 'ltr';

  useEffect(() => {
    loadPersonas();
  }, []);

  const loadPersonas = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('[PersonaSelection] Loading personas...');
      
      const data = await getAllPersonas();
      console.log('[PersonaSelection] Loaded personas:', data);
      
      if (data.length === 0) {
        // Fallback to default personas if API returns empty
        console.log('[PersonaSelection] No personas from API, using defaults');
        const defaults = getDefaultPersonas();
        setPersonas(defaults);
      } else {
        setPersonas(data);
      }
    } catch (err) {
      console.error('[PersonaSelection] Error loading personas:', err);
      setError('שגיאה בטעינת הפרסונות. מנסה לטעון ברירת מחדל...');
      
      // Use default personas on error
      const defaults = getDefaultPersonas();
      console.log('[PersonaSelection] Using default personas as fallback:', defaults);
      setPersonas(defaults);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPersona = (persona: Persona) => {
    setSelectedPersona(persona.id);
    console.log('[PersonaSelection] Selected persona:', persona.id, persona.name);
    
    // Save persona selection to sessionStorage
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('onboarding_selected_persona_id', persona.id);
      sessionStorage.setItem('onboarding_selected_persona_tags', JSON.stringify(persona.linkedLifestyleTags));
    }
    
    // If user is already logged in, update their profile immediately
    if (profile?.id) {
      console.log('[PersonaSelection] User logged in, updating profile with personaId:', persona.id);
      updateProfile({
        personaId: persona.id,
        lifestyle: {
          ...profile.lifestyle,
          lifestyleTags: persona.linkedLifestyleTags,
        },
      });
    }
  };

  const handleContinue = () => {
    if (!selectedPersona) {
      alert('אנא בחר פרסונה להמשיך');
      return;
    }
    
    // Navigate to setup wizard (refinement will be shown there if needed)
    router.push('/onboarding-new/setup');
  };

  if (loading) {
    return (
      <OnboardingLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">טוען פרסונות...</div>
        </div>
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout>
      <div className="flex flex-col items-center justify-center min-h-screen px-6 py-12" dir={direction}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-4xl w-full space-y-8"
        >
          {/* Header */}
          <div className="text-center space-y-4">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full mb-4"
            >
              <Sparkles size={40} className="text-white" />
            </motion.div>
            <h1 className="text-4xl font-black text-gray-900">
              בחר את הלמור שלך
            </h1>
            <p className="text-lg text-gray-600">
              כל למור מותאם לאורח חיים שונה. בחר את הלמור שמתאים לך ביותר
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-700"
            >
              <AlertCircle size={20} />
              <span>{error}</span>
            </motion.div>
          )}

          {/* Personas Grid */}
          {personas.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {personas.map((persona, index) => {
                const isSelected = selectedPersona === persona.id;
                const themeColor = persona.themeColor || '#3B82F6';
                
                return (
                  <motion.button
                    key={persona.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 * index, duration: 0.3 }}
                    onClick={() => handleSelectPersona(persona)}
                    className={`relative p-6 rounded-2xl border-2 transition-all text-right bg-white ${
                      isSelected
                        ? 'shadow-xl scale-105'
                        : 'border-gray-200 hover:border-gray-300 hover:shadow-lg'
                    }`}
                    style={{
                      borderColor: isSelected ? themeColor : undefined,
                      backgroundColor: isSelected ? `${themeColor}10` : 'white',
                    }}
                  >
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute top-4 left-4 w-8 h-8 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: themeColor }}
                      >
                        <Check size={20} className="text-white" />
                      </motion.div>
                    )}

                    {/* Persona Image */}
                    <div 
                      className="w-24 h-24 mx-auto mb-4 rounded-full overflow-hidden border-4 shadow-lg flex items-center justify-center"
                      style={{ 
                        borderColor: isSelected ? themeColor : 'white',
                        backgroundColor: `${themeColor}20`,
                      }}
                    >
                      {persona.imageUrl ? (
                        <img
                          src={persona.imageUrl}
                          alt={getLocalizedText(persona.name, selectedLanguage === 'ru' ? 'en' : selectedLanguage)}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // Show fallback emoji on image error
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            target.parentElement?.classList.add('fallback-emoji');
                          }}
                        />
                      ) : (
                        <span className="text-4xl">🦊</span>
                      )}
                    </div>

                    {/* Persona Info */}
                    <div className="space-y-2">
                      <h3 className="text-xl font-black text-gray-900">
                      {getLocalizedText(persona.name, selectedLanguage === 'ru' ? 'en' : selectedLanguage)}
                    </h3>
                    <p className="text-sm text-gray-600 line-clamp-3">
                      {getLocalizedText(persona.description, selectedLanguage === 'ru' ? 'en' : selectedLanguage)}
                      </p>

                      {/* Lifestyle Tags */}
                      {persona.linkedLifestyleTags && persona.linkedLifestyleTags.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          {persona.linkedLifestyleTags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-1 text-xs font-bold rounded-full"
                              style={{ 
                                backgroundColor: `${themeColor}15`,
                                color: themeColor,
                              }}
                            >
                              {tag === 'student' ? 'סטודנט' :
                               tag === 'parent' ? 'הורה' :
                               tag === 'office_worker' ? 'עובד משרד' :
                               tag === 'remote_worker' ? 'עובד מהבית' :
                               tag === 'wfh' ? 'עובד מהבית' :
                               tag === 'athlete' ? 'ספורטאי' :
                               tag === 'active' ? 'פעיל' :
                               tag === 'senior' ? 'גיל הזהב' :
                               tag === 'busy' ? 'עסוק' :
                               tag === 'young' ? 'צעיר' :
                               tag === 'health_focused' ? 'מתמקד בבריאות' : tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          ) : (
            /* Empty State */
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-16 text-center"
            >
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                <AlertCircle size={48} className="text-gray-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-700 mb-2">לא נמצאו פרסונות</h3>
              <p className="text-gray-500 mb-6">נסה לרענן את הדף או חזור מאוחר יותר</p>
              <button
                onClick={loadPersonas}
                className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors"
              >
                <RefreshCw size={18} />
                נסה שוב
              </button>
            </motion.div>
          )}

          {/* Continue Button */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: selectedPersona ? 1 : 0.5 }}
            transition={{ duration: 0.3 }}
            className="flex justify-center pt-8"
          >
            <button
              onClick={handleContinue}
              disabled={!selectedPersona}
              className={`px-8 py-4 rounded-2xl font-black text-lg transition-all ${
                selectedPersona
                  ? 'bg-cyan-500 text-white hover:bg-cyan-600 shadow-xl hover:scale-105'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              המשך
            </button>
          </motion.div>
        </motion.div>
      </div>
    </OnboardingLayout>
  );
}
