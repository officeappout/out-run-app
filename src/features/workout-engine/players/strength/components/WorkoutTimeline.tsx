'use client';

import React from 'react';
import { WorkoutSegment, WorkoutPlan } from '@/features/parks';
import StationCard from './StationCard';
import TravelCard from './TravelCard';
import { CheckCircle2 } from 'lucide-react';

interface WorkoutTimelineProps {
    segments?: WorkoutSegment[];
    plan?: WorkoutPlan;
    activeSegmentId?: string;
    className?: string;
}

export default function WorkoutTimeline({
    segments,
    plan,
    activeSegmentId,
    className = ''
}: WorkoutTimelineProps) {
    const segmentsToRender = plan?.segments || segments || [];

    return (
        <div className={`flex flex-col ${className}`} dir="rtl">
            {segmentsToRender.map((segment, index) => {
                const isLast = index === segmentsToRender.length - 1;
                const segmentId = `segment-${index + 1}`;
                const isActive = activeSegmentId === segmentId || activeSegmentId === segment.id;

                if (isLast) {
                    return (
                        <div key={segment.id} className="flex relative pb-10 scroll-mt-36" id={segmentId}>
                            <div className="w-14 flex-shrink-0 flex flex-col items-center z-10 relative">
                                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-sm border-2 border-white mt-2">
                                    <CheckCircle2 size={18} className="text-white" />
                                </div>
                            </div>
                            <div className="flex-1 me-2 px-1">
                                <div className="bg-white rounded-xl p-4 shadow-subtle border border-gray-100 opacity-80">
                                    <div className="flex justify-between items-start mb-1">
                                        <h4 className="font-bold text-gray-900">{segment.title}</h4>
                                        <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">
                                            {segment.target.value} {segment.target.unit}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-600">
                                        {segment.subTitle}
                                    </p>
                                </div>
                            </div>
                        </div>
                    );
                }

                return segment.type === 'station' ? (
                    <StationCard key={segment.id} segment={segment} id={segmentId} isActive={isActive} />
                ) : (
                    <TravelCard key={segment.id} segment={segment} id={segmentId} />
                );
            })}
        </div>
    );
}
