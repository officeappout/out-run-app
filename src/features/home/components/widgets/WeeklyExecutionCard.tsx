'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface WeeklyExecutionCardProps {
  runDone: number;
  runTotal: number;
  strengthDone: number;
  strengthTotal: number;
}

function SegmentedBar({
  done,
  total,
  color,
}: {
  done: number;
  total: number;
  color: string;
}) {
  const segments = Math.max(1, total);
  return (
    <div className="flex gap-1">
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          className="flex-1 h-[5px] rounded-full overflow-hidden"
          style={{ backgroundColor: '#F1F5F9' }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: color }}
            initial={{ width: 0 }}
            animate={{ width: i < done ? '100%' : '0%' }}
            transition={{ duration: 0.6, delay: i * 0.1, ease: 'easeOut' }}
          />
        </div>
      ))}
    </div>
  );
}

export default function WeeklyExecutionCard({
  runDone,
  runTotal,
  strengthDone,
  strengthTotal,
}: WeeklyExecutionCardProps) {
  return (
    <div
      className="bg-white dark:bg-[#1E2A28] rounded-2xl p-4"
      style={{ border: '0.5px solid #E0E9FF', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
      dir="rtl"
    >
      <p className="text-xs font-bold text-slate-400 mb-3">ביצוע שבועי</p>

      <div className="space-y-3">
        {/* Running row */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
                <g clipPath="url(#runExec)">
                  <path d="M13.5411 4.81964C13.2994 4.38452 12.7507 4.22773 12.3155 4.46947L10.8856 5.26389L9.94303 3.82233C9.91514 3.82331 9.88731 3.82446 9.8592 3.82446C8.90979 3.82446 8.09211 3.25156 7.73243 2.43354C6.62716 2.43346 4.76196 2.43335 4.76196 2.43335C4.43346 2.43335 4.13098 2.6121 3.9725 2.89983L2.83089 4.97276C2.59079 5.40879 2.74957 5.95689 3.18557 6.197C3.32344 6.27293 3.47252 6.30897 3.61954 6.30897C3.93741 6.30897 4.24563 6.14045 4.4098 5.84232L5.29451 4.23588H6.99666L4.39786 8.77229H1.24698C0.749242 8.77229 0.345703 9.1758 0.345703 9.67356C0.345703 10.1713 0.749215 10.5748 1.24698 10.5748H4.91216C5.23091 10.5748 5.52595 10.4065 5.6881 10.1321L6.33552 9.03646L7.97002 10.3243L6.99004 12.7623C6.80441 13.2241 7.0283 13.749 7.49013 13.9346C7.60036 13.9789 7.71408 13.9999 7.826 13.9999C8.18313 13.9999 8.52118 13.7862 8.66252 13.4345L9.89425 10.3702C10.0435 9.99893 9.9301 9.57373 9.61581 9.32611L7.80349 7.89822L9.05652 5.76032L9.83584 6.95223C10.0079 7.21539 10.2957 7.36039 10.5909 7.36039C10.7393 7.36039 10.8896 7.32367 11.0279 7.24686L13.1909 6.04516C13.626 5.80347 13.7828 5.25476 13.5411 4.81964Z" fill="#00BAF7"/>
                  <path d="M9.85906 3.00426C10.6887 3.00426 11.3612 2.33173 11.3612 1.50213C11.3612 0.672526 10.6887 0 9.85906 0C9.02946 0 8.35693 0.672526 8.35693 1.50213C8.35693 2.33173 9.02946 3.00426 9.85906 3.00426Z" fill="#00BAF7"/>
                </g>
                <defs><clipPath id="runExec"><rect width="14" height="14" fill="white"/></clipPath></defs>
              </svg>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">ריצה</span>
            </div>
            <span className="text-sm font-black text-slate-900 dark:text-white tabular-nums">
              {runDone}/{runTotal}
            </span>
          </div>
          <SegmentedBar done={runDone} total={runTotal} color="#00BAF7" />
        </div>

        {/* Strength row */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <svg width="13" height="11" viewBox="0 0 13 11" fill="none" className="flex-shrink-0">
                <path d="M11.875 8.49641C11.6642 9.35355 10.5787 9.5625 9.88848 9.5625C8.3983 9.5625 2.71702 9.5625 2.71702 9.5625C1.30519 9.5625 0.227331 7.96126 0.766428 6.5655C1.95888 4.46229 3.02976 2.83719 3.64838 0.894899C5.07769 0.0616627 6.91005 0.894898 6.4791 2.2858M4.64655 2.83719C3.87448 3.99641 4.30703 5.28212 3.64838 6.5655C5.60422 5.28159 7.52284 5.02481 9.60907 6.5655" stroke="#0AC2B6" strokeWidth="1.125" strokeLinejoin="round"/>
              </svg>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">כוח</span>
            </div>
            <span className="text-sm font-black text-slate-900 dark:text-white tabular-nums">
              {strengthDone}/{strengthTotal}
            </span>
          </div>
          <SegmentedBar done={strengthDone} total={strengthTotal} color="#0AC2B6" />
        </div>
      </div>
    </div>
  );
}
