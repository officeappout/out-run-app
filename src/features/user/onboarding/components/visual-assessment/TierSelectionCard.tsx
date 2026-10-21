'use client';

import { motion } from 'framer-motion';
import { Dumbbell, Flame, Sprout } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';

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
    label: 'מתחילים', // i18n-allow-hebrew: legacy v1 (enable_home_v2 on)
    description: 'חדש באימונים או חוזר אחרי הפסקה ארוכה', // i18n-allow-hebrew: legacy v1 (enable_home_v2 on)
    emoji: '🌱',
    initialLevel: 3,
    borderColor: 'border-emerald-300',
    gradient: 'from-emerald-50 to-white',
    tagColor: 'bg-emerald-100 text-emerald-700',
  },
  {
    id: 'intermediate',
    label: 'בינוניים', // i18n-allow-hebrew: legacy v1 (enable_home_v2 on)
    description: 'מתאמן/ת באופן קבוע ומכיר/ה את הבסיס', // i18n-allow-hebrew: legacy v1 (enable_home_v2 on)
    emoji: '💪',
    initialLevel: 10,
    borderColor: 'border-sky-300',
    gradient: 'from-sky-50 to-white',
    tagColor: 'bg-sky-100 text-sky-700',
  },
  {
    id: 'advanced',
    label: 'מתקדמים', // i18n-allow-hebrew: legacy v1 (enable_home_v2 on)
    description: 'ניסיון רב, מחפש/ת אתגר אמיתי', // i18n-allow-hebrew: legacy v1 (enable_home_v2 on)
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
  /** enable_home_v2 — v2 cards (icons instead of emoji, gendered copy). */
  v2?: boolean;
  isFemale?: boolean;
}

// v2 copy — same three tiers, gendered instead of "מתאמן/ת". `experience` (owner
// 20.10.2026): a short training-experience hint so the user can place themselves
// without an extra question. The text lives in src/messages/he/onboarding.json
// (quiz.tier.<id>.label / description / experience, ICU `gender` select).
const TIER_V2_ICON: Record<Tier['id'], typeof Sprout> = {
  beginner: Sprout,
  intermediate: Dumbbell,
  advanced: Flame,
};

// ── Component ──────────────────────────────────────────────────────

export default function TierSelectionCard({
  onSelect,
  clampTierLevel = (l) => l,
  v2 = false,
  isFemale = false,
}: TierSelectionCardProps) {
  const t = useT(onboarding);
  if (v2) {
    // The quiz's gender comes from the onboarding answers (a prop), not the profile.
    const gender = isFemale ? 'female' : 'other';
    return (
      <div className="flex h-full min-h-0 flex-col bg-v2-surface text-v2-ink" dir="rtl">
        <div className="px-5 pb-1 pt-6">
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            <h1 className="text-[26px] font-black leading-[1.15] !tracking-[-0.02em]">{t('quiz.tier.title')}</h1>
            <p className="mt-1 text-[14px] font-medium text-v2-ink-2">
              {t('quiz.tier.subtitle', { gender })}
            </p>
          </motion.div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 overflow-y-auto px-5 py-4">
          {TIERS.map((tier, idx) => {
            const Icon = TIER_V2_ICON[tier.id];
            return (
              <motion.button
                key={tier.id}
                type="button"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + idx * 0.08, duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                onClick={() => onSelect(tier.id, clampTierLevel(tier.initialLevel))}
                className="flex w-full items-center gap-3 rounded-[22px] bg-white py-3.5 pl-3.5 pr-3.5 text-right shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-v2-tint" aria-hidden>
                  <Icon size={22} strokeWidth={2} className="text-v2-deep" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate whitespace-nowrap text-[17px] font-black !tracking-[-0.01em]">{t(`quiz.tier.${tier.id}.label`, { gender })}</span>
                  <span className="mt-0.5 block text-[12.5px] font-semibold leading-[1.35] text-v2-ink-2 line-clamp-2">
                    {t(`quiz.tier.${tier.id}.description`, { gender })}
                  </span>
                  <span className="mt-1 block text-[12px] font-bold leading-[1.35] text-v2-deep line-clamp-2">
                    {t(`quiz.tier.${tier.id}.experience`, { gender })}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-center rounded-2xl bg-v2-surface px-2.5 py-1.5 ring-1 ring-inset ring-v2-hairline">
                  <span className="whitespace-nowrap text-[11px] font-extrabold text-v2-muted">{t('quiz.tier.levelBadge')}</span>
                  <span className="text-[20px] font-black leading-none tabular-nums text-v2-deep">{tier.initialLevel}</span>
                </span>
              </motion.button>
            );
          })}
        </div>

        <div className="px-5 pb-3 text-center">
          <p className="text-[12.5px] font-bold leading-snug text-v2-muted">
            {t('quiz.tier.footer', { gender })}
          </p>
        </div>
      </div>
    );
  }

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
            {/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}מה הרמה שלך?
          </h1>
          <p className="text-base text-slate-500 leading-relaxed max-w-sm mx-auto">
            {/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}בחרו נקודת התחלה — נעדן את זה ביחד בשלב הבא
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
                  {/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}רמה
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
          {/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}✨ אל דאגה — תוכלו לכוונן כל קטגוריה בנפרד בשלב הבא
        </p>
      </div>
    </div>
  );
}
