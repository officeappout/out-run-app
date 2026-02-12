'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, X, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface SecureAccountBannerProps {
  userName?: string;
  onDismiss?: () => void;
}

/**
 * Banner shown to users with unsecured accounts (accountStatus: 'unsecured')
 * Prompts them to secure their account to prevent data loss
 */
export default function SecureAccountBanner({ userName = 'OUTer', onDismiss }: SecureAccountBannerProps) {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  const handleSecureNow = () => {
    // Navigate back to account secure step
    router.push('/onboarding-new/setup?resume=ACCOUNT_SECURE');
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => {
      setIsDismissed(true);
      onDismiss?.();
    }, 300);
  };

  if (isDismissed) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="relative"
          dir="rtl"
        >
          {/* Banner Container */}
          <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-2xl p-4 shadow-lg backdrop-blur-sm">
            {/* Close Button */}
            <button
              onClick={handleDismiss}
              className="absolute top-3 left-3 text-gray-400 hover:text-white transition-colors z-10"
              aria-label="סגור"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Content */}
            <div className="flex items-start gap-3 pr-2">
              {/* Icon */}
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-yellow-500/20 rounded-full flex items-center justify-center">
                  <Shield className="w-6 h-6 text-yellow-500" />
                </div>
              </div>

              {/* Text & CTA */}
              <div className="flex-1 space-y-2">
                <h3 className="text-white font-bold text-base leading-tight">
                  {userName}, אבטח את החשבון שלך
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  הצהרת הבריאות והיסטוריית האימונים שלך עלולים ללכת לאיבוד. גבה אותם עכשיו עם Google או אימייל.
                </p>

                {/* CTA Button */}
                <button
                  onClick={handleSecureNow}
                  className="flex items-center gap-2 bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold py-2.5 px-4 rounded-xl hover:shadow-lg active:scale-95 transition-all mt-3"
                >
                  <span>אבטח עכשיו</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
