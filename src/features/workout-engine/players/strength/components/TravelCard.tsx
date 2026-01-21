'use client';

import React from 'react';
import { WorkoutSegment } from '@/features/parks';
import { MapPin, Ruler, Zap } from 'lucide-react';

interface TravelCardProps {
    segment: WorkoutSegment;
    id?: string;
}

export default function TravelCard({ segment, id }: TravelCardProps) {
    const isPrimary = segment.title.includes('חימום') || segment.title.includes('שחרור');
    const colorClass = isPrimary ? 'bg-primary' : 'bg-secondary';
    const lightColorClass = isPrimary ? 'bg-primary/10' : 'bg-secondary/10';
    const textColorClass = isPrimary ? 'text-primary' : 'text-secondary';

    return (
        <div className="flex relative pb-6 scroll-mt-36 group" id={id}>
            {/* Vertical Connection Line */}
            <div className="absolute end-6 top-10 bottom-[-24px] w-0.5 bg-gray-100 z-0 group-last:hidden" />

            <div className="w-14 flex-shrink-0 flex flex-col items-center z-10 relative">
                <div className={`w-8 h-8 rounded-full ${colorClass} flex items-center justify-center shadow-sm border-2 border-white mt-2`}>
                    <MapPin size={18} className="text-white" />
                </div>
            </div>

            <div className="flex-1 me-2">
                <div className="bg-white rounded-xl p-4 shadow-subtle border border-gray-100">
                    <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold text-gray-900">{segment.title}</h4>
                        <span className={`text-xs font-bold ${textColorClass} ${lightColorClass} px-2 py-0.5 rounded-md`}>
                            {segment.target.value} {segment.target.unit}
                        </span>
                    </div>
                    <div className="flex items-center text-sm text-gray-500 gap-4 mb-2">
                        <span className="flex items-center gap-1"><Ruler size={14} /> 500 מ׳</span>
                        <span className="flex items-center gap-1"><Zap size={14} /> {segment.paceTarget || 'קצב חופשי'}</span>
                    </div>
                    <p className="text-xs text-gray-400 leading-tight">
                        {segment.subTitle || 'המשיכו להתקדם לעבר היעד הבא.'}
                    </p>
                </div>
            </div>
        </div>
    );
}
