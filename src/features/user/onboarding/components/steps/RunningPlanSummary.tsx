'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Calendar, RotateCw, Timer, MapPin, Footprints } from 'lucide-react';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import StickyActionButton from '@/components/ui/StickyActionButton';

interface RunningPlanSummaryProps {
  onGenerate: () => void;
}

const DIST_LABELS: Record<string, { he: string; km: number }> = {
  '2k':  { he: '2 ק״מ',  km: 2 },
  '3k':  { he: '3 ק״מ',  km: 3 },
  '5k':  { he: '5 ק״מ',  km: 5 },
  '10k': { he: '10 ק״מ', km: 10 },
  'maintenance': { he: 'שמירה על כושר', km: 5 },
};

const DAYS_HEBREW = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

function getRunningAnswers(): Record<string, any> {
  if (typeof window === 'undefined') return {};
  try {
    const stored = sessionStorage.getItem('onboarding_running_answers');
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function formatPace(totalSeconds: number, distKm: number): string {
  if (!totalSeconds || !distKm) return '--:--';
  const pacePerKm = totalSeconds / distKm;
  const m = Math.floor(pacePerKm / 60);
  const s = Math.round(pacePerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('he-IL', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTotalTime(totalSeconds: number): string {
  if (!totalSeconds) return '--:--';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function RunningPlanSummary({ onGenerate }: RunningPlanSummaryProps) {
  const { data } = useOnboardingStore();

  const summary = useMemo(() => {
    const answers = getRunningAnswers();
    const targetDistance = answers.targetDistance ?? '5k';
    const distMeta = DIST_LABELS[targetDistance] ?? DIST_LABELS['5k'];
    const paceInputSeconds = answers.paceInputSeconds ?? 0;
    const weeks = answers.runningPlanWeeks ?? 8;
    const pace = formatPace(paceInputSeconds, distMeta.km);
    const totalTime = formatTotalTime(paceInputSeconds);

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + weeks * 7);

    const scheduleDays: string[] = (data as any).runningScheduleDays ?? [];
    const daysDisplay = scheduleDays.length > 0
      ? scheduleDays.map(d => `יום ${d}'`).join(', ')
      : 'לא נבחרו';

    return {
      targetDistance,
      distLabel: distMeta.he,
      distKm: distMeta.km,
      weeks,
      pace,
      totalTime,
      paceInputSeconds,
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      daysDisplay,
      frequency: (data as any).runningWeeklyFrequency ?? scheduleDays.length,
    };
  }, [data]);

  return (
    <div className="w-full max-w-md mx-auto flex flex-col min-h-screen relative font-simpler bg-[#12201e]">

      {/* Hero Section */}
      <div className="relative w-full h-[300px] overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(135deg, #0f2b26 0%, #163832 40%, #1a4a3e 70%, #12201e 100%)',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#12201e] via-[#12201e]/60 to-transparent" />

        {/* Distance Badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="absolute bottom-16 right-4 flex items-center gap-2 rounded-full px-3 py-1.5 shadow-lg"
          style={{ background: '#00BAF7' }}
        >
          <Footprints size={16} className="text-white" />
          <span className="text-sm font-bold text-white">{summary.distLabel}</span>
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="absolute bottom-4 right-4"
        >
          <h1 className="text-white text-3xl font-black tracking-tight" dir="rtl">
            תוכנית ל-{summary.distLabel}
          </h1>
        </motion.div>
      </div>

      {/* Quick Stats */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="px-4 py-2 space-y-1"
        dir="rtl"
      >
        <div className="flex items-center gap-4 py-3 border-b border-white/5">
          <div
            className="flex items-center justify-center rounded-lg shrink-0 w-10 h-10"
            style={{ background: 'rgba(0,186,247,0.1)' }}
          >
            <RotateCw size={20} style={{ color: '#00BAF7' }} />
          </div>
          <p className="text-slate-100 text-base font-semibold">
            {summary.weeks} שבועות · {summary.distKm} ק״מ
          </p>
        </div>

        <div className="flex items-center gap-4 py-3 border-b border-white/5">
          <div
            className="flex items-center justify-center rounded-lg shrink-0 w-10 h-10"
            style={{ background: 'rgba(0,186,247,0.1)' }}
          >
            <Timer size={20} style={{ color: '#00BAF7' }} />
          </div>
          <p className="text-slate-100 text-base font-semibold">
            קצב: {summary.pace} דק׳/ק״מ
          </p>
        </div>

        <div className="flex items-center gap-4 py-3 border-b border-white/5">
          <div
            className="flex items-center justify-center rounded-lg shrink-0 w-10 h-10"
            style={{ background: 'rgba(0,186,247,0.1)' }}
          >
            <Calendar size={20} style={{ color: '#00BAF7' }} />
          </div>
          <p className="text-slate-100 text-base font-semibold">
            {summary.endDate}
          </p>
        </div>
      </motion.div>

      {/* Detailed Info */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="px-4 pt-6 pb-28"
        dir="rtl"
      >
        <h3 className="text-slate-400 text-sm font-medium mb-4">
          התוכנית שלך מותאמת על בסיס הפרטים הבאים
        </h3>

        <ul className="space-y-4">
          {summary.paceInputSeconds > 0 && (
            <li className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-white mt-2 shrink-0" />
              <p className="text-slate-200 text-sm leading-relaxed">
                הזמן המשוער שלך ל-{summary.distLabel} הוא{' '}
                <span className="font-bold text-white">{summary.totalTime}</span>
              </p>
            </li>
          )}

          <li className="flex items-start gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-white mt-2 shrink-0" />
            <p className="text-slate-200 text-sm leading-relaxed">
              ימי אימון:{' '}
              <span className="font-bold text-white">{summary.daysDisplay}</span>
            </p>
          </li>

          <li className="flex items-start gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-white mt-2 shrink-0" />
            <p className="text-slate-200 text-sm leading-relaxed">
              {summary.frequency} אימונים בשבוע למשך{' '}
              <span className="font-bold text-white">{summary.weeks} שבועות</span>
            </p>
          </li>

          <li className="flex items-start gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-white mt-2 shrink-0" />
            <p className="text-slate-200 text-sm leading-relaxed">
              התוכנית מתחילה ב-<span className="font-bold text-white">{summary.startDate}</span>
            </p>
          </li>

          <li className="flex items-start gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-white mt-2 shrink-0" />
            <p className="text-slate-200 text-sm leading-relaxed">
              התוכנית מסתיימת ב-<span className="font-bold text-white">{summary.endDate}</span>
            </p>
          </li>
        </ul>
      </motion.div>

      {/* Generate Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#12201e] via-[#12201e] to-transparent max-w-md mx-auto">
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={onGenerate}
          className="w-full py-4 rounded-xl text-lg font-bold transition-colors shadow-xl"
          style={{ background: '#00BAF7', color: '#fff' }}
        >
          צרו לי את התוכנית!
        </motion.button>
      </div>
    </div>
  );
}
