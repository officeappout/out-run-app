'use client';

import { Dumbbell, PersonStanding, Bike, Activity } from 'lucide-react';
import type { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';

interface RecentActivityListProps {
  workouts: WorkoutHistoryEntry[];
  isLoading: boolean;
}

/** Map displayIcon / workoutType to an icon component and Hebrew label */
function getActivityMeta(workout: WorkoutHistoryEntry): {
  Icon: React.ElementType;
  label: string;
  iconColor: string;
} {
  const type = workout.workoutType ?? workout.activityType ?? 'running';
  switch (type) {
    case 'strength':
    case 'STRENGTH':
      return { Icon: Dumbbell, label: 'אימון כוח', iconColor: 'text-purple-500' };
    case 'walking':
      return { Icon: PersonStanding, label: 'הליכה', iconColor: 'text-green-500' };
    case 'cycling':
      return { Icon: Bike, label: 'רכיבה', iconColor: 'text-amber-500' };
    case 'running':
    default:
      return { Icon: Activity, label: 'ריצה', iconColor: 'text-[#00ADEF]' };
  }
}

const DATE_FMT = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short' });

function formatDate(d: Date | string | undefined): string {
  if (!d) return '';
  try {
    const date = d instanceof Date ? d : new Date(d);
    return DATE_FMT.format(date);
  } catch {
    return '';
  }
}

/**
 * Vertical list of the last 5 workout sessions.
 * Accepts the shared workouts array from DashboardTab so no duplicate fetch occurs.
 */
export default function RecentActivityList({ workouts, isLoading }: RecentActivityListProps) {
  const recent = workouts.slice(0, 5);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100" dir="rtl">
      <h3 className="text-sm font-black text-gray-800 mb-3">פעילות אחרונה</h3>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-9 h-9 rounded-xl bg-gray-100 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-gray-100 rounded w-3/4" />
                <div className="h-2.5 bg-gray-100 rounded w-1/2" />
              </div>
              <div className="h-5 w-12 bg-gray-100 rounded-full" />
            </div>
          ))}
        </div>
      ) : recent.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 gap-2">
          <span className="text-3xl">🏃</span>
          <p className="text-sm font-bold text-gray-500 text-center">
            עוד אין פעילויות.
            <br />
            תתחיל לזוז!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {recent.map((workout, idx) => {
            const { Icon, label, iconColor } = getActivityMeta(workout);
            const xp = workout.xpEarned ?? 0;
            const dateStr = formatDate(workout.date);

            return (
              <div
                key={workout.id ?? idx}
                className="flex items-center gap-3"
              >
                {/* Icon bubble */}
                <div className="w-9 h-9 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
                  <Icon className={`w-4 h-4 ${iconColor}`} />
                </div>

                {/* Label + date */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-gray-800 leading-snug">{label}</p>
                  <p className="text-[10px] text-gray-400">{dateStr}</p>
                </div>

                {/* XP badge */}
                <span
                  className={`text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${
                    xp > 0
                      ? 'bg-[#00ADEF]/10 text-[#00ADEF]'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                  dir="ltr"
                >
                  {xp > 0 ? `+${xp} XP` : '— XP'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
