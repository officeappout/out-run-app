"use client";

import React from 'react';

interface AlertModalProps {
  type: 'missed' | 'comeback';
  onClose: () => void;
  onAction: () => void;
}

export default function AlertModal({ type, onClose, onAction }: AlertModalProps) {
  const content = {
    missed: {
      title: 'אתמול היה אמור להיות אימון, אבל לא נורא -',
      subtitle: 'אפשר להשלים אותו גם היום!',
      button: 'אני רוצה להתאמן!',
    },
    comeback: {
      title: 'התגעגענו! לפעמים הפסקות הן חלק מהדרך',
      subtitle: 'ומה שחשוב זה לחזור. שנעשה אימון מהיר?',
      button: 'אני רוצה להתאמן!',
    },
  };

  const currentContent = content[type];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-[fadeIn_0.3s_ease-in]">
      <div className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-xl border border-[#00E5FF]/20 animate-[fadeInUp_0.3s_ease-out]">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 end-4 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 active:scale-95 transition-transform"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Content */}
        <div className="space-y-4 text-center">
          <p className="text-base text-gray-900 leading-relaxed">
            {currentContent.title}
          </p>
          <p className="text-base text-gray-700 leading-relaxed">
            {currentContent.subtitle}
          </p>

          {/* CTA Button */}
          <button
            onClick={onAction}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#00E5FF] to-[#00B8D4] text-white font-bold text-lg shadow-lg shadow-[#00E5FF]/30 active:scale-95 transition-transform mt-6"
          >
            {currentContent.button}
          </button>
        </div>
      </div>
    </div>
  );
}
