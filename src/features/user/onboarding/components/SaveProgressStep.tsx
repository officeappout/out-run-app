import React, { useState, useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useOnboardingV2 } from '../hooks/useOnboardingV2';

interface SaveProgressStepProps {
    title: string;
    subtitle?: string;
    onSave: () => void;
}

export default function SaveProgressStep({
    title,
    subtitle,
    onSave,
}: SaveProgressStepProps) {
    const [isUserAuth, setIsUserAuth] = useState(false);
    const v2 = useOnboardingV2();

    useEffect(() => {
        import('@/lib/firebase').then(({ auth }) => {
            if (auth.currentUser && !auth.currentUser.isAnonymous) {
                setIsUserAuth(true);
            }
        });
    }, []);

    // ── v2 (enable_home_v2): same copy + handler; emoji → lucide icon,
    // gendered CTA (gender from the same sessionStorage key the flow uses).
    if (v2) {
        const isFemale = typeof window !== 'undefined'
            && sessionStorage.getItem('onboarding_personal_gender') === 'female';
        return (
            <div className="w-full py-8 text-center text-v2-ink" dir="rtl">
                <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-full bg-v2-tint text-v2-deep" aria-hidden>
                    <ShieldCheck size={38} strokeWidth={2} />
                </div>
                <h1 className="text-[26px] font-black leading-[1.15] !tracking-[-0.02em]">{title}</h1>
                {subtitle && (
                    <p className="mt-3 px-2 text-[15px] font-medium leading-relaxed text-v2-ink-2">{subtitle}</p>
                )}
                <button
                    type="button"
                    onClick={onSave}
                    className="mt-8 flex h-[52px] w-full items-center justify-center whitespace-nowrap rounded-full bg-v2-cta text-[16px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97]"
                >
                    <span className="truncate">
                        {isUserAuth
                            ? (isFemale ? 'התחילי את המסע שלי' : 'התחל את המסע שלי')
                            : 'אני רוצה לשמור את הרמה שלי'}
                    </span>
                </button>
            </div>
        );
    }

    return (
        <div className="w-full text-center space-y-6 py-10">
            <div className="text-6xl mb-4">🛡️</div>
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            <p className="text-gray-600 leading-relaxed px-2">{subtitle}</p>
            <button
                onClick={onSave}
                className="w-full bg-[#4FB4F7] text-white font-bold py-4 rounded-2xl shadow-lg mt-6"
            >
                {isUserAuth ? "התחל את המסע שלי" : "אני רוצה לשמור את הרמה שלי"}
            </button>
        </div>
    );
}
