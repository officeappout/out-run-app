'use client';

import React, { useState } from 'react';
import dynamicImport from 'next/dynamic';
import {
  Activity, Bike, ChevronDown, ChevronUp, Clock, Coins, Dumbbell, Footprints, MapPin, Moon, Move,
} from 'lucide-react';
import { formatPace } from '@/features/workout-engine/core/utils/formatPace';
import type { UserTabData } from '../tabs/types';

// Dynamic import for map to avoid SSR issues
const RunMapBlock = dynamicImport(
  () => import('@/features/workout-engine/summary/components/running/RunMapBlock'),
  { ssr: false }
);

/** "אימונים שבוצעו": the 50 most recent workouts, expandable per row. */
export default function WorkoutHistoryList({ workoutHistory }: Pick<UserTabData, 'workoutHistory'>) {
  const [expandedWorkoutId, setExpandedWorkoutId] = useState<string | null>(null);
  return (
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
                case 'recovery':
                  return <Moon {...iconProps} />;
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
                case 'recovery':
                  return 'אימון התאוששות';
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
            const isExpanded = expandedWorkoutId === workout.id;

            return (
            <div
              key={workout.id}
              onClick={() => setExpandedWorkoutId(isExpanded ? null : (workout.id ?? null))}
              className="bg-gray-50 rounded-xl p-4 hover:bg-gray-100 transition-colors cursor-pointer"
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
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 text-sm text-gray-500 font-simpler">
                          <Clock size={12} />
                          <span>{new Date(workout.date).toLocaleDateString('he-IL')} • {completionTime}</span>
                        </div>
                        {isExpanded ? (
                          <ChevronUp size={16} className="text-gray-400" />
                        ) : (
                          <ChevronDown size={16} className="text-gray-400" />
                        )}
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

                    {/* Expanded detail panel — exercises/sets for strength workouts */}
                    {isExpanded && (
                      <div
                        className="mt-3 pt-3 border-t border-gray-200"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(() => {
                          const exerciseLog = workout.segments?.[0]?.actual?.exerciseLog;
                          if (workout.workoutType !== 'strength' || !exerciseLog || exerciseLog.length === 0) {
                            return (
                              <div className="text-center py-3 text-gray-400 text-xs font-simpler">
                                אין פירוט תרגילים זמין לאימון זה
                              </div>
                            );
                          }
                          return (
                          <div className="space-y-2">
                            {exerciseLog.map((ex, exIdx) => (
                              <div
                                key={`${workout.id}-${ex.exerciseId}-${exIdx}`}
                                className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100"
                              >
                                <span className="text-sm font-bold text-gray-800 font-simpler">
                                  {ex.exerciseName}
                                </span>
                                <div className="flex items-center gap-1 flex-wrap justify-end">
                                  {ex.confirmedReps.map((reps, setIdx) => (
                                    <span
                                      key={setIdx}
                                      className="bg-gray-100 rounded px-2 py-0.5 text-xs font-bold text-gray-700 font-simpler"
                                    >
                                      {reps}/{ex.targetReps}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                          );
                        })()}
                      </div>
                    )}
            </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
