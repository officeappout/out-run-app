'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Users, Globe, Settings2 } from 'lucide-react';
import { usePrivacyStore, type PrivacyMode } from '../store/usePrivacyStore';

const MODES: Array<{
  value: PrivacyMode;
  label: string;
  sublabel: string;
  icon: React.FC<{ className?: string }>;
  color: string;
}> = [
  {
    value: 'ghost',
    label: 'רוח',
    sublabel: 'לא נראה לאף אחד',
    icon: EyeOff,
    color: 'text-gray-500',
  },
  {
    value: 'squad',
    label: 'חברים',
    sublabel: 'רק מי שאני עוקב אחריו',
    icon: Users,
    color: 'text-cyan-500',
  },
  {
    value: 'verified_global',
    label: 'גלובלי',
    sublabel: 'כל המאומתים בקבוצת הגיל שלי',
    icon: Globe,
    color: 'text-green-500',
  },
];

const MODE_ICON: Record<PrivacyMode, React.FC<{ className?: string }>> = {
  ghost: EyeOff,
  squad: Users,
  verified_global: Globe,
};

const MODE_RING: Record<PrivacyMode, string> = {
  ghost: 'ring-gray-400',
  squad: 'ring-cyan-400',
  verified_global: 'ring-green-400',
};

export default function PrivacyModeSwitcher() {
  const { mode, setMode } = usePrivacyStore();
  const [open, setOpen] = useState(false);

  const ActiveIcon = MODE_ICON[mode];

  return (
    <div className="relative" dir="rtl">
      {/* FAB trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-11 h-11 rounded-full bg-white shadow-lg flex items-center justify-center ring-2 ${MODE_RING[mode]} active:scale-90 transition-transform`}
        aria-label="הגדרות פרטיות"
      >
        {open ? (
          <Settings2 className="w-5 h-5 text-gray-700 animate-spin" style={{ animationDuration: '2s' }} />
        ) : (
          <ActiveIcon className={`w-5 h-5 ${MODES.find((m) => m.value === mode)?.color}`} />
        )}
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-14 left-0 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden w-[200px] z-50"
          >
            <div className="px-3 py-2 border-b border-gray-50">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                מצב נראות
              </p>
            </div>

            {MODES.map((m) => {
              const Icon = m.icon;
              const isActive = mode === m.value;
              return (
                <button
                  key={m.value}
                  onClick={() => {
                    setMode(m.value);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-right transition-colors ${
                    isActive
                      ? 'bg-cyan-50'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      isActive ? 'bg-cyan-100' : 'bg-gray-100'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? m.color : 'text-gray-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs font-bold ${
                        isActive ? 'text-gray-900' : 'text-gray-700'
                      }`}
                    >
                      {m.label}
                    </p>
                    <p className="text-[10px] text-gray-400 truncate">{m.sublabel}</p>
                  </div>
                  {isActive && (
                    <div className="w-2 h-2 rounded-full bg-cyan-500 flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
