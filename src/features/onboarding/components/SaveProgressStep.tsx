import React, { useState, useEffect } from 'react';

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

    useEffect(() => {
        import('@/lib/firebase').then(({ auth }) => {
            if (auth.currentUser && !auth.currentUser.isAnonymous) {
                setIsUserAuth(true);
            }
        });
    }, []);

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
