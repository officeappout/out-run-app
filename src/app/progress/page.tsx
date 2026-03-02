'use client';

export const dynamic = 'force-dynamic';

/**
 * Progress Page — Activity Log
 *
 * Shows the last 90 days of training history grouped by month.
 * Segmented picker filters by workout type (All / Strength / Running).
 * (+) button in header opens AddWorkoutModal.
 */

import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart2, Plus } from 'lucide-react';
import { useUserStore } from '@/features/user';
import AgendaDayCard from '@/features/home/components/agenda/AgendaDayCard';
import AddWorkoutModal from '@/features/home/components/AddWorkoutModal';
import { toISODate } from '@/features/user/scheduling/utils/dateUtils';

// ── Config ─────────────────────────────────────────────────────────────────

const HISTORY_DAYS = 90;

const HEBREW_MONTH_NAMES = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

type FilterSegment = 'all' | 'strength' | 'running';

const SEGMENTS: Array<{ value: FilterSegment; label: string }> = [
  { value: 'all',      label: 'הכל' },
  { value: 'strength', label: 'כוח' },
  { value: 'running',  label: 'ריצה' },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

function getMonthLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return `${HEBREW_MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function getMonthKey(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * Determines the day-of-week index (0=Sun..6=Sat) for a given ISO date.
 * This lets the segment filter check whether a day was a "strength" or "running"
 * day based on the user's recurring template or schedule metadata.
 *
 * For now, we use a heuristic: Sun/Tue/Thu → strength, Mon/Wed → running.
 * This will be replaced with real schedule data in a future phase.
 */
function getDayType(iso: string): 'strength' | 'running' | 'rest' {
  const dow = new Date(iso + 'T00:00:00').getDay();
  if ([0, 2, 4].includes(dow)) return 'strength';
  if ([1, 3].includes(dow)) return 'running';
  return 'rest';
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ProgressPage() {
  const { profile, _hasHydrated } = useUserStore();
  const [activeSegment, setActiveSegment] = useState<FilterSegment>('all');
  const [showAddModal, setShowAddModal] = useState(false);

  const todayISO = useMemo(() => toISODate(new Date()), []);

  const allDates = useMemo(() => {
    const dates: string[] = [];
    for (let i = 1; i <= HISTORY_DAYS; i++) {
      dates.push(addDays(todayISO, -i));
    }
    return dates;
  }, [todayISO]);

  const filteredGrouped = useMemo(() => {
    const filtered = activeSegment === 'all'
      ? allDates
      : allDates.filter((iso) => getDayType(iso) === activeSegment);

    const groups: Array<{ monthKey: string; label: string; dates: string[] }> = [];
    for (const iso of filtered) {
      const key = getMonthKey(iso);
      const last = groups[groups.length - 1];
      if (last && last.monthKey === key) {
        last.dates.push(iso);
      } else {
        groups.push({ monthKey: key, label: getMonthLabel(iso), dates: [iso] });
      }
    }
    return groups;
  }, [allDates, activeSegment]);

  if (!_hasHydrated) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#F8FAFC]">
        <p className="text-slate-400 animate-pulse text-sm">טוען...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#F8FAFC]">
        <p className="text-slate-400 text-sm">לא נמצא פרופיל</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-[100dvh] bg-[#F8FAFC]"
      style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-md mx-auto px-5 py-3 flex items-center justify-between" dir="rtl">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#00C9F2]/10 flex items-center justify-center">
              <BarChart2 className="w-4 h-4 text-[#00C9F2]" />
            </div>
            <h1 className="text-lg font-black text-gray-900">יומן פעילות</h1>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-[#00C9F2] text-white shadow-lg shadow-cyan-500/30 active:scale-90 transition-all"
            aria-label="הוסף אימון"
          >
            <Plus className="w-5 h-5" strokeWidth={2.5} />
          </button>
        </div>

        {/* ── Segmented Picker ── */}
        <div className="max-w-md mx-auto px-5 pb-3">
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {SEGMENTS.map((seg) => (
              <button
                key={seg.value}
                onClick={() => setActiveSegment(seg.value)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeSegment === seg.value
                    ? 'bg-white text-[#00C9F2] shadow-sm'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {seg.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Month-grouped list ── */}
      <div className="max-w-md mx-auto px-4 pt-4 space-y-6">
        {filteredGrouped.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-sm text-gray-400">אין אימונים בקטגוריה זו</p>
          </div>
        )}

        {filteredGrouped.map((group, groupIdx) => (
          <motion.section
            key={group.monthKey + activeSegment}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: groupIdx * 0.04 }}
          >
            <div className="flex items-center gap-3 mb-3" dir="rtl">
              <span className="text-sm font-black text-gray-700">{group.label}</span>
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-xs text-gray-400">{group.dates.length} ימים</span>
            </div>

            <div className="space-y-2.5">
              {group.dates.map((iso) => (
                <AgendaDayCard
                  key={iso}
                  date={iso}
                  isSelected={false}
                  onSelect={() => {}}
                  userId={profile.id}
                  recurringTemplate={profile.lifestyle?.recurringTemplate}
                />
              ))}
            </div>
          </motion.section>
        ))}

        <div className="h-4" />
      </div>

      {/* ── Add Workout Modal ── */}
      <AddWorkoutModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        userId={profile.id}
      />
    </div>
  );
}
