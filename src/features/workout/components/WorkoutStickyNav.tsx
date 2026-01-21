'use client';

import React from 'react';
import { WorkoutSegment } from '@/features/map/types/map-objects.type';
import { MapPin, Dumbbell, CheckCircle2, Circle } from 'lucide-react';

interface WorkoutStickyNavProps {
    segments: WorkoutSegment[];
    activeIndex: number;
    onSegmentClick?: (index: number) => void;
}

// Get Material Icon name based on segment type
const getMaterialIcon = (segment: WorkoutSegment, index: number, totalSegments: number): string => {
    if (index === totalSegments - 1) {
        return 'check_circle'; // Finish
    }
    if (segment.type === 'travel') {
        // Check if it's warmup/rest
        const title = segment.title.toLowerCase();
        if (title.includes('חימום') || title.includes('warmup')) {
            return 'wb_sunny';
        }
        if (title.includes('מנוחה') || title.includes('rest') || title.includes('שחרור')) {
            return 'chair';
        }
        return 'directions_walk';
    }
    return 'fitness_center'; // Station/Strength
};

export default function WorkoutStickyNav({ segments, activeIndex, onSegmentClick }: WorkoutStickyNavProps) {
    return (
        <div className="pb-2 px-4 shrink-0 relative">
            {/* Floating Material Icons above progress segments */}
            <div className="flex items-center justify-between gap-1 max-w-lg mx-auto mb-2 px-2">
                {segments.map((segment, index) => {
                    const isActive = index === activeIndex;
                    const iconName = getMaterialIcon(segment, index, segments.length);
                    
                    return (
                        <div
                            key={`icon-${segment.id}`}
                            className={`flex-1 flex flex-col items-center transition-all duration-300 ${
                                isActive ? 'opacity-100 scale-110' : 'opacity-40'
                            }`}
                        >
                            <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-lg transition-all ${
                                    isActive
                                        ? 'bg-white/90 shadow-lg'
                                        : 'bg-white/50 backdrop-blur-sm'
                                }`}
                            >
                                <span
                                    className={`material-icons text-base ${
                                        isActive ? 'text-[#00AEEF]' : 'text-gray-600'
                                    }`}
                                >
                                    {iconName}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Progress Segments */}
            <div className="flex items-end justify-between gap-1 max-w-lg mx-auto">
                {segments.map((segment, index) => {
                    const isActive = index === activeIndex;
                    const isPast = index < activeIndex;

                    let Icon;
                    let colorClass = 'bg-primary';
                    let textColorClass = 'text-primary';

                    if (index === segments.length - 1) {
                        Icon = CheckCircle2;
                    } else if (segment.type === 'travel') {
                        Icon = MapPin;
                        colorClass = index % 2 === 0 ? 'bg-primary' : 'bg-secondary';
                        textColorClass = index % 2 === 0 ? 'text-primary' : 'text-secondary';
                    } else {
                        Icon = Dumbbell;
                        colorClass = 'bg-out-blue';
                        textColorClass = 'text-out-blue';
                    }

                    return (
                        <React.Fragment key={segment.id}>
                            <div
                                className={`flex-1 flex flex-col items-center cursor-pointer pb-2 relative transition-all duration-300 ${isActive ? 'active opacity-100 scale-110' : 'opacity-30'}`}
                                onClick={() => onSegmentClick?.(index)}
                            >
                                <div className={`h-1.5 w-full rounded-full transition-all duration-500 ${isPast || isActive ? colorClass : 'bg-gray-100'}`} />
                            </div>
                            {index < segments.length - 1 && <div className="w-1 h-1.5 bg-transparent mb-2 shrink-0" />}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
}
