'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Loader2 } from 'lucide-react';
import { useUserStore } from '@/features/user';

const DIST_LABEL: Record<string, string> = {
  '2k': '2 ק״מ', '3k': '3 ק״מ', '5k': '5 ק״מ',
  '10k': '10 ק״מ', maintenance: 'תחזוקה',
};
const DIST_KM: Record<string, number> = {
  '2k': 2, '3k': 3, '5k': 5, '10k': 10, maintenance: 5,
};
const PREDICTIONS = [
  { label: '5 ק״מ', km: 5 },
  { label: '10 ק״מ', km: 10 },
  { label: '21 ק״מ', km: 21.0975 },
];

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function riegelPredict(basePaceSecKm: number, refKm: number, targetKm: number): number {
  const refTime = basePaceSecKm * refKm;
  return refTime * Math.pow(targetKm / refKm, 1.06);
}

function formatPace(sec: number) {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}

function stripWeeksSuffix(name: string): string {
  return name.replace(/\s*[-–—]\s*\d+\s*(שבועות|weeks?)/i, '').trim();
}

function ProgressRing({
  percentage,
  size,
  strokeWidth,
}: {
  percentage: number;
  size: number;
  strokeWidth: number;
}) {
  const center = size / 2;
  const radius = (size - strokeWidth) / 2 - 1;
  const circumference = 2 * Math.PI * radius;
  const filled = (percentage / 100) * circumference;

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={center} cy={center} r={radius}
          fill="none" stroke="#E2E8F0" strokeWidth={strokeWidth}
          className="dark:stroke-slate-700"
        />
        <motion.circle
          cx={center} cy={center} r={radius}
          fill="none" stroke="#00BAF7" strokeWidth={strokeWidth}
          strokeLinecap="round" strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - filled }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-black text-gray-800 dark:text-white leading-none tabular-nums">
          {percentage}<span className="text-[11px] font-bold">%</span>
        </span>
      </div>
    </div>
  );
}

const RunnerIcon = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
    <g clipPath="url(#runCircle)">
      <path d="M13.5411 4.81964C13.2994 4.38452 12.7507 4.22773 12.3155 4.46947L10.8856 5.26389L9.94303 3.82233C9.91514 3.82331 9.88731 3.82446 9.8592 3.82446C8.90979 3.82446 8.09211 3.25156 7.73243 2.43354C6.62716 2.43346 4.76196 2.43335 4.76196 2.43335C4.43346 2.43335 4.13098 2.6121 3.9725 2.89983L2.83089 4.97276C2.59079 5.40879 2.74957 5.95689 3.18557 6.197C3.32344 6.27293 3.47252 6.30897 3.61954 6.30897C3.93741 6.30897 4.24563 6.14045 4.4098 5.84232L5.29451 4.23588H6.99666L4.39786 8.77229H1.24698C0.749242 8.77229 0.345703 9.1758 0.345703 9.67356C0.345703 10.1713 0.749215 10.5748 1.24698 10.5748H4.91216C5.23091 10.5748 5.52595 10.4065 5.6881 10.1321L6.33552 9.03646L7.97002 10.3243L6.99004 12.7623C6.80441 13.2241 7.0283 13.749 7.49013 13.9346C7.60036 13.9789 7.71408 13.9999 7.826 13.9999C8.18313 13.9999 8.52118 13.7862 8.66252 13.4345L9.89425 10.3702C10.0435 9.99893 9.9301 9.57373 9.61581 9.32611L7.80349 7.89822L9.05652 5.76032L9.83584 6.95223C10.0079 7.21539 10.2957 7.36039 10.5909 7.36039C10.7393 7.36039 10.8896 7.32367 11.0279 7.24686L13.1909 6.04516C13.626 5.80347 13.7828 5.25476 13.5411 4.81964Z" fill="#00BAF7"/>
      <path d="M9.85906 3.00426C10.6887 3.00426 11.3612 2.33173 11.3612 1.50213C11.3612 0.672526 10.6887 0 9.85906 0C9.02946 0 8.35693 0.672526 8.35693 1.50213C8.35693 2.33173 9.02946 3.00426 9.85906 3.00426Z" fill="#00BAF7"/>
    </g>
    <defs><clipPath id="runCircle"><rect width="14" height="14" fill="white"/></clipPath></defs>
  </svg>
);

const TargetIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
    <circle cx="12" cy="12" r="10" stroke="#00BAF7" strokeWidth="2"/>
    <circle cx="12" cy="12" r="6" stroke="#00BAF7" strokeWidth="2"/>
    <circle cx="12" cy="12" r="2" fill="#00BAF7"/>
  </svg>
);

export default function RunProgressCircle() {
  const { profile } = useUserStore();
  const running = profile?.running;

  const hasActiveProgram = !!(running?.activeProgram?.schedule as any[])?.length;
  const currentWeek = running?.activeProgram?.currentWeek ?? 0;
  const totalWeeks = running?.generatedProgramTemplate?.canonicalWeeks ?? 8;
  const schedule = running?.activeProgram?.schedule as Array<{ status?: string }> | undefined;
  const percentage = useMemo(() => {
    if (!hasActiveProgram) return 0;
    if (schedule && schedule.length > 0) {
      const completed = schedule.filter((e) => e.status === 'completed').length;
      return Math.round((completed / schedule.length) * 100);
    }
    return Math.round(((currentWeek - 1) / totalWeeks) * 100);
  }, [hasActiveProgram, schedule, currentWeek, totalWeeks]);
  const rawName = running?.generatedProgramTemplate?.name
    ?? `תוכנית ${DIST_LABEL[running?.generatedProgramTemplate?.targetDistance ?? '5k'] ?? '5 ק״מ'}`;
  const planName = stripWeeksSuffix(rawName);
  const basePace = running?.paceProfile?.basePace ?? 0;
  const refKm = DIST_KM[running?.generatedProgramTemplate?.targetDistance ?? '5k'] ?? 5;

  const [expanded, setExpanded] = useState(false);

  const predictions = useMemo(() => {
    if (!basePace || basePace <= 0) return [];
    return PREDICTIONS.map(({ label, km }) => ({
      label,
      time: formatTime(riegelPredict(basePace, refKm, km)),
    }));
  }, [basePace, refKm]);

  // No active program → show placeholder card
  if (!hasActiveProgram) {
    const hasTemplate = !!running?.generatedProgramTemplate;
    return (
      <div
        className="bg-white dark:bg-slate-800"
        dir="rtl"
        style={{
          borderRadius: 16,
          border: '0.5px solid #E0E9FF',
          boxShadow: '0 2px 8px 0 rgba(0,0,0,0.04)',
        }}
      >
        <div className="flex items-center gap-2.5 px-3 py-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {hasTemplate
                ? <Loader2 size={13} className="text-[#00BAF7] animate-spin flex-shrink-0" />
                : <RunnerIcon />}
              <h3 className="text-[14px] font-bold text-gray-900 dark:text-white truncate leading-tight flex-1 min-w-0">
                {hasTemplate ? planName : 'ממתין לתוכנית'}
              </h3>
            </div>
            <p className="text-[12px] text-slate-400 mt-0.5">
              {hasTemplate ? 'לוח אימונים בהכנה' : 'השלם/י הרשמה'}
            </p>
          </div>
          <ProgressRing percentage={0} size={66} strokeWidth={5.5} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', zIndex: expanded ? 20 : undefined }}>
      {/* ── Collapsed card — always in grid flow, never shifts ── */}
      <div
        className="bg-white dark:bg-slate-800 cursor-pointer active:scale-[0.98] transition-transform"
        dir="rtl"
        style={{
          borderRadius: 16,
          border: '0.5px solid #E0E9FF',
          boxShadow: '0 2px 8px 0 rgba(0,0,0,0.04)',
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2.5 px-3 py-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <RunnerIcon />
              <h3 className="text-[14px] font-bold text-gray-900 dark:text-white truncate leading-tight flex-1 min-w-0">
                {planName}
              </h3>
              <motion.div
                animate={{ rotate: expanded ? 180 : 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="flex-shrink-0"
              >
                <ChevronDown size={14} className="text-slate-400" />
              </motion.div>
            </div>

            <p className="text-[13px] text-slate-900 dark:text-slate-200 mt-0.5 tabular-nums">
              שבוע{' '}
              <span className="font-bold">{currentWeek}</span>
              /{totalWeeks}
            </p>

            {basePace > 0 && (
              <p className="text-[12px] mt-0.5">
                <span className="text-slate-400">קצב </span>
                <span className="font-bold tabular-nums" style={{ color: '#00BAF7' }}>
                  {formatPace(basePace)}
                </span>
                <span className="text-slate-400"> דק׳/ק״מ</span>
              </p>
            )}
          </div>

          <ProgressRing percentage={percentage} size={66} strokeWidth={5.5} />
        </div>
      </div>

      {/* ── Expanded overlay — absolute, floats over neighbor ── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{
              height: { type: 'spring', stiffness: 300, damping: 28, mass: 0.8 },
              opacity: { duration: 0.15 },
            }}
            className="absolute overflow-hidden bg-white dark:bg-slate-800"
            dir="rtl"
            style={{
              top: 0,
              right: 0,
              width: 'calc(200% + 12px)',
              borderRadius: 16,
              border: '0.5px solid #E0E9FF',
              boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.08)',
            }}
            onClick={() => setExpanded(false)}
          >
            {/* Header — mirrors collapsed layout exactly */}
            <div className="flex items-center gap-2.5 px-3 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <RunnerIcon />
                  <h3 className="text-[14px] font-bold text-gray-900 dark:text-white truncate leading-tight flex-1 min-w-0">
                    {planName}
                  </h3>
                  <motion.div
                    animate={{ rotate: 180 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    className="flex-shrink-0"
                  >
                    <ChevronDown size={14} className="text-slate-400" />
                  </motion.div>
                </div>

                <p className="text-[13px] text-slate-900 dark:text-slate-200 mt-0.5 tabular-nums">
                  שבוע{' '}
                  <span className="font-bold">{currentWeek}</span>
                  /{totalWeeks}
                </p>

                {basePace > 0 && (
                  <p className="text-[12px] mt-0.5">
                    <span className="text-slate-400">קצב </span>
                    <span className="font-bold tabular-nums" style={{ color: '#00BAF7' }}>
                      {formatPace(basePace)}
                    </span>
                    <span className="text-slate-400"> דק׳/ק״מ</span>
                  </p>
                )}
              </div>

              <ProgressRing percentage={percentage} size={66} strokeWidth={5.5} />
            </div>

            {/* Divider */}
            <div className="h-px bg-gray-100 dark:bg-slate-700 mx-3" />

            {/* Expanded content */}
            <div className="px-4 pt-3 pb-3 space-y-3">
              {basePace > 0 && (
                <p className="text-[15px] font-extrabold text-gray-900 dark:text-white">
                  קצב בסיס{' '}
                  <span className="tabular-nums" style={{ color: '#00BAF7' }}>
                    {formatPace(basePace)}
                  </span>
                  <span className="text-gray-400 font-bold text-[13px] mr-1">(דק׳/ק״מ)</span>
                </p>
              )}

              {predictions.length > 0 && (
                <div className="space-y-2">
                  {predictions.map((p) => (
                    <div key={p.label} className="flex items-center gap-2.5">
                      <TargetIcon />
                      <p className="text-[14px] font-bold text-gray-700 dark:text-gray-200">
                        צפי מרוץ {p.label} ב-
                        <span className="tabular-nums font-extrabold text-gray-900 dark:text-white">
                          {p.time}
                        </span>
                        {' '}דק׳
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-center pt-0.5">
                <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                  <ChevronDown size={14} className="text-slate-400 rotate-180" />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
