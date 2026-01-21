import React, { useState } from 'react';

interface HealthDeclarationStepProps {
    title: string;
    description?: string;
    onContinue: (value: boolean) => void;
}

export default function HealthDeclarationStep({
    title,
    description,
    onContinue,
}: HealthDeclarationStepProps) {
    const [isStrictChecked, setIsStrictChecked] = useState(false);

    return (
        <div className="w-full space-y-8 px-4">
            <div className="text-center space-y-4">
                <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
                <p className="text-gray-600 leading-relaxed">
                    {description || "חשוב לנו לשמור על הבריאות שלך. אנא אשר/י את ההצהרה הבאה כדי להמשיך."}
                </p>
            </div>

            <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                <label className="flex items-start gap-4 cursor-pointer group">
                    <div className="relative flex items-center mt-1">
                        <input
                            type="checkbox"
                            className="peer sr-only"
                            checked={isStrictChecked}
                            onChange={(e) => setIsStrictChecked(e.target.checked)}
                        />
                        <div className="w-6 h-6 border-2 border-blue-300 rounded-md peer-checked:bg-blue-500 peer-checked:border-blue-500 transition-all"></div>
                        <div className="absolute inset-0 flex items-center justify-center text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity">
                            <svg width="14" height="10" viewBox="0 0 14 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 5L4.5 8.5L13 1" />
                            </svg>
                        </div>
                    </div>
                    <div className="flex-1 space-y-1">
                        <p className="font-bold text-gray-900 leading-snug">
                            אני מצהיר שמצבי הבריאותי תקין ומאפשר לי להתאמן.
                        </p>
                        <p className="text-xs text-gray-500">
                            קראתי ואני מסכים
                            <span className="text-blue-600 underline cursor-pointer mx-1">לתנאי השימוש</span>
                            <span>וביניות הפרטיות.</span>
                        </p>
                    </div>
                </label>
            </div>

            <button
                onClick={() => onContinue(true)}
                disabled={!isStrictChecked}
                className={`w-full font-bold py-4 rounded-2xl shadow-lg mt-6 transition-all ${isStrictChecked
                        ? 'bg-[#4FB4F7] text-white shadow-blue-200 hover:bg-blue-500 hover:shadow-xl active:scale-95'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
            >
                המשך
            </button>
        </div>
    );
}
