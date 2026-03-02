'use client';

import React from 'react';
import { 
  Clock, 
  Dumbbell, 
  Play, 
  Zap, 
  Activity,
  Circle,
  Square,
  Anchor,
  Package,
  type LucideIcon
} from 'lucide-react';
import { WorkoutPlan, WorkoutSegment } from '@/features/parks';
import { resolveDescription, TagResolverContext } from '@/features/content/branding/core/branding.utils';
import { UserFullProfile } from '@/features/user';
import { useIsMounted } from '@/hooks/useIsMounted';
import { resolveEquipmentLabel } from '@/features/workout-engine/shared/utils/gear-mapping.utils';

interface StrengthOverviewCardProps {
  workoutPlan: WorkoutPlan;
  userProfile?: UserFullProfile;
  coverImage?: string;
  onStartWorkout: () => void;
}

// Muscle group labels with Lucide icons
const MUSCLE_GROUP_LABELS: Record<string, { label: string; Icon: LucideIcon }> = {
  chest: { label: 'חזה', Icon: Square },
  back: { label: 'גב', Icon: Square },
  shoulders: { label: 'כתפיים', Icon: Circle },
  abs: { label: 'בטן', Icon: Square },
  obliques: { label: 'אלכסונים', Icon: Square },
  forearms: { label: 'אמות', Icon: Activity },
  biceps: { label: 'דו-ראשי', Icon: Activity },
  triceps: { label: 'שלושה ראשים', Icon: Activity },
  quads: { label: 'ארבע ראשי', Icon: Activity },
  hamstrings: { label: 'המסטרינג', Icon: Activity },
  glutes: { label: 'ישבן', Icon: Activity },
  calves: { label: 'שוקיים', Icon: Activity },
  traps: { label: 'טרפז', Icon: Square },
  cardio: { label: 'קרדיו', Icon: Activity },
  full_body: { label: 'כל הגוף', Icon: Activity },
  core: { label: 'ליבה', Icon: Square },
  legs: { label: 'רגליים', Icon: Activity },
};

// Equipment icons mapping
const EQUIPMENT_ICONS: Record<string, LucideIcon> = {
  'מקבילים': Anchor,
  'Parallel Bars': Anchor,
  'טבעות': Circle,
  'Rings': Circle,
  'גומיית התנגדות': Package,
  'Resistance Band': Package,
  'Pull-up Bar': Anchor,
};

// Difficulty labels
const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'קל',
  medium: 'בינוני',
  hard: 'קשה',
};

