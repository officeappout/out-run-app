"use client";
/* eslint-disable @next/next/no-img-element */
import React, { useState, useEffect } from 'react';
import { useT } from '@/hooks/useT';
import { map as mapNs } from '@/messages/ns/map';

const LOADING_STEP_KEYS = [
    'routeLoader.step.terrain',
    'routeLoader.step.poi',
    'routeLoader.step.distances',
    'routeLoader.step.profile',
    'routeLoader.step.almost',
] as const;

export default function RouteGenerationLoader() {
    const t = useT(mapNs);
    const [currentStep, setCurrentStep] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentStep((prev) => (prev + 1) % LOADING_STEP_KEYS.length);
        }, 2500); // 2500ms as requested

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="fixed inset-0 z-[90] bg-white/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
            {/* Branded logo — replaces generic Loader2 spinner */}
            <div className="mb-8 relative flex items-center justify-center">
                <div
                    className="absolute inset-0 -m-6 rounded-full blur-2xl animate-pulse"
                    style={{
                        background: 'radial-gradient(circle, rgba(0,229,255,0.30) 0%, transparent 70%)',
                        animationDuration: '2s',
                    }}
                />
                <img
                    src="/assets/logo/Kind=logotype.svg"
                    alt="OUT"
                    className="relative h-12 brightness-0 opacity-80 animate-pulse"
                    style={{ animationDuration: '2s' }}
                />
            </div>

            <h3 className="text-xl font-bold text-gray-900 mb-2 min-h-[1.75rem] transition-all duration-300">
                {t(LOADING_STEP_KEYS[currentStep])}
            </h3>
            <p className="text-sm text-gray-400">
                {t('routeLoader.subtitle')}
            </p>
        </div>
    );
}
