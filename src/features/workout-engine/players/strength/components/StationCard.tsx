'use client';

import React from 'react';
import { WorkoutSegment } from '@/features/parks';
import { ChevronDown, Timer, Dumbbell, RotateCcw, Lock } from 'lucide-react';
import StationExerciseRow from './StationExerciseRow';

interface StationCardProps {
    segment: WorkoutSegment;
    id?: string;
    isActive?: boolean;
    /** When true, shows amber lock badge on exercises (equipment not yet confirmed) */
    isEquipmentUnconfirmed?: boolean;
}

export default function StationCard({ segment, id, isActive = false, isEquipmentUnconfirmed = false }: StationCardProps) {
    return (
        <div className={`flex relative pb-6 scroll-mt-36 group`} id={id}>
            {/* Vertical Connection Line */}
            <div className="absolute end-6 top-10 bottom-[-24px] w-0.5 bg-gray-100 z-0 group-last:hidden" />

            {/* Icon Node */}
            <div className="w-14 flex-shrink-0 flex flex-col items-center z-10 relative">
                <div className={`w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm border-2 ${isActive ? 'border-primary scale-110' : 'border-gray-200'} mt-2 transition-all duration-300`}>
                    <Dumbbell size={18} className={isActive ? 'text-primary' : 'text-gray-400'} />
                </div>
            </div>

            {/* Content Card */}
            <div className="flex-1 me-2">
                <details className={`group bg-white rounded-xl shadow-subtle border border-gray-100 relative overflow-hidden transition-all duration-300 ${isActive ? 'ring-2 ring-primary/5' : ''}`} open={isActive}>
                    {/* Accent Bar */}
                    <div className={`absolute end-0 top-0 bottom-0 w-1.5 ${isActive ? 'bg-secondary' : 'bg-gray-200'} z-20`} />

                    <summary className="flex items-center justify-between p-4 cursor-pointer relative pe-5 list-none">
                        <div className="flex flex-col">
                            <h4 className={`font-bold text-base transition-colors ${isActive ? 'text-gray-900' : 'text-gray-500'}`}>{segment.title}</h4>
                            <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                                <span className="flex items-center gap-1"><Timer size={14} /> {segment.target.value} {segment.target.unit}</span>
                                <span>•</span>
                                <span>{segment.exercises?.length || 0} תרגילים</span>
                            </div>
                        </div>
                        <ChevronDown size={20} className="text-gray-300 group-open:rotate-180 transition-transform duration-200" />
                    </summary>

                    <div className="px-3 pb-3 space-y-3 pt-0 border-t border-gray-50 mt-1">
                        <div className="h-2" />
                        {segment.exercises?.map((ex, idx) => (
                          <StationExerciseRow
                            key={ex.id || idx}
                            ex={ex}
                            nameAdornment={isEquipmentUnconfirmed && <Lock size={14} className="text-amber-500 flex-shrink-0" />}
                            trailing={
                              <button className="flex flex-col items-center justify-center w-12 h-12 rounded-full text-gray-300 hover:text-primary hover:bg-white transition-colors">
                                  <RotateCcw size={18} />
                              </button>
                            }
                          />
                        ))}

                        {isActive && (
                            <button className="w-full mt-2 bg-primary text-white font-bold py-3 rounded-xl shadow-lg shadow-primary/20 active:scale-[0.98] transition-all">
                                התחל תרגיל
                            </button>
                        )}
                    </div>
                </details>
            </div>
        </div>
    );
}
