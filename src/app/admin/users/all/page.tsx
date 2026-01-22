'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole, isOnlyAuthorityManager } from '@/features/admin/services/auth.service';
import { 
  getAllUsers, 
  getUserDetails, 
  getUserWorkoutHistory,
  deleteUser,
  AdminUserListItem 
} from '@/features/admin/services/users.service';
import { UserFullProfile } from '@/types/user-profile';
import { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import { 
  Search, Trash2, Eye, Shield, Mail, Phone, Calendar, Coins, 
  User, X, Activity, TrendingUp, MapPin, Package, RefreshCw, 
  Building2, Clock, CheckCircle2, AlertCircle, Dumbbell, Footprints, Move, Bike
} from 'lucide-react';
import dynamic from 'next/dynamic';

// Dynamic import for map to avoid SSR issues
const RunMapBlock = dynamic(
  () => import('@/features/workout-engine/summary/components/running/RunMapBlock'),
  { ssr: false }
);
import { logAction } from '@/features/admin/services/audit.service';
import { getAllGearDefinitions } from '@/features/content/equipment/gear';
import { GearDefinition } from '@/features/content/equipment/gear';
import { getUserEvents, AnalyticsEvent } from '@/features/analytics/AnalyticsService';
import { getAuthority } from '@/features/admin/services/authority.service';
import { getProgram, getAllPrograms } from '@/features/content/programs';
import { Program } from '@/features/content/programs';
import { usePagination } from '@/features/admin/hooks/usePagination';
import Pagination from '@/features/admin/components/shared/Pagination';
import { formatFirebaseTimestamp } from '@/lib/utils/date-formatter';
import { formatPace } from '@/features/workout-engine/core/utils/formatPace';

interface UserDetailModalProps {
  user: AdminUserListItem | null;
  onClose: () => void;
}

function UserDetailModal({ user, onClose }: UserDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'stats' | 'history'>('profile');
  const [fullProfile, setFullProfile] = useState<UserFullProfile | null>(null);
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutHistoryEntry[]>([]);
  const [analyticsEvents, setAnalyticsEvents] = useState<AnalyticsEvent[]>([]);
  const [gearDefinitions, setGearDefinitions] = useState<GearDefinition[]>([]);
  const [authority, setAuthority] = useState<{ name: string; type?: string; id?: string } | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      loadUserDetails();
    }
  }, [user]);

  const loadUserDetails = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Load full profile
      const profile = await getUserDetails(user.id);
      setFullProfile(profile);

      // Load workout history
      const history = await getUserWorkoutHistory(user.id, 50);
      setWorkoutHistory(history);

      // Load analytics events
      const events = await getUserEvents(user.id, undefined, 100);
      setAnalyticsEvents(events);

      // Load gear definitions for equipment display
      const gear = await getAllGearDefinitions();
      setGearDefinitions(gear);

      // Load all programs for program name lookup
      const allPrograms = await getAllPrograms();
      setPrograms(allPrograms);

      // Load authority information if user has authorityId
      if (profile?.core?.authorityId) {
        try {
          const auth = await getAuthority(profile.core.authorityId);
          if (auth) {
            setAuthority({ name: auth.name, type: auth.type, id: auth.id });
          }
        } catch (error) {
          console.error('Error loading authority:', error);
        }
      }
    } catch (error) {
      console.error('Error loading user details:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  const getEquipmentNames = (equipmentIds: string[]): string[] => {
    return equipmentIds
      .map((id) => {
        const gear = gearDefinitions.find((g) => g.id === id);
        return gear?.name?.he || gear?.name?.en || id;
      })
      .filter(Boolean);
  };

  // Helper to get historyFrequency label
  const getHistoryFrequencyLabel = (frequency?: string): string => {
    if (!frequency) return 'טרם סופק';
    const labels: Record<string, string> = {
      'none': 'לא התאמן בכלל',
      '1-2': 'אימונים 1-2 פעמים בשבוע',
      '3+': 'אימונים אינטנסיביים (3+ פעמים בשבוע)',
    };
    return labels[frequency] || frequency;
  };

  // Helper to get workout preference labels
  const getWorkoutPreferenceLabels = (historyTypes?: string[]): string[] => {
    if (!historyTypes || historyTypes.length === 0) return ['טרם סופק'];
    const labels: Record<string, string> = {
      'gym': 'חדר כושר',
      'street': 'פארקים ציבוריים',
      'studio': 'סטודיו / שיעורים',
      'home': 'אימון ביתי',
      'cardio': 'ריצה / אירובי בחוץ',
    };
    return historyTypes.map(type => labels[type] || type);
  };

  // Helper to get active program details
  const getActiveProgramInfo = () => {
    const activeProgram = fullProfile?.progression?.activePrograms?.[0];
    if (!activeProgram) return null;

    // Try to find program in programs list by templateId or id
    const program = programs.find(p => 
      p.id === activeProgram.templateId || p.id === activeProgram.id
    );

    const programName = program?.name || activeProgram.name || 'תוכנית פעילה';

    // Get level - check progression.tracks first (for Master Programs), then domains
    let level = 1;
    let maxLevel = 10;

    if (fullProfile?.progression?.tracks?.[activeProgram.templateId || activeProgram.id]) {
      const track = fullProfile.progression.tracks[activeProgram.templateId || activeProgram.id];
      level = track.currentLevel || 1;
      maxLevel = track.maxLevel || 10;
    } else {
      // Fallback to domain levels
      const primaryDomain = fullProfile?.progression?.domains?.upper_body || 
                           fullProfile?.progression?.domains?.lower_body ||
                           fullProfile?.progression?.domains?.full_body ||
                           fullProfile?.progression?.domains?.core;
      if (primaryDomain) {
        level = primaryDomain.currentLevel || 1;
        maxLevel = primaryDomain.maxLevel || 10;
      } else {
        level = fullProfile?.core?.initialFitnessTier || 1;
      }
    }

    return { programName, level, maxLevel };
  };

  // Helper to get city/neighborhood from user data
  // Note: city might be stored in onboarding data or need to be inferred from authority
  const getUserLocation = () => {
    // Check if city is stored in user data (might be in a field like onboarding.city)
    // For now, use authority name as city if available
    const city = authority?.name || (fullProfile as any)?.city || (fullProfile as any)?.onboarding?.city;
    const neighborhood = (fullProfile as any)?.neighborhood;
    
    return { city, neighborhood };
  };

  // Helper to get historyFrequency from user data
  const getHistoryFrequency = (): string | undefined => {
    return (fullProfile as any)?.historyFrequency || 
           (fullProfile as any)?.onboarding?.historyFrequency ||
           (fullProfile as any)?.onboarding?.pastActivityLevel;
  };

  // Helper to get historyTypes from user data
  const getHistoryTypes = (): string[] | undefined => {
    return (fullProfile as any)?.historyTypes || 
           (fullProfile as any)?.onboarding?.historyTypes;
  };

  // Helper function to get event label in Hebrew
  const getEventLabel = (eventName: string): string => {
    const labels: Record<string, string> = {
      app_open: 'פתיחת אפליקציה',
      app_close: 'סגירת אפליקציה',
      login: 'התחברות',
      logout: 'התנתקות',
      onboarding_step_complete: 'שלב Onboarding הושלם',
      workout_start: 'התחלת אימון',
      workout_complete: 'אימון הושלם',
      workout_abandoned: 'אימון ננטש',
      profile_created: 'פרופיל נוצר',
      profile_updated: 'פרופיל עודכן',
      error_occurred: 'שגיאה',
    };
    return labels[eventName] || eventName;
  };

  // Helper function to get event details
  const getEventDetails = (event: AnalyticsEvent): string => {
    const details: string[] = [];
    
    if (event.eventName === 'onboarding_step_complete' && 'step_name' in event) {
      details.push(`שלב: ${event.step_name}`);
      if (event.time_spent) {
        details.push(`זמן: ${Math.floor(event.time_spent)} שניות`);
      }
    }
    
    if (event.eventName === 'workout_start' && 'level' in event) {
      if (event.level) details.push(`רמה: ${event.level}`);
      if (event.location) details.push(`מיקום: ${event.location}`);
    }
    
    if (event.eventName === 'workout_complete' && 'duration' in event) {
      if (event.duration) details.push(`משך: ${Math.floor(event.duration / 60)} דקות`);
      if (event.calories) details.push(`קלוריות: ${event.calories}`);
      if (event.earned_coins) details.push(`מטבעות: +${event.earned_coins}`);
    }
    
    if (event.eventName === 'error_occurred' && 'error_code' in event) {
      details.push(`קוד שגיאה: ${event.error_code}`);
      if (event.screen) details.push(`מסך: ${event.screen}`);
    }
    
    return details.join(' • ') || 'אין פרטים נוספים';
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        />

        {/* Slide-over Panel */}
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="absolute right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-2xl overflow-y-auto"
          dir="rtl"
        >
          {/* Header */}
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.name}
                    className="w-16 h-16 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-[#5BC2F2] text-white flex items-center justify-center font-black text-2xl">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <h2 className="text-2xl font-black text-gray-900">{user.name}</h2>
                  <p className="text-gray-500">{user.email || 'ללא אימייל'}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={24} className="text-gray-600" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-200">
              {(['profile', 'stats', 'history'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 font-bold transition-colors relative ${
                    activeTab === tab
                      ? 'text-[#5BC2F2]'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab === 'profile' && 'פרופיל'}
                  {tab === 'stats' && 'סטטיסטיקה'}
                  {tab === 'history' && 'היסטוריה'}
                  {activeTab === tab && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#5BC2F2]"
                    />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-gray-500">טוען...</div>
              </div>
            ) : (
              <>
                {/* Profile Tab - Comprehensive User Identity & Strategy Dashboard */}
                {activeTab === 'profile' && fullProfile && (
                  <div className="space-y-6">
                    {/* 1. User Identity & Location */}
                      <div>
                        <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
                          <MapPin size={20} className="text-blue-500" />
                        זהות ומקום מגורים
                        </h3>
                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 space-y-4">
                        {(() => {
                          const location = getUserLocation();
                          return (
                            <>
                              {location.city && (
                                <div>
                                  <div className="text-sm text-gray-600 mb-1">עיר</div>
                                  <div className="font-bold text-gray-900 text-lg">{location.city}</div>
                                </div>
                              )}
                              {location.neighborhood && (
                                <div>
                                  <div className="text-sm text-gray-600 mb-1">שכונה</div>
                                  <div className="font-bold text-gray-900 text-lg">{location.neighborhood}</div>
                                </div>
                              )}
                              {!location.city && !location.neighborhood && (
                                <div className="text-sm text-gray-500 italic">טרם סופק</div>
                              )}
                            </>
                          );
                        })()}
                        {authority && (
                          <div className="pt-3 border-t border-blue-200">
                          <div className="flex items-center gap-2 mb-2">
                            <Building2 size={18} className="text-blue-600" />
                            <div className="text-sm text-gray-600">רשות משויכת</div>
                          </div>
                            <div className="font-bold text-gray-900 text-base">
                            {authority.name}
                            {authority.type === 'city' && ' (עירייה)'}
                            {authority.type === 'regional_council' && ' (מועצה אזורית)'}
                            {authority.type === 'local_council' && ' (מועצה מקומית)'}
                          </div>
                            {authority.id && (
                              <div className="text-xs text-gray-500 mt-1">ID: {authority.id}</div>
                            )}
                      </div>
                    )}
                      </div>
                    </div>

                    {/* 2. Workout Profile - The "Gold" Data */}
                      <div>
                        <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
                        <Activity size={20} className="text-amber-500" />
                        פרופיל אימונים (נתוני השפעה)
                        </h3>
                      <div className="space-y-4">
                        {/* Initial State - Critical for Impact Reports */}
                        <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-5">
                          <div className="text-sm font-bold text-amber-900 mb-2">📍 מצב התחלתי</div>
                          <div className="text-base font-bold text-gray-900">
                            {getHistoryFrequencyLabel(getHistoryFrequency())}
                          </div>
                          <div className="text-xs text-amber-700 mt-2">
                            תשובה לשאלה: "איך נראת שגרת האימונים שלך בחודש שעבר?"
                          </div>
                        </div>

                        {/* Workout Preferences */}
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                          <div className="text-sm text-gray-600 mb-2">העדפות אימון</div>
                          <div className="flex flex-wrap gap-2">
                            {getWorkoutPreferenceLabels(getHistoryTypes()).map((pref, idx) => (
                              <span
                                key={idx}
                                className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-full text-sm font-medium"
                              >
                                {pref}
                              </span>
                            ))}
                            </div>
                          </div>

                        {/* Active Program */}
                        {(() => {
                          const programInfo = getActiveProgramInfo();
                          if (!programInfo) {
                            return (
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                                <div className="text-sm text-gray-600 mb-1">תוכנית פעילה</div>
                                <div className="text-sm text-gray-500 italic">טרם סופק</div>
                              </div>
                            );
                          }
                          return (
                            <div className="bg-gradient-to-br from-cyan-50 to-blue-50 border-2 border-cyan-200 rounded-xl p-5">
                              <div className="text-sm text-gray-600 mb-2">תוכנית פעילה</div>
                              <div className="font-black text-xl text-cyan-700 mb-3">{programInfo.programName}</div>
                              <div className="flex items-baseline gap-2">
                                <span className="font-black text-3xl text-cyan-600">רמה {programInfo.level}</span>
                                <span className="text-sm text-gray-500 font-bold">/ {programInfo.maxLevel}</span>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Schedule Days */}
                        {fullProfile.lifestyle?.scheduleDays && fullProfile.lifestyle.scheduleDays.length > 0 ? (
                          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                            <div className="text-sm text-gray-600 mb-3">ימי אימון</div>
                              <div className="flex flex-wrap gap-2">
                                {fullProfile.lifestyle.scheduleDays.map((day, idx) => (
                                  <span
                                    key={idx}
                                    className="w-10 h-10 rounded-2xl bg-[#00E5FF] text-white shadow-lg shadow-[#00E5FF]/30 flex items-center justify-center font-bold text-lg"
                                  >
                                    {day}
                                  </span>
                                ))}
                              </div>
                              {fullProfile.lifestyle.trainingTime && (
                              <div className="mt-3 flex items-center gap-1 text-xs text-gray-600">
                                  <Clock size={12} />
                                  שעה מועדפת: {fullProfile.lifestyle.trainingTime}
                                </div>
                              )}
                            </div>
                        ) : (
                          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                            <div className="text-sm text-gray-600 mb-1">ימי אימון</div>
                            <div className="text-sm text-gray-500 italic">טרם סופק</div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 3. Biometrics & Progress */}
                    <div>
                      <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
                        <TrendingUp size={20} className="text-purple-500" />
                        ביומטריה והתקדמות
                      </h3>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        {((fullProfile.core as any).height) ? (
                          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                            <div className="text-sm text-gray-600 mb-1">גובה</div>
                            <div className="font-bold text-gray-900">{(fullProfile.core as any).height} ס"מ</div>
                          </div>
                        ) : (
                          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                            <div className="text-sm text-gray-600 mb-1">גובה</div>
                            <div className="text-sm text-gray-500 italic">טרם סופק</div>
                          </div>
                        )}
                        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                          <div className="text-sm text-gray-600 mb-1">משקל</div>
                          <div className="font-bold text-gray-900">{fullProfile.core.weight || 'טרם סופק'} ק"ג</div>
                        </div>
                        {fullProfile.core.birthDate ? (
                          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                            <div className="text-sm text-gray-600 mb-1">תאריך לידה</div>
                            <div className="font-bold text-gray-900">
                              {new Date(fullProfile.core.birthDate).toLocaleDateString('he-IL')}
                            </div>
                          </div>
                        ) : (
                          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                            <div className="text-sm text-gray-600 mb-1">תאריך לידה</div>
                            <div className="text-sm text-gray-500 italic">טרם סופק</div>
                          </div>
                        )}
                      </div>
                      
                      {/* Progress Bar to Next Level */}
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                            <div className="text-sm text-gray-600 mb-2">התקדמות לרמה הבאה</div>
                            <div className="flex items-center gap-3">
                              <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all duration-1000"
                                  style={{
                                    width: `${(() => {
                                      if (!fullProfile.progression.globalXP || fullProfile.progression.globalXP === 0) return 0;
                                      const currentLevel = (() => {
                                        const primaryDomain = fullProfile.progression.domains?.upper_body || 
                                                         fullProfile.progression.domains?.lower_body ||
                                                         fullProfile.progression.domains?.full_body ||
                                                         fullProfile.progression.domains?.core;
                                        return primaryDomain?.currentLevel || 1;
                                      })();
                                      const nextLevelXP = currentLevel * 1000;
                                      const currentXP = fullProfile.progression.globalXP || 0;
                                      const progressXP = currentXP % 1000;
                                      return Math.min(Math.round((progressXP / nextLevelXP) * 100), 99);
                                    })()}%`
                                  }}
                                />
                              </div>
                              <span className="text-sm font-bold text-gray-700 min-w-[3rem] text-left">
                                {(() => {
                                  if (!fullProfile.progression.globalXP || fullProfile.progression.globalXP === 0) return '0%';
                                  const currentLevel = (() => {
                                    const primaryDomain = fullProfile.progression.domains?.upper_body || 
                                                     fullProfile.progression.domains?.lower_body ||
                                                     fullProfile.progression.domains?.full_body ||
                                                     fullProfile.progression.domains?.core;
                                    return primaryDomain?.currentLevel || 1;
                                  })();
                                  const nextLevelXP = currentLevel * 1000;
                                  const currentXP = fullProfile.progression.globalXP || 0;
                                  const progressXP = currentXP % 1000;
                                  return `${Math.min(Math.round((progressXP / nextLevelXP) * 100), 99)}%`;
                                })()}
                              </span>
                            </div>
                          </div>
                        </div>

                    {/* 4. Equipment Inventory */}
                    <div>
                      <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
                        <Package size={20} className="text-purple-500" />
                        ציוד מפורט
                      </h3>
                      <div className="space-y-3">
                        {fullProfile.equipment.home.length > 0 && (
                          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                            <div className="text-sm font-bold text-purple-700 mb-2">ציוד בית</div>
                            <div className="flex flex-wrap gap-2">
                              {getEquipmentNames(fullProfile.equipment.home).map((name, idx) => (
                                <span
                                  key={idx}
                                  className="px-3 py-1.5 bg-white border border-purple-300 text-purple-700 rounded-full text-sm font-medium shadow-sm"
                                >
                                  {name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {fullProfile.equipment.office.length > 0 && (
                          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                            <div className="text-sm font-bold text-blue-700 mb-2">ציוד משרד</div>
                            <div className="flex flex-wrap gap-2">
                              {getEquipmentNames(fullProfile.equipment.office).map((name, idx) => (
                                <span
                                  key={idx}
                                  className="px-3 py-1.5 bg-white border border-blue-300 text-blue-700 rounded-full text-sm font-medium shadow-sm"
                                >
                                  {name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {fullProfile.equipment.outdoor && fullProfile.equipment.outdoor.length > 0 && (
                          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                            <div className="text-sm font-bold text-green-700 mb-2">ציוד חוץ</div>
                            <div className="flex flex-wrap gap-2">
                              {getEquipmentNames(fullProfile.equipment.outdoor).map((name, idx) => (
                                <span
                                  key={idx}
                                  className="px-3 py-1.5 bg-white border border-green-300 text-green-700 rounded-full text-sm font-medium shadow-sm"
                                >
                                  {name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {fullProfile.core.hasGymAccess && (
                          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 size={18} className="text-amber-600" />
                              <span className="text-sm font-bold text-amber-700">גישה לחדר כושר</span>
                            </div>
                          </div>
                        )}
                        {fullProfile.equipment.home.length === 0 && 
                         fullProfile.equipment.office.length === 0 &&
                         (!fullProfile.equipment.outdoor || fullProfile.equipment.outdoor.length === 0) &&
                         !fullProfile.core.hasGymAccess && (
                          <div className="text-gray-500 text-sm bg-gray-50 rounded-xl p-4 text-center">
                            אין ציוד רשום
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 5. Legal & Compliance */}
                    <div>
                      <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
                        <Shield size={20} className="text-green-500" />
                        הצהרות וחתימות
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Health Declaration Status */}
                        <div className={`rounded-xl p-5 border-2 ${
                          fullProfile.health?.injuries !== undefined
                            ? fullProfile.health.injuries.length === 0
                              ? 'bg-green-50 border-green-300'
                              : 'bg-yellow-50 border-yellow-300'
                            : 'bg-gray-50 border-gray-300'
                        }`}>
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-base font-black text-gray-900">הצהרת בריאות</span>
                            {fullProfile.health?.injuries !== undefined ? (
                              fullProfile.health.injuries.length === 0 ? (
                                <div className="flex items-center gap-2 text-green-700">
                                  <CheckCircle2 size={24} className="text-green-600" />
                                  <span className="font-bold">חתום</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 text-yellow-700">
                                  <AlertCircle size={24} className="text-yellow-600" />
                                  <span className="font-bold">חתום</span>
                                </div>
                              )
                            ) : (
                              <div className="flex items-center gap-2 text-gray-500">
                                <X size={24} className="text-gray-400" />
                                <span className="font-bold">לא חתום</span>
                              </div>
                            )}
                          </div>
                          <div className="text-sm text-gray-700 mt-2">
                            {fullProfile.health?.injuries !== undefined
                              ? fullProfile.health.injuries.length === 0
                              ? '✓ הושלם - ללא בעיות רפואיות'
                                : `⚠ יש ${fullProfile.health.injuries.length} פציעות/בעיות רשומות`
                              : 'לא הושלם'}
                          </div>
                          {fullProfile.health?.injuries && fullProfile.health.injuries.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1">
                              {fullProfile.health.injuries.map((injury, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-medium"
                                >
                                  {injury}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Terms of Use Status */}
                        {(() => {
                          const hasSignedTerms = analyticsEvents.some(e => 
                            e.eventName === 'onboarding_step_complete' && 
                            'step_name' in e && 
                            e.step_name === 'terms_of_use'
                          );
                          const termsEvent = analyticsEvents.find(e => 
                              e.eventName === 'onboarding_step_complete' && 
                              'step_name' in e && 
                              e.step_name === 'terms_of_use'
                          );
                          return (
                            <div className={`rounded-xl p-5 border-2 ${
                              hasSignedTerms
                                ? 'bg-green-50 border-green-300'
                                : 'bg-gray-50 border-gray-300'
                            }`}>
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-base font-black text-gray-900">תנאי שימוש</span>
                                {hasSignedTerms ? (
                                  <div className="flex items-center gap-2 text-green-700">
                                    <CheckCircle2 size={24} className="text-green-600" />
                                    <span className="font-bold">חתום</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 text-gray-500">
                                    <X size={24} className="text-gray-400" />
                                    <span className="font-bold">לא חתום</span>
                                  </div>
                            )}
                          </div>
                              <div className="text-sm text-gray-700 mt-2">
                                {hasSignedTerms
                              ? '✓ הושלם - חתום ואושר'
                              : 'לא הושלם'}
                          </div>
                              {hasSignedTerms && termsEvent && (
                                <div className="text-xs text-gray-600 mt-3">
                                  תאריך: {new Date(termsEvent.timestamp).toLocaleDateString('he-IL')}
                            </div>
                          )}
                        </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {/* Stats Tab */}
                {activeTab === 'stats' && fullProfile && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-black text-gray-900 mb-4">רמות נוכחיות</h3>
                      <div className="grid grid-cols-2 gap-4">
                        {fullProfile.progression.domains && 
                         Object.entries(fullProfile.progression.domains).map(([domain, progress]) => (
                          <div key={domain} className="bg-gray-50 rounded-xl p-4">
                            <div className="text-sm text-gray-500 mb-1">{domain}</div>
                            <div className="font-black text-2xl text-[#5BC2F2]">
                              רמה {progress.currentLevel}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              מתוך {progress.maxLevel}
                            </div>
                          </div>
                        ))}
                        {(!fullProfile.progression.domains || 
                          Object.keys(fullProfile.progression.domains).length === 0) && (
                          <div className="col-span-2 text-gray-500 text-sm">אין רמות רשומות</div>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-black text-gray-900 mb-4">כלכלה</h3>
                      <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-2">
                          <Coins size={24} className="text-yellow-600" />
                          <div className="text-sm text-gray-600">מטבעות</div>
                        </div>
                        <div className="font-black text-4xl text-yellow-700">
                          {fullProfile.progression.coins || 0}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* History Tab */}
                {activeTab === 'history' && (
                  <div className="space-y-6">
                    {/* Analytics Events Section */}
                    <div>
                      <h3 className="text-lg font-black text-gray-900 mb-4">היסטוריית פעילות (Analytics)</h3>
                      {analyticsEvents.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-sm font-simpler">
                          אין אירועי analytics רשומים
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                          {analyticsEvents.map((event) => (
                            <div
                              key={event.id}
                              className="bg-gray-50 rounded-xl p-3 hover:bg-gray-100 transition-colors"
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="font-bold text-gray-900 text-sm font-simpler">
                                  {getEventLabel(event.eventName)}
                                </div>
                                <div className="text-xs text-gray-500 font-simpler">
                                  {new Date(event.timestamp).toLocaleString('he-IL')}
                                </div>
                              </div>
                              <div className="text-xs text-gray-600 font-simpler">
                                {getEventDetails(event)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Workout History Section */}
                    <div>
                      <h3 className="text-lg font-black text-gray-900 mb-4">אימונים שבוצעו</h3>
                      {workoutHistory.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-sm font-simpler">
                          אין אימונים רשומים
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {workoutHistory.map((workout) => {
                            // Get workout type icon
                            const getWorkoutIcon = () => {
                              const iconProps = { size: 20, className: 'text-gray-600' };
                              switch (workout.workoutType) {
                                case 'running':
                                  return <Footprints {...iconProps} />;
                                case 'walking':
                                  return <Move {...iconProps} />;
                                case 'cycling':
                                  return <Bike {...iconProps} />;
                                case 'strength':
                                  return <Dumbbell {...iconProps} />;
                                case 'hybrid':
                                  return <Activity {...iconProps} />;
                                default:
                                  return <Activity {...iconProps} />;
                              }
                            };

                            // Get workout type label
                            const getWorkoutTypeLabel = () => {
                              switch (workout.workoutType) {
                                case 'running':
                                  return 'ריצה חופשית';
                                case 'walking':
                                  return 'הליכה';
                                case 'cycling':
                                  return 'רכיבה';
                                case 'strength':
                                  return 'אימון כוח';
                                case 'hybrid':
                                  return 'אימון משולב';
                                default:
                                  return workout.activityType || 'פעילות';
                              }
                            };

                            // Format duration as MM:SS
                            const formatDuration = (seconds: number): string => {
                              if (!seconds || seconds < 0) return '00:00';
                              const mins = Math.floor(seconds / 60);
                              const secs = Math.floor(seconds % 60);
                              return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                            };

                            // Format completion time (HH:MM)
                            const formatCompletionTime = (date: Date): string => {
                              const hours = date.getHours().toString().padStart(2, '0');
                              const minutes = date.getMinutes().toString().padStart(2, '0');
                              return `${hours}:${minutes}`;
                            };

                            // Convert routePath to number[][] for RunMapBlock
                            const routeCoords: number[][] = (() => {
                              if (!workout.routePath || !Array.isArray(workout.routePath) || workout.routePath.length === 0) {
                                return [];
                              }
                              
                              try {
                                return workout.routePath
                                  .map((coord: any) => {
                                    // New format: {lat, lng}
                                    if (coord && typeof coord === 'object' && 'lat' in coord && 'lng' in coord) {
                                      return [Number(coord.lng), Number(coord.lat)]; // Mapbox expects [lng, lat]
                                    }
                                    // Old format: [lat, lng] or [lng, lat]
                                    if (Array.isArray(coord) && coord.length >= 2) {
                                      return [Number(coord[0]), Number(coord[1])];
                                    }
                                    return null;
                                  })
                                  .filter((coord: number[] | null): coord is number[] => 
                                    coord !== null && !isNaN(coord[0]) && !isNaN(coord[1])
                                  );
                              } catch (error) {
                                console.error('[Admin] Error parsing routePath:', error);
                                return [];
                              }
                            })();

                            const workoutDate = workout.date instanceof Date ? workout.date : new Date(workout.date);
                            const completionTime = formatCompletionTime(workoutDate);

                            return (
                              <div
                                key={workout.id}
                                className="bg-gray-50 rounded-xl p-4 hover:bg-gray-100 transition-colors"
                              >
                                <div className="flex items-start gap-4">
                                  {/* Left: Mini Map (for running workouts) */}
                                  {(workout.workoutType === 'running' || workout.workoutType === 'walking' || workout.workoutType === 'cycling') && routeCoords.length > 1 && (
                                    <div className="w-32 h-32 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                                      <RunMapBlock
                                        routeCoords={routeCoords}
                                        startCoord={routeCoords[0]}
                                        endCoord={routeCoords[routeCoords.length - 1]}
                                      />
                                    </div>
                                  )}

                                  {/* Right: Workout Details */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        {getWorkoutIcon()}
                                        <div className="font-bold text-gray-900 font-simpler">
                                          {getWorkoutTypeLabel()}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1 text-sm text-gray-500 font-simpler">
                                        <Clock size={12} />
                                        <span>{new Date(workout.date).toLocaleDateString('he-IL')} • {completionTime}</span>
                                      </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-4 text-sm text-gray-600 font-simpler flex-wrap">
                                      {/* Show stats based on workout type */}
                                      {workout.workoutType === 'running' || workout.workoutType === 'walking' || workout.workoutType === 'cycling' ? (
                                        <>
                                          {workout.distance > 0 && (
                                            <span className="flex items-center gap-1">
                                              <MapPin size={14} />
                                              <span className="font-bold">{workout.distance.toFixed(2)} ק"מ</span>
                                            </span>
                                          )}
                                          {workout.duration > 0 && (
                                            <span className="flex items-center gap-1">
                                              <Clock size={14} />
                                              <span className="font-bold">{formatDuration(workout.duration)}</span>
                                            </span>
                                          )}
                                          {workout.pace > 0 && (
                                            <span className="flex items-center gap-1">
                                              ⚡ {formatPace(workout.pace)} /ק"מ
                                            </span>
                                          )}
                                        </>
                                      ) : workout.workoutType === 'strength' ? (
                                        <>
                                          {workout.duration > 0 && (
                                            <span className="flex items-center gap-1">
                                              <Clock size={14} />
                                              <span className="font-bold">{formatDuration(workout.duration)}</span>
                                            </span>
                                          )}
                                        </>
                                      ) : (
                                        <>
                                          {workout.duration > 0 && (
                                            <span className="flex items-center gap-1">
                                              <Clock size={14} />
                                              <span className="font-bold">{formatDuration(workout.duration)}</span>
                                            </span>
                                          )}
                                        </>
                                      )}
                                      {workout.calories > 0 && (
                                        <span className="flex items-center gap-1">
                                          <Activity size={14} className="text-orange-500" />
                                          {workout.calories} קלוריות
                                        </span>
                                      )}
                                      {workout.earnedCoins > 0 && (
                                        <span className="flex items-center gap-1">
                                          <Coins size={14} className="text-yellow-600" />
                                          <span className="font-bold">+{workout.earnedCoins} מטבעות</span>
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </div>
  );
}

export default function AllUsersPage() {
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<AdminUserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserListItem | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [userAuthorityIds, setUserAuthorityIds] = useState<string[]>([]);
  const [isAuthorityManagerOnly, setIsAuthorityManagerOnly] = useState(false);
  
  // Filter states
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'ONBOARDING'>('ALL');
  const [stepFilter, setStepFilter] = useState<'ALL' | 'LOCATION' | 'EQUIPMENT' | 'HISTORY' | 'SCHEDULE'>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'REGISTERED' | 'GUEST'>('ALL');
  const [activityFilter, setActivityFilter] = useState<'ALL' | 'NEW' | 'BEGINNER' | 'PRO'>('ALL');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const roleInfo = await checkUserRole(user.uid);
          const isOnly = await isOnlyAuthorityManager(user.uid);
          setIsAuthorityManagerOnly(isOnly);
          setUserAuthorityIds(roleInfo.authorityIds || []);
          
          // Allow Super Admins, System Admins, and Authority Managers
          if (roleInfo.isSuperAdmin || roleInfo.isSystemAdmin || isOnly) {
            setIsAuthorized(true);
            loadUsers(isOnly, roleInfo.authorityIds || []);
          } else {
            setIsAuthorized(false);
          }
        } catch (error) {
          console.error('Error checking authorization:', error);
          setIsAuthorized(false);
        }
      } else {
        setIsAuthorized(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Enhanced filtering logic with all filters
  useEffect(() => {
    const filtered = users.filter((user) => {
      // 1. Search Logic
      const matchesSearch = searchTerm.trim() === '' ? true : (() => {
        const term = searchTerm.toLowerCase();
        return (
          user.name.toLowerCase().includes(term) ||
          user.email?.toLowerCase().includes(term) ||
          user.phone?.toLowerCase().includes(term)
        );
      })();

      // 2. Status Check
      const matchesStatus = statusFilter === 'ALL' ? true :
        statusFilter === 'COMPLETED' ? (user.onboardingStatus === 'COMPLETED' || (!user.onboardingStatus && !user.onboardingStep)) :
        user.onboardingStatus === 'ONBOARDING' || (!!user.onboardingStep && user.onboardingStatus !== 'COMPLETED');

      // 3. Step Check (only applies if status is ONBOARDING)
      const matchesStep = statusFilter !== 'ONBOARDING' ? true :
        stepFilter === 'ALL' ? true :
        user.onboardingStep === stepFilter;

      // 4. Type Check
      const matchesType = typeFilter === 'ALL' ? true :
        typeFilter === 'REGISTERED' ? (user.isAnonymous !== true && !!user.email) :
        user.isAnonymous === true;

      // 5. Activity Check (workoutsCompleted defaults to 0 for now)
      // TODO: Enhance getAllUsers to fetch actual workout counts
      const workoutsCompleted = (user as any).workoutsCompleted || 0;
      const matchesActivity = activityFilter === 'ALL' ? true :
        activityFilter === 'NEW' ? workoutsCompleted === 0 :
        activityFilter === 'BEGINNER' ? (workoutsCompleted > 0 && workoutsCompleted <= 5) :
        workoutsCompleted > 5; // PRO

      return matchesSearch && matchesStatus && matchesStep && matchesType && matchesActivity;
    });

    setFilteredUsers(filtered);
  }, [searchTerm, users, statusFilter, stepFilter, typeFilter, activityFilter]);

  // Pagination for filtered users
  const { currentPage, totalPages, paginatedItems, goToPage, resetPagination } = usePagination(filteredUsers, 10);
  
  // Reset pagination when filters change
  useEffect(() => {
    resetPagination();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, statusFilter, stepFilter, typeFilter, activityFilter]);


  const loadUsers = async (filterByAuthority: boolean = false, authorityIds: string[] = []) => {
    try {
      setLoading(true);
      // Use direct Firestore query to include authorityId for filtering
      const { collection, query, getDocs, orderBy } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      
      const q = query(collection(db, 'users'), orderBy('core.name', 'asc'));
      const snapshot = await getDocs(q);
      
      let usersData = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const core = data?.core || {};
        const progression = data?.progression || {};
        
        let calculatedLevel = progression.globalLevel || 1;
        if (progression.domains) {
          const domainLevels = Object.values(progression.domains).map((d: any) => d.currentLevel || 0);
          const maxDomainLevel = Math.max(...domainLevels, calculatedLevel);
          if (maxDomainLevel > calculatedLevel) {
            calculatedLevel = maxDomainLevel;
          }
        }
        
        return {
          id: docSnap.id,
          name: core.name || 'Unknown',
          email: core.email || undefined,
          phone: core.phone || undefined,
          gender: core.gender || undefined,
          photoURL: core.photoURL || undefined,
          coins: progression.coins || 0,
          level: calculatedLevel,
          joinDate: data?.createdAt ? data.createdAt : undefined,
          lastActive: data?.lastActive ? data.lastActive : undefined,
          isSuperAdmin: core.isSuperAdmin === true,
          isApproved: core.isApproved === true,
          onboardingStep: data?.onboardingStep || undefined,
          onboardingStatus: data?.onboardingStatus || undefined,
          isAnonymous: core.isAnonymous === true,
          authorityId: core.authorityId || undefined, // Include authorityId for filtering
        };
      });
      
      // Filter by authority for Authority Managers
      if (filterByAuthority && authorityIds.length > 0) {
        usersData = usersData.filter(user => {
          const userAuthorityId = (user as any).authorityId;
          return userAuthorityId && authorityIds.includes(userAuthorityId);
        });
      }
      
      setUsers(usersData as AdminUserListItem[]);
      setFilteredUsers(usersData as AdminUserListItem[]);
    } catch (error) {
      console.error('Error loading users:', error);
      alert('שגיאה בטעינת המשתמשים');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadUsers();
    } finally {
      setRefreshing(false);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את המשתמש "${userName}"?\n\nפעולה זו תמחק את המשתמש מ-Firestore ואת חשבון המשתמש מ-Firebase Auth.\n\nפעולה זו בלתי הפיכה!`)) {
      return;
    }

    setDeletingUserId(userId);
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        const { getUserFromFirestore } = await import('@/lib/firestore.service');
        const profile = await getUserFromFirestore(currentUser.uid);
        const adminInfo = {
          adminId: currentUser.uid,
          adminName: profile?.core?.name || 'System Admin',
        };

        // Delete user
        await deleteUser(userId);

        // Log audit action
        await logAction({
          adminId: adminInfo.adminId,
          adminName: adminInfo.adminName,
          actionType: 'DELETE',
          targetEntity: 'User',
          targetId: userId,
          details: `Deleted user: ${userName}`,
        });

        // Reload users
        await loadUsers();
        alert('משתמש נמחק בהצלחה');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('שגיאה במחיקת המשתמש');
    } finally {
      setDeletingUserId(null);
    }
  };

  const getCurrentAdminInfo = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return null;
    try {
      const { getUserFromFirestore } = await import('@/lib/firestore.service');
      const profile = await getUserFromFirestore(currentUser.uid);
      return {
        adminId: currentUser.uid,
        adminName: profile?.core?.name || 'System Admin',
      };
    } catch (error) {
      return {
        adminId: currentUser.uid,
        adminName: 'System Admin',
      };
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">טוען...</div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield size={48} className="text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">אין הרשאות</h3>
          <p className="text-gray-500">רק מנהלי מערכת יכולים לגשת לדף זה</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-3xl font-black text-gray-900">כל המשתמשים</h1>
        <p className="text-gray-500 mt-2">ניהול וצפייה בכל המשתמשים הרשומים במערכת</p>
      </div>

      {/* Search and Refresh */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={20} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="חפש לפי שם, אימייל או טלפון..."
              className="w-full pr-10 pl-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#5BC2F2] focus:border-transparent outline-none font-simpler text-black"
            />
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="flex items-center gap-2 px-4 py-3 bg-[#5BC2F2] hover:bg-[#4ab0e0] text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            title="רענן רשימה"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
            <span className="font-simpler">רענן</span>
          </button>
        </div>
      </div>

      {/* Advanced Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-bold text-gray-700 mb-1.5 font-simpler">סטטוס</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as 'ALL' | 'COMPLETED' | 'ONBOARDING');
                if (e.target.value !== 'ONBOARDING') {
                  setStepFilter('ALL'); // Reset step filter when status changes
                }
              }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-simpler focus:ring-2 focus:ring-[#5BC2F2] focus:border-transparent outline-none text-black"
            >
              <option value="ALL">הצג הכל</option>
              <option value="COMPLETED">משתמשים פעילים</option>
              <option value="ONBOARDING">בתהליך הרשמה</option>
            </select>
          </div>

          {/* Step Filter (only enabled when status is ONBOARDING) */}
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-bold text-gray-700 mb-1.5 font-simpler">שלב נטישה</label>
            <select
              value={stepFilter}
              onChange={(e) => setStepFilter(e.target.value as 'ALL' | 'LOCATION' | 'EQUIPMENT' | 'HISTORY' | 'SCHEDULE')}
              disabled={statusFilter !== 'ONBOARDING'}
              className={`w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-simpler focus:ring-2 focus:ring-[#5BC2F2] focus:border-transparent outline-none ${
                statusFilter !== 'ONBOARDING' ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''
              }`}
            >
              <option value="ALL">כל השלבים</option>
              <option value="LOCATION">LOCATION</option>
              <option value="EQUIPMENT">EQUIPMENT</option>
              <option value="HISTORY">HISTORY</option>
              <option value="SCHEDULE">SCHEDULE</option>
            </select>
          </div>

          {/* Type Filter */}
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-bold text-gray-700 mb-1.5 font-simpler">סוג משתמש</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'ALL' | 'REGISTERED' | 'GUEST')}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-simpler focus:ring-2 focus:ring-[#5BC2F2] focus:border-transparent outline-none text-black"
            >
              <option value="ALL">כל הסוגים</option>
              <option value="REGISTERED">משתמש רשום</option>
              <option value="GUEST">אורח</option>
            </select>
          </div>

          {/* Activity Filter */}
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-bold text-gray-700 mb-1.5 font-simpler">רמת פעילות</label>
            <select
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value as 'ALL' | 'NEW' | 'BEGINNER' | 'PRO')}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-simpler focus:ring-2 focus:ring-[#5BC2F2] focus:border-transparent outline-none text-black"
            >
              <option value="ALL">כל הרמות</option>
              <option value="NEW">חדש (0 אימונים)</option>
              <option value="BEGINNER">מתחיל (1-5 אימונים)</option>
              <option value="PRO">מתמיד (5+ אימונים)</option>
            </select>
          </div>

          {/* Result Count Badge */}
          <div className="flex items-end">
            <div className="px-4 py-2 bg-[#5BC2F2]/10 rounded-lg border border-[#5BC2F2]/20">
              <span className="text-sm font-bold text-[#5BC2F2] font-simpler">
                נמצאו: {filteredUsers.length} משתמשים
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-sm text-gray-500 mb-1">סה"כ משתמשים</div>
          <div className="text-3xl font-black text-gray-900">{users.length}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-sm text-gray-500 mb-1">משתמשים מאושרים</div>
          <div className="text-3xl font-black text-green-600">
            {users.filter((u) => u.isApproved).length}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-sm text-gray-500 mb-1">סה"כ מטבעות</div>
          <div className="text-3xl font-black text-yellow-600">
            {users.reduce((sum, u) => sum + u.coins, 0).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden min-h-[600px]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right py-4 px-6 text-sm font-bold text-gray-700">משתמש</th>
                <th className="text-right py-4 px-6 text-sm font-bold text-gray-700">אימייל</th>
                <th className="text-right py-4 px-6 text-sm font-bold text-gray-700">טלפון</th>
                <th className="text-right py-4 px-6 text-sm font-bold text-gray-700">מגדר</th>
                <th className="text-right py-4 px-6 text-sm font-bold text-gray-700">סטטוס</th>
                <th className="text-right py-4 px-6 text-sm font-bold text-gray-700">רמה</th>
                <th className="text-right py-4 px-6 text-sm font-bold text-gray-700">מטבעות</th>
                <th className="text-right py-4 px-6 text-sm font-bold text-gray-700">תאריך הצטרפות</th>
                <th className="text-right py-4 px-6 text-sm font-bold text-gray-700">פעילות אחרונה</th>
                <th className="text-right py-4 px-6 text-sm font-bold text-gray-700">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-500 font-simpler">
                    {searchTerm ? 'לא נמצאו משתמשים התואמים לחיפוש' : 'אין משתמשים'}
                  </td>
                </tr>
              ) : (
                paginatedItems.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        {user.photoURL ? (
                          <img
                            src={user.photoURL}
                            alt={user.name}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[#5BC2F2] text-white flex items-center justify-center font-bold">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-gray-900 font-simpler">{user.name}</div>
                          {user.isSuperAdmin && (
                            <div className="text-xs text-purple-600 font-medium flex items-center gap-1">
                              <Shield size={12} />
                              מנהל מערכת
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Mail size={16} />
                        <span className="font-simpler text-black">{user.email || '-'}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-black font-simpler">
                      {user.phone || '-'}
                    </td>
                    <td className="py-4 px-6 text-black font-simpler">
                      {user.gender === 'male' ? 'זכר' : 
                       user.gender === 'female' ? 'נקבה' : 
                       user.gender ? 'אחר' : '-'}
                    </td>
                    <td className="py-4 px-6">
                      {user.onboardingStatus === 'ONBOARDING' ? (
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold font-simpler">
                            Onboarding
                          </span>
                          {user.onboardingStep && (
                            <span className="text-xs text-gray-500 font-simpler">
                              ({user.onboardingStep})
                            </span>
                          )}
                        </div>
                      ) : user.onboardingStatus === 'COMPLETED' ? (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold font-simpler">
                          הושלם
                        </span>
                      ) : user.isAnonymous ? (
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-bold font-simpler">
                          אורח
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold font-simpler">
                          פעיל
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-1 text-[#5BC2F2] font-black text-lg font-simpler">
                        <TrendingUp size={18} />
                        <span>{user.level}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-1 text-yellow-600 font-bold font-simpler">
                        <Coins size={16} />
                        <span>{user.coins.toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-black font-simpler">
                      {formatFirebaseTimestamp(user.joinDate)}
                    </td>
                    <td className="py-4 px-6 text-sm text-black font-simpler">
                      {formatFirebaseTimestamp((user as any).lastActive)}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedUser(user)}
                          className="p-2 hover:bg-[#5BC2F2]/10 rounded-lg transition-colors text-[#5BC2F2]"
                          title="צפה בפרטים"
                        >
                          <Eye size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id, user.name)}
                          disabled={deletingUserId === user.id}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="מחק משתמש"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={goToPage}
          totalItems={filteredUsers.length}
          itemsPerPage={10}
        />
      </div>

      {/* User Detail Modal */}
      <AnimatePresence>
        {selectedUser && (
          <UserDetailModal
            user={selectedUser}
            onClose={() => setSelectedUser(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
