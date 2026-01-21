'use client';

import React from 'react';
import { Share2, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function WorkoutHeader() {
    const router = useRouter();

    return (
        <div className="relative w-full h-[35vh] shrink-0 z-0">
            {/* Map Pattern Background */}
            <div className="absolute inset-0 bg-[#f3f4f6] opacity-70"
                style={{
                    backgroundImage: 'radial-gradient(#d1d5db 1.5px, transparent 1.5px), radial-gradient(#d1d5db 1.5px, #f3f4f6 1.5px)',
                    backgroundSize: '30px 30px',
                    backgroundPosition: '0 0, 15px 15px'
                }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/5 to-transparent pointer-events-none" />

            {/* Top Controls */}
            <div className="absolute top-0 left-0 right-0 p-4 pt-14 flex justify-between items-start z-10">
                <button className="w-10 h-10 bg-white/95 backdrop-blur-md rounded-full flex items-center justify-center shadow-sm text-gray-700 active:scale-90 transition-transform">
                    <Share2 size={20} />
                </button>
                <button
                    onClick={() => router.back()}
                    className="w-10 h-10 bg-white/95 backdrop-blur-md rounded-full flex items-center justify-center shadow-sm text-gray-700 active:scale-90 transition-transform"
                >
                    <ArrowRight size={20} />
                </button>
            </div>

            {/* Map Badge */}
            <div className="absolute bottom-12 right-4 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-xs font-bold text-gray-800">תצוגת מפה</span>
            </div>
        </div>
    );
}