export default function StrengthOverviewCard({
  workoutPlan,
  userProfile,
  coverImage,
  onStartWorkout,
}: StrengthOverviewCardProps) {
  const mounted = useIsMounted();

  // Calculate total duration and extract equipment
  const totalDuration = workoutPlan.totalDuration || 0;
  const difficulty = workoutPlan.difficulty || 'medium';
  
  // Extract unique equipment from all segments
  const equipmentSet = new Set<string>();
  const allExercises: Array<{ name: string; reps?: string; duration?: string; imageUrl?: string; icon?: string }> = [];
  const muscleGroupsSet = new Set<string>();
  
  // Equipment mapping from exercise names
  const equipmentKeywords: Record<string, string> = {
    'מקבילים': 'מקבילים',
    'parallel': 'מקבילים',
    'טבעות': 'טבעות',
    'rings': 'טבעות',
    'גומיה': 'גומיית התנגדות',
    'resistance': 'גומיית התנגדות',
    'מתח': 'Pull-up Bar',
    'pull-up': 'Pull-up Bar',
    'דיפ': 'Parallel Bars',
    'dip': 'Parallel Bars',
  };

  // Muscle group mapping from exercise names
  const muscleKeywords: Record<string, string[]> = {
    'חזה': ['chest'],
    'chest': ['chest'],
    'כתפיים': ['shoulders'],
    'shoulders': ['shoulders'],
    'גב': ['back'],
    'back': ['back'],
    'יד אחורית': ['triceps'],
    'triceps': ['triceps'],
    'יד קדמית': ['biceps'],
    'biceps': ['biceps'],
    'אמות': ['forearms'],
    'forearms': ['forearms'],
    'רגליים': ['legs', 'quads', 'hamstrings'],
    'legs': ['legs'],
    'סקוואט': ['quads', 'glutes'],
    'squat': ['quads', 'glutes'],
    'ליבה': ['core', 'abs'],
    'core': ['core', 'abs'],
    'בטן': ['abs'],
    'abs': ['abs'],
  };
  
  workoutPlan.segments.forEach((segment) => {
    if (segment.exercises) {
      segment.exercises.forEach((exercise) => {
        allExercises.push({
          name: exercise.name,
          reps: exercise.reps,
          duration: exercise.duration,
          imageUrl: exercise.imageUrl,
          icon: exercise.icon,
        });
        
        // Extract equipment from exercise name
        const exerciseNameLower = exercise.name.toLowerCase();
        for (const [keyword, equipment] of Object.entries(equipmentKeywords)) {
          if (exerciseNameLower.includes(keyword.toLowerCase())) {
            equipmentSet.add(equipment);
            break;
          }
        }
        
        // Extract muscle groups from exercise name
        for (const [keyword, muscles] of Object.entries(muscleKeywords)) {
          if (exerciseNameLower.includes(keyword.toLowerCase())) {
            muscles.forEach(m => muscleGroupsSet.add(m));
          }
        }
      });
    }
    
    // Also check segment icon for equipment (resolve to Hebrew)
    if (segment.icon && !segment.icon.match(/[💪🔥🏋️🦵⚡]/)) {
      equipmentSet.add(resolveEquipmentLabel(segment.icon));
    }
  });

  // Get primary muscle groups - use extracted or default
  const primaryMuscles: string[] = muscleGroupsSet.size > 0 
    ? Array.from(muscleGroupsSet).slice(0, 5) 
    : ['chest', 'shoulders', 'triceps']; // Default fallback

  // Resolve smart description
  const getSmartDescription = (): string => {
    if (!mounted || typeof window === 'undefined') return '';
    
    const context: TagResolverContext = {
      persona: userProfile?.core?.personaId || 'parent',
      location: 'park', // Could be dynamic based on workout location
      userProfile: userProfile,
      userName: userProfile?.core?.name?.split(' ')[0] || 'משתמש',
      userGoal: userProfile?.core?.mainGoal ? 
        (userProfile.core.mainGoal === 'healthy_lifestyle' ? 'אורח חיים בריא' :
         userProfile.core.mainGoal === 'performance_boost' ? 'שיפור ביצועים' :
         userProfile.core.mainGoal === 'weight_loss' ? 'ירידה במשקל' :
         userProfile.core.mainGoal === 'skill_mastery' ? 'שליטה במיומנויות' : 'אימון') : 'אימון',
      userGender: userProfile?.core?.gender || 'other',
      muscles: primaryMuscles,
      equipment: Array.from(equipmentSet),
      currentTime: new Date(),
    };

    // Default description template
    const defaultDescription = `אימון כוח מושלם ל-@שם ב-@מיקום. מתמקד ב-@שריר ומתאים ל-@מטרה שלך. @בוא/י נתחיל!`;
    
    return resolveDescription(defaultDescription, context);
  };

  const smartDescription = getSmartDescription();

  // Format duration
  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes} דק'`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}ש ${remainingMinutes}דק'` : `${hours}ש`;
  };

  return (
    <div className="w-full overflow-visible bg-transparent">
      {/* Quick Info Row - Premium Pills Design */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {/* Time Pill */}
        <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full shadow-sm">
          <Clock size={16} className="text-cyan-500 flex-shrink-0" />
          <span className="text-sm font-bold text-gray-900 dark:text-white">{formatDuration(totalDuration)}</span>
        </div>
        
        {/* Difficulty Pill */}
        <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full shadow-sm">
          <Zap size={16} className="text-blue-500 flex-shrink-0" />
          <span className="text-sm font-bold text-gray-900 dark:text-white">{DIFFICULTY_LABELS[difficulty] || difficulty}</span>
        </div>
        
        {/* Muscles Pill - Removed, will show separately below */}
      </div>

      {/* Involved Muscles - Premium Chips with Icons */}
      {primaryMuscles.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">שרירים</h3>
          <div className="flex flex-wrap gap-2">
            {primaryMuscles.map((muscle, index) => {
              const muscleInfo = MUSCLE_GROUP_LABELS[muscle] || { label: muscle, Icon: Activity };
              const IconComponent = muscleInfo.Icon;
              return (
                <div
                  key={index}
                  className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-full text-xs font-bold text-slate-600"
                >
                  <IconComponent size={12} className="text-slate-500 flex-shrink-0" />
                  <span>{muscleInfo.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Equipment Needed - Premium Pills */}
      {equipmentSet.size > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">ציוד</h3>
          <div className="flex flex-wrap gap-2">
            {Array.from(equipmentSet).map((equipment, index) => {
              const EquipmentIcon = EQUIPMENT_ICONS[equipment] || Package;
              return (
                <div
                  key={index}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full shadow-sm"
                  dir="rtl"
                >
                  <EquipmentIcon size={16} className="text-cyan-500 flex-shrink-0" />
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{equipment}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Smart Description */}
      {smartDescription && (
        <div className="mb-6">
          <p className="text-slate-700 leading-relaxed">{smartDescription}</p>
        </div>
      )}

      {/* Exercise List Preview - Premium Cards with Images */}
      {allExercises.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">תרגילים באימון</h3>
          <div className="space-y-0">
            {allExercises.map((exercise, index) => (
              <div
                key={index}
                className="h-24 w-full bg-white rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.03)] border border-transparent flex flex-row items-center overflow-hidden mb-3"
                dir="rtl"
              >
                {/* Exercise Image - RIGHT side (RTL default) */}
                <div className="h-full w-32 flex-shrink-0 bg-slate-100 rounded-r-xl rounded-l-none overflow-hidden relative">
                  {exercise.imageUrl || exercise.icon ? (
                    <img
                      src={exercise.imageUrl || exercise.icon}
                      alt={exercise.name}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        // Hide broken image and show fallback
                        e.currentTarget.style.display = 'none';
                        const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                        if (fallback) {
                          fallback.style.display = 'flex';
                        }
                      }}
                    />
                  ) : null}
                  <div 
                    className={`h-full w-full bg-gradient-to-br from-cyan-100 to-blue-100 flex items-center justify-center ${exercise.imageUrl || exercise.icon ? 'hidden absolute inset-0' : ''}`}
                  >
                    <Dumbbell size={24} className="text-cyan-600" />
                  </div>
                </div>
                
                {/* Exercise Content - LEFT side (RTL default) */}
                <div className="flex-grow px-5 flex flex-col justify-center items-start text-right">
                  <p className="text-sm font-bold text-slate-800 mb-1">{exercise.name}</p>
                  {(exercise.reps || exercise.duration) && (
                    <p className="text-xs font-bold text-[#00B4D8]">
                      {exercise.reps || exercise.duration}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Spacer div to allow scrolling past the button */}
      <div className="h-40" />
    </div>
  );
}
