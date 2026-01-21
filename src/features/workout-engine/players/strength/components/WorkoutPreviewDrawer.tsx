'use client';

import React, { useRef, useEffect, useState } from 'react';
import { WorkoutPlan } from '@/features/parks';
import WorkoutTimeline from './WorkoutTimeline';
import WorkoutHeader from './WorkoutHeader';
import WorkoutStickyNav from './WorkoutStickyNav';
import { WorkoutIntensity } from '../../../generator/services/workout-generator.service';
import {
    Play,
    Calendar,
    Zap,
    Star,
    X,
    Share2,
    ArrowRight,
    Map,
    Dumbbell as DumbbellIcon,
    Home,
    ArrowLeft,
    CheckCircle,
    Clock,
    Flame,
    ChevronDown,
    Battery,
    Activity
} from 'lucide-react';

interface WorkoutPreviewDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onStart: (intensity?: WorkoutIntensity) => void;
    plan: WorkoutPlan | null;
}

export default function WorkoutPreviewDrawer({
    isOpen,
    onClose,
    onStart,
    plan
}: WorkoutPreviewDrawerProps) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [selectedIntensity, setSelectedIntensity] = useState<WorkoutIntensity>('normal');
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Reset scroll and active index when plan changes or opens
    useEffect(() => {
        if (isOpen) {
            setActiveIndex(0);
            if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTop = 0;
            }
        }
    }, [isOpen, plan]);

    if (!isOpen || !plan) return null;

    const handleScroll = () => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const segmentElements = plan.segments.map((_, i) =>
            document.getElementById(`segment-${i + 1}`)
        );

        const containerRect = container.getBoundingClientRect();
        let currentActive = 0;

        segmentElements.forEach((el, index) => {
            if (el) {
                const rect = el.getBoundingClientRect();
                if (rect.top - containerRect.top < containerRect.height / 3) {
                    currentActive = index;
                }
            }
        });

        setActiveIndex(currentActive);
    };

    const scrollToSegment = (index: number) => {
        const el = document.getElementById(`segment-${index + 1}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    return (
        <div
            className={`fixed inset-0 z-50 flex flex-col bg-white transition-transform duration-500 ease-out ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
            dir="rtl"
        >
            <WorkoutHeader />

            {/* Close Button Overlay */}
            <button
                onClick={onClose}
                className="absolute top-14 left-4 w-10 h-10 bg-white shadow-lg rounded-full flex items-center justify-center z-[60] active:scale-95 transition-transform"
            >
                <X size={24} className="text-gray-900" />
            </button>

            {/* Main Drawer-style Content */}
            <div className="flex-1 flex flex-col bg-white rounded-t-3xl shadow-drawer relative z-10 -mt-6 overflow-hidden border-t border-gray-100">
                <WorkoutStickyNav
                    segments={plan.segments}
                    activeIndex={activeIndex}
                    onSegmentClick={scrollToSegment}
                />

                <div
                    ref={scrollContainerRef}
                    onScroll={handleScroll}
                    className="flex-1 overflow-y-auto p-4 pb-44 scroll-smooth"
                >
                    {/* Hero Info */}
                    <section className="mb-8 mt-2 flex flex-col items-center text-center">
                        <h1 className="text-2xl font-black mb-2 text-gray-900">
                            {plan.name}
                        </h1>
                        <div className="flex items-center gap-4 text-sm text-gray-600 mb-4 bg-white px-4 py-2 rounded-full shadow-subtle border border-gray-100">
                            <div className="flex items-center gap-1">
                                <Calendar size={16} className="text-primary" />
                                <span className="font-bold">{plan.totalDuration} דק׳</span>
                                <span className="text-xs">זמן כולל</span>
                            </div>
                            <div className="w-px h-3 bg-gray-300" />
                            <div className="flex items-center gap-1">
                                <Zap size={16} className="text-secondary" />
                                <span className="font-bold">450</span>
                                <span className="text-xs">קק״ל</span>
                            </div>
                            <div className="w-px h-3 bg-gray-300" />
                            <div className="flex items-center gap-1">
                                <Star size={16} className="text-yellow-400 fill-yellow-400" />
                                <span className="font-bold">4.9</span>
                            </div>
                        </div>
                        <p className="text-sm text-gray-600 leading-relaxed max-w-sm">
                            אימון חזק המשלב הליכה מהירה ותרגילי כוח בתחנות הפזורות לאורך המסלול.
                        </p>
                    </section>

                    {/* Intensity Selector */}
                    <section className="mb-6">
                        <label className="block text-sm font-bold text-gray-700 mb-3 text-center">
                            בחר רמת אנרגיה
                        </label>
                        <div className="flex gap-3 justify-center">
                            {[
                                {
                                    id: 'low' as WorkoutIntensity,
                                    label: 'Low Energy',
                                    hebrewLabel: 'אנרגיה נמוכה',
                                    description: 'התאוששות/קל',
                                    icon: Battery,
                                    color: 'bg-blue-50 border-blue-500 text-blue-700',
                                    hoverColor: 'hover:bg-blue-100',
                                },
                                {
                                    id: 'normal' as WorkoutIntensity,
                                    label: 'Standard',
                                    hebrewLabel: 'רגיל',
                                    description: 'ברמה שלך',
                                    icon: Activity,
                                    color: 'bg-emerald-50 border-emerald-500 text-emerald-700',
                                    hoverColor: 'hover:bg-emerald-100',
                                },
                                {
                                    id: 'high' as WorkoutIntensity,
                                    label: 'Challenge',
                                    hebrewLabel: 'אתגר',
                                    description: 'קשה/דחוף',
                                    icon: Flame,
                                    color: 'bg-orange-50 border-orange-500 text-orange-700',
                                    hoverColor: 'hover:bg-orange-100',
                                },
                            ].map((option) => {
                                const isSelected = selectedIntensity === option.id;
                                const IconComponent = option.icon;
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => setSelectedIntensity(option.id)}
                                        className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all flex-1 ${
                                            isSelected
                                                ? `${option.color} shadow-md scale-[1.02]`
                                                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                        }`}
                                    >
                                        <IconComponent
                                            size={24}
                                            className={isSelected ? 'opacity-100' : 'opacity-60'}
                                        />
                                        <div className="text-center">
                                            <div className="text-xs font-bold">{option.hebrewLabel}</div>
                                            <div className="text-[10px] text-gray-500 mt-0.5">
                                                {option.description}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-xs text-gray-500 text-center mt-3">
                            {selectedIntensity === 'low' && 'תרגילים ברמה נמוכה יותר - מושלם להתאוששות'}
                            {selectedIntensity === 'normal' && 'תרגילים ברמה שלך - אימון מאוזן'}
                            {selectedIntensity === 'high' && 'תרגילים מאתגרים - דחוף את עצמך'}
                        </p>
                    </section>

                    <WorkoutTimeline
                        plan={plan}
                        activeSegmentId={`segment-${activeIndex + 1}`}
                    />
                </div>
            </div>

            {/* Bottom Action Bar */}
            <div className="fixed bottom-10 left-0 right-0 px-6 z-40 pointer-events-none">
                <button
                    onClick={() => onStart(selectedIntensity)}
                    className="w-full pointer-events-auto bg-primary text-white font-bold text-xl py-4 rounded-full shadow-floating flex items-center justify-center gap-2 hover:opacity-90 transition-opacity active:scale-95"
                >
                    <span>התחל אימון</span>
                    <Play size={24} fill="white" />
                </button>
            </div>
        </div>
    );
}
