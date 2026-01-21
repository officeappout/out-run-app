'use client';

import React, { useState } from 'react';
import { WorkoutSegment } from '@/features/parks';
import { CheckCircle2, Circle, ChevronDown, ChevronUp, MapPin, Dumbbell, Activity, Heart } from 'lucide-react';

interface SegmentCardProps {
    segment: WorkoutSegment;
    isActive?: boolean;
    isLast?: boolean;
}

export default function SegmentCard({
    segment,
    isActive = false,
    isLast = false
}: SegmentCardProps) {
    const [isExpanded, setIsExpanded] = useState(isActive);

    const Icon = segment.isCompleted ? CheckCircle2 : (segment.type === 'travel' ? MapPin : Dumbbell);

    return (
        <div className={`relative flex gap-4 pe-10 ${isActive ? 'opacity-100' : 'opacity-80'}`}>
            {/* Vertical Connection Line - Positioned to the right for RTL */}
            {!isLast && (
                <div className="absolute end-[19px] top-10 bottom-0 w-0.5 bg-gray-200 -z-10" />
            )}

            {/* Icon Circle */}
            <div className={`
        flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center z-10 transition-all duration-300
        ${segment.isCompleted ? 'bg-green-100 text-green-600' :
                    isActive ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-200 scale-110' :
                        'bg-gray-100 text-gray-400'}
      `}>
                <Icon size={20} />
            </div>

            {/* Content */}
            <div className={`
        flex-grow p-4 rounded-2xl border transition-all duration-300 mb-6
        ${isActive ? 'bg-white border-cyan-200 shadow-md transform -translate-x-1' : 'bg-white/50 border-gray-100'}
      `}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex justify-between items-start">
                    <div>
                        <h4 className={`font-bold transition-colors ${isActive ? 'text-gray-900' : 'text-gray-600'}`}>
                            {segment.title}
                        </h4>
                        <p className="text-xs text-gray-400 mt-1">
                            {segment.subTitle || `${segment.target.value} ${segment.target.unit || ''}`}
                        </p>
                    </div>
                    <button className="text-gray-300">
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                </div>

                {/* Collapsible Body */}
                {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-50 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                        {segment.type === 'travel' ? (
                            <div className="flex gap-4">
                                {segment.paceTarget && (
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <Activity size={14} className="text-cyan-500" />
                                        <span>קצב: {segment.paceTarget}</span>
                                    </div>
                                )}
                                {segment.heartRateTarget && (
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <Heart size={14} className="text-red-500" />
                                        <span>דופק: {segment.heartRateTarget}</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {segment.exercises?.map((ex, idx) => (
                                    <div key={ex.id || idx} className="flex items-center justify-between p-2 rounded-lg bg-gray-50/50">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-md bg-white flex items-center justify-center text-gray-400 shadow-sm">
                                                <Dumbbell size={16} />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-medium text-gray-700">{ex.name}</span>
                                                {ex.reps && <span className="text-[10px] text-gray-400">{ex.reps}</span>}
                                            </div>
                                        </div>
                                        {ex.duration && (
                                            <span className="text-[10px] font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">
                                                {ex.duration}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
