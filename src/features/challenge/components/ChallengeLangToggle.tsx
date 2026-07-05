'use client';

import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  /** Light variant for use over dark backgrounds (e.g. hero, timer screen) */
  variant?: 'dark' | 'light';
}

export default function ChallengeLangToggle({ variant = 'light' }: Props) {
  const { language, setLanguage } = useLanguage();

  const track =
    variant === 'dark'
      ? 'rgba(255,255,255,0.15)'
      : 'rgba(0,0,0,0.07)';
  const activeStyle =
    variant === 'dark'
      ? { background: 'rgba(255,255,255,0.95)', color: '#0e7490' }
      : { background: '#fff', color: '#0e7490', boxShadow: '0 1px 4px rgba(0,0,0,0.12)' };
  const inactiveColor = variant === 'dark' ? 'rgba(255,255,255,0.65)' : '#94a3b8';

  return (
    <div
      className="inline-flex rounded-full p-0.5 gap-0.5"
      style={{ background: track }}
    >
      {(['he', 'en'] as const).map((lang) => (
        <button
          key={lang}
          onClick={() => setLanguage(lang)}
          className="px-2.5 py-1 rounded-full text-[11px] font-bold leading-none transition-all"
          style={language === lang ? activeStyle : { color: inactiveColor }}
          aria-pressed={language === lang}
        >
          {lang === 'he' ? 'עב' : 'EN'}
        </button>
      ))}
    </div>
  );
}
