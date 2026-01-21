"use client";
import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

const LOADING_STEPS = [
    "מנתח את השטח...",
    "מחפש נקודות עניין...",
    "מחשב מרחקים וגבהים...",
    "מתאים את המסלול לפרופיל שלך...",
    "כמעט סיימנו..."
];

export default function RouteGenerationLoader() {
    const [currentStep, setCurrentStep] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentStep((prev) => (prev + 1) % LOADING_STEPS.length);
        }, 2500); // 2500ms as requested

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="fixed inset-0 z-50 bg-white/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
            <div className="mb-8 relative">
                <div className="absolute inset-0 bg-blue-100 rounded-full animate-ping opacity-20"></div>
                <div className="relative bg-white p-4 rounded-full shadow-xl border border-blue-50">
                    <Loader2 size={48} className="text-blue-500 animate-spin" />
                </div>
            </div>

            <h3 className="text-xl font-bold text-gray-900 mb-2 min-h-[1.75rem] transition-all duration-300">
                {LOADING_STEPS[currentStep]}
            </h3>
            <p className="text-sm text-gray-400">
                ה-AI שלנו בונה לך מסלול מושלם
            </p>
        </div>
    );
}
