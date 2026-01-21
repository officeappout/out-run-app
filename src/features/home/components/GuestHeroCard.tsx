import React from 'react';
import { useRouter } from 'next/navigation';
import { Play } from 'lucide-react';

export default function GuestHeroCard() {
    const router = useRouter();

    return (
        <div className="relative w-full h-[320px] rounded-[32px] overflow-hidden shadow-xl mb-6 group">
            {/* Background Gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-purple-600 to-orange-500 animate-gradient-xy">
                {/* Abstract Pattern Overlay */}
                <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] mix-blend-overlay"></div>
            </div>

            {/* Content */}
            <div className="absolute inset-0 flex flex-col justify-end p-6 text-white z-10">
                <h2 className="text-3xl font-black mb-2 leading-tight drop-shadow-md">
                    בא לך לזוז?
                </h2>
                <p className="text-white/90 font-medium mb-6 text-sm max-w-[80%] leading-relaxed drop-shadow-sm">
                    צור מסלול מותאם אישית והתחל להרוויח מטבעות.
                </p>

                <button
                    onClick={() => router.push('/map')}
                    className="w-full bg-white text-black py-4 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg hover:shadow-xl hover:bg-gray-50"
                >
                    <Play size={20} fill="currentColor" />
                    <span>יאללה, צור לי מסלול</span>
                </button>
            </div>

            {/* Decorative Circle */}
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
        </div>
    );
}
