'use client';

import React, { useRef, useEffect, useState } from 'react';
import { WorkoutPlan } from '@/features/parks';
import { WorkoutTimeline, WorkoutHeader, WorkoutStickyNav } from '@/features/workout-engine/players/strength';
import { Play, Calendar, Zap, Star, Map as MapIcon, Dumbbell as DumbbellIcon, Home } from 'lucide-react';

export default function ActiveWorkoutPage() {
    const [activeIndex, setActiveIndex] = useState(0);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const mockPlan: WorkoutPlan = {
        id: 'mock-plan-legs',
        name: 'אימון רגליים קשה',
        totalDuration: 45,
        difficulty: 'hard',
        segments: [
            {
                id: 'seg-1',
                type: 'travel',
                title: 'חימום - הליכה מהירה',
                subTitle: 'התחילו בהליכה נמרצת להעלאת הדופק וחימום המפרקים לקראת האימון.',
                icon: 'run',
                target: { type: 'time', value: 5, unit: 'דק׳' },
                isCompleted: true,
            },
            {
                id: 'seg-2',
                type: 'station',
                title: 'תחנה 1: ספסל בפארק',
                icon: 'bench',
                target: { type: 'time', value: 10, unit: 'דק׳' },
                isCompleted: false,
                exercises: [
                    { id: 'ex-1', name: 'עליות מדרגה', reps: '12 חזרות לרגל' },
                    { id: 'ex-2', name: 'שכיבות סמיכה', reps: '15 חזרות' }
                ]
            },
            {
                id: 'seg-3',
                type: 'travel',
                title: 'ריצה - קצב גבוה',
                subTitle: 'ריצה בקצב גבוה עד לצומת הבא. שמרו על דופק גבוה.',
                icon: 'run',
                target: { type: 'distance', value: 800, unit: 'מ׳' },
                isCompleted: false,
                paceTarget: '4:45'
            },
            {
                id: 'seg-4',
                type: 'station',
                title: 'תחנה 2: גינת כושר',
                icon: 'gym',
                target: { type: 'time', value: 15, unit: 'דק׳' },
                isCompleted: false,
                exercises: [
                    { id: 'ex-5', name: 'מתח (Pull ups)', reps: 'מקסימום חזרות' },
                    { id: 'ex-6', name: 'מקבילים (Dips)', reps: '12 חזרות' }
                ]
            },
            {
                id: 'seg-5',
                type: 'travel',
                title: 'שחרור ומתיחות',
                subTitle: 'הליכה איטית ומתיחות סטטיות ליד הבית.',
                icon: 'check',
                target: { type: 'time', value: 5, unit: 'דק׳' },
                isCompleted: false
            }
        ]
    };

    const handleScroll = () => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const segmentElements = mockPlan.segments.map((_, i) =>
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
        <div className="bg-white text-gray-900 h-[100dvh] flex flex-col overflow-hidden transition-colors duration-200" dir="rtl">
            <WorkoutHeader />

            {/* Main Drawer-style Content */}
            <div className="flex-1 flex flex-col bg-white rounded-t-3xl shadow-drawer relative z-10 -mt-6 overflow-hidden border-t border-gray-100">
                <WorkoutStickyNav
                    segments={mockPlan.segments}
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
                            {mockPlan.name}
                        </h1>
                        <div className="flex items-center gap-4 text-sm text-gray-600 mb-4 bg-white px-4 py-2 rounded-full shadow-subtle border border-gray-100">
                            <div className="flex items-center gap-1">
                                <Calendar size={16} className="text-primary" />
                                <span className="font-bold">18:45</span>
                                <span className="text-xs">סיום משוער</span>
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
                            אימון חזק המתמקד בשרירי הרגליים והישבן, משלב הליכה מהירה ותרגילי כוח בתחנות הפזורות לאורך המסלול.
                        </p>
                    </section>

                    <WorkoutTimeline
                        plan={mockPlan}
                        activeSegmentId={`segment-${activeIndex + 1}`}
                    />
                </div>
            </div>

            {/* Bottom Action Bar */}
            <div className="fixed bottom-24 left-0 right-0 px-6 z-40 pointer-events-none">
                <button className="w-full pointer-events-auto bg-primary text-white font-bold text-xl py-4 rounded-full shadow-floating flex items-center justify-center gap-2 hover:opacity-90 transition-opacity active:scale-95">
                    <span>התחל אימון</span>
                    <Play size={24} fill="white" />
                </button>
            </div>

            {/* Global Bottom Nav Placeholder */}
            <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 pb-8 pt-3 px-6 z-50">
                <div className="flex justify-between items-center max-w-sm mx-auto">
                    <div className="flex flex-col items-center gap-1 text-gray-400">
                        <MapIcon size={24} />
                        <span className="text-[10px] font-bold">מפה</span>
                    </div>
                    <div className="flex flex-col items-center gap-1 text-gray-400">
                        <DumbbellIcon size={24} />
                        <span className="text-[10px] font-bold">תרגילים</span>
                    </div>
                    <div className="flex flex-col items-center gap-1 text-out-blue">
                        <Home size={24} />
                        <span className="text-[10px] font-bold">בית</span>
                    </div>
                </div>
            </nav>
        </div>
    );
}
