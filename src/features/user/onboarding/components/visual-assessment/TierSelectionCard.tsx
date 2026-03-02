'use client';

import { motion } from 'framer-motion';

// ── Tier definitions ───────────────────────────────────────────────

interface Tier {
  id: 'beginner' | 'intermediate' | 'advanced';
  label: string;
  description: string;
  emoji: string;
  initialLevel: number;
  borderColor: string;
  gradient: string;
  tagColor: string;
}

const TIERS: Tier[] = [
  {
    id: 'beginner',
    label: 'מתחילים',
    description: 'חדש באימונים או חוזר אחרי הפסקה ארוכה',
    emoji: '🌱',
    initialLevel: 3,
    borderColor: 'border-emerald-300',
    gradient: 'from-emerald-50 to-white',
    tagColor: 'bg-emerald-100 text-emerald-700',
  },
  {
    id: 'intermediate',
    label: 'בינוניים',
    description: 'מתאמן/ת באופן קבוע ומכיר/ה את הבסיס',
    emoji: '💪',
    initialLevel: 10,
    borderColor: 'border-sky-300',
    gradient: 'from-sky-50 to-white',
    tagColor: 'bg-sky-100 text-sky-700',
  },
  {
    id: 'advanced',
    label: 'מתקדמים',
    description: 'ניסיון רב, מחפש/ת אתגר אמיתי',
    emoji: '🔥',
    initialLevel: 18,
    borderColor: 'border-amber-300',
    gradient: 'from-amber-50 to-white',
    tagColor: 'bg-amber-100 text-amber-700',
  },
];

// ── Props ──────────────────────────────────────────────────────────

interface TierSelectionCardProps {
  onSelect: (tierId: string, initialLevel: number) => void;
  /** Clamp tier level to path-specific range (e.g. Path 1: 1-10, Path 2: 10-20) */
  clampTierLevel?: (level: number) => number;
}

// ── Component ──────────────────────────────────────────────────────

export default function TierSelectionCard({
  onSelect,
  clampTierLevel = (l) => l,
}: TierSelectionCardProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="text-center px-6 pt-8 pb-2">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="text-3xl font-black text-slate-900 mb-2">
            מה הרמה שלך?
          </h1>
          <p className="text-base text-slate-500 leading-relaxed max-w-sm mx-auto">
            בחרו נקודת התחלה — נעדן את זה ביחד בשלב הבא
          </p>
        </motion.div>
      </div>

      {/* Tier cards */}
      <div className="flex-1 flex flex-col justify-center px-6 gap-4 py-6">
        {TIERS.map((tier, idx) => (
          <motion.button
            key={tier.id}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + idx * 0.1, duration: 0.4, ease: 'easeOut' }}
            onClick={() => onSelect(tier.id, clampTierLevel(tier.initialLevel))}
            className={`
              w-full p-5 rounded-2xl border-2 ${tier.borderColor}
              bg-gradient-to-br ${tier.gradient}
              text-right transition-all active:scale-[0.97]
              hover:shadow-lg hover:shadow-slate-200/60
              group
            `}
          >
            <div className="flex items-center gap-4">
              {/* Emoji */}
              <span className="text-4xl group-hover:scale-110 transition-transform duration-200">
                {tier.emoji}
              </span>

              {/* Label + description */}
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-black text-slate-900">{tier.label}</h3>
                <p className="text-sm text-slate-500 mt-0.5 leading-snug">
                  {tier.description}
                </p>
              </div>

              {/* Level badge */}
              <div className="text-center shrink-0">
                <span className={`text-[10px] font-bold ${tier.tagColor} px-2 py-0.5 rounded-full`}>
                  רמה
                </span>
                <span className="block text-2xl font-black text-slate-700 mt-0.5">
                  {tier.initialLevel}
                </span>
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      {/* Reassurance footer */}
      <div className="px-6 pb-8 text-center">
        <p className="text-xs text-slate-400 leading-relaxed">
          ✨ אל דאגה — תוכלו לכוונן כל קטגוריה בנפרד בשלב הבא
        </p>
      </div>
    </div>
  );
}
