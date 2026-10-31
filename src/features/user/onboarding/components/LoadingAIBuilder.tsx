"use client";

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { getOnboardingLocale, type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';

interface LoadingAIBuilderProps {
  language?: OnboardingLanguage;
  onComplete: () => void;
}

// Get name from sessionStorage for personalization
const getName = (): string => {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('onboarding_personal_name') || '';
};

export default function LoadingAIBuilder({ language, onComplete }: LoadingAIBuilderProps) {
  // Get language from sessionStorage (consistent with onboarding flow) or use prop
  const detectedLanguage: OnboardingLanguage = language || (typeof window !== 'undefined' 
    ? (sessionStorage.getItem('onboarding_language') || 'he') as OnboardingLanguage
    : 'he');
  
  const locale = getOnboardingLocale(detectedLanguage);
  const userName = getName();
  const userNameFallback = detectedLanguage === 'he' ? 'חבר/ה' : detectedLanguage === 'ru' ? 'друг' : 'friend';
  const finalUserName = userName || userNameFallback;
  
  // Get messages from locale with safe .replace() calls
  const getMessage = (key: 'step1' | 'step2' | 'step3' | 'step4'): string => {
    const template = locale?.loading?.[key] || '';
    // Safety check: Only call .replace() if template exists and contains {name}
    return template && template.includes('{name}') 
      ? template.replace('{name}', finalUserName)
      : template || '';
  };
  
  const currentMessages = [
    getMessage('step1'),
    getMessage('step2'),
    getMessage('step3'),
    getMessage('step4'),
  ].filter(msg => msg); // Remove empty strings

  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [typedText, setTypedText] = useState('');
  const [isTypingComplete, setIsTypingComplete] = useState(false);

  // Typewriter effect
  useEffect(() => {
    if (currentMessageIndex >= currentMessages.length) {
      // All messages shown, wait a bit then complete
      setTimeout(() => {
        onComplete();
      }, 800);
      return;
    }

    const fullText = currentMessages[currentMessageIndex] || '';
    let currentIndex = 0;
    setTypedText('');
    setIsTypingComplete(false);

    const typingInterval = setInterval(() => {
      if (currentIndex < fullText.length) {
        setTypedText(fullText.slice(0, currentIndex + 1));
        currentIndex++;
      } else {
        setIsTypingComplete(true);
        clearInterval(typingInterval);
        // Wait before moving to next message
        setTimeout(() => {
          setCurrentMessageIndex((prev) => prev + 1);
        }, 1200);
      }
    }, 50); // Typing speed: 50ms per character

    return () => clearInterval(typingInterval);
  }, [currentMessageIndex, currentMessages, onComplete]);

  // Auto-complete after 5 seconds regardless
  useEffect(() => {
    const timeout = setTimeout(() => {
      onComplete();
    }, 5000);
    return () => clearTimeout(timeout);
  }, [onComplete]);

  // Determine direction based on language
  const direction = detectedLanguage === 'he' ? 'rtl' : 'ltr';

  // Generate floating dots and lines
  const dots = Array.from({ length: 12 }).map((_, i) => ({
    id: i,
    delay: i * 0.2,
    x: Math.random() * 100,
    y: Math.random() * 100,
  }));

  return (
    <div className="fixed inset-0 bg-[#FFFFFF] z-50 flex flex-col items-center justify-center font-simpler" dir={direction}>
      {/* Neural Core Animation */}
      <div className="relative w-80 h-80 mb-12 flex items-center justify-center">
        {/* Floating data lines and dots */}
        {dots.map((dot, idx) => (
          <motion.div
            key={dot.id}
            className="absolute"
            style={{
              left: `${dot.x}%`,
              top: `${dot.y}%`,
            }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, 0.6, 0],
              scale: [0, 1, 0],
              x: [
                0,
                (50 - dot.x) * 0.8,
                (50 - dot.x) * 1.2,
              ],
              y: [
                0,
                (50 - dot.y) * 0.8,
                (50 - dot.y) * 1.2,
              ],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              delay: dot.delay,
              ease: "easeInOut",
            }}
          >
            {/* Dot */}
            <div className="w-2 h-2 rounded-full bg-[#5BC2F2]" />
            {/* Connecting line */}
            <motion.div
              className="absolute top-1/2 left-1/2 w-20 h-0.5 bg-gradient-to-r from-[#5BC2F2] to-transparent origin-left"
              style={{
                transformOrigin: 'left center',
                transform: `rotate(${Math.atan2((50 - dot.y), (50 - dot.x)) * (180 / Math.PI)}deg)`,
              }}
              animate={{
                opacity: [0, 0.4, 0],
                scaleX: [0, 1, 0],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                delay: dot.delay,
                ease: "easeInOut",
              }}
            />
          </motion.div>
        ))}

        {/* Central glowing sphere */}
        <motion.div
          className="relative w-32 h-32 rounded-full bg-[#5BC2F2]"
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.8, 1, 0.8],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {/* Inner glow */}
          <motion.div
            className="absolute inset-0 rounded-full bg-[#5BC2F2] blur-xl"
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          {/* Outer glow ring */}
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-[#5BC2F2]"
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.5, 0.2, 0.5],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          {/* Data particles inside */}
          {Array.from({ length: 6 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-white"
              style={{
                left: '50%',
                top: '50%',
                transformOrigin: 'center',
              }}
              animate={{
                x: [
                  0,
                  Math.cos((i * 60) * (Math.PI / 180)) * 20,
                  Math.cos((i * 60) * (Math.PI / 180)) * 40,
                ],
                y: [
                  0,
                  Math.sin((i * 60) * (Math.PI / 180)) * 20,
                  Math.sin((i * 60) * (Math.PI / 180)) * 40,
                ],
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: i * 0.3,
                ease: "easeInOut",
              }}
            />
          ))}
        </motion.div>

        {/* Pulsing rings around sphere */}
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-full border border-[#5BC2F2]"
            animate={{
              scale: [1, 1.8 + i * 0.3, 1],
              opacity: [0.4, 0, 0.4],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              delay: i * 0.5,
              ease: "easeOut",
            }}
          />
        ))}
      </div>

      {/* Typewriter Message */}
      <div className={`px-8 ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>
        <motion.p
          key={currentMessageIndex}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`text-lg font-bold text-slate-700 min-h-[2rem] font-simpler ${direction === 'rtl' ? 'text-right' : 'text-left'}`}
        >
          {typedText}
          {!isTypingComplete && (
            <motion.span
              className={`inline-block w-0.5 h-5 bg-[#5BC2F2] align-middle ${direction === 'rtl' ? 'mr-1' : 'ml-1'}`}
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            />
          )}
        </motion.p>
      </div>
    </div>
  );
}
