'use client';

/**
 * ArriveAtStartCard: "you reached the start" (enable_combo_flow_v1, board PlayerArrive). Within the
 * arrival radius of the route's start the live session does not switch silently: one card asks how
 * to go on (keep walking / switch to running), and the SAME session continues on the route, so the
 * walk so far counts in the same workout.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { ActivityGlyph } from '@/features/parks/core/components/hybrid/activity-icons';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import { useUiDir } from '@/lib/i18n/useUiDir';
import { estimateSteps } from '@/lib/steps-estimate';

interface Props {
  routeName: string;
  routeKm: number | null;
  walkedKm: number;
  onContinue: (activity: 'walking' | 'running') => void;
}

export default function ArriveAtStartCard({ routeName, routeKm, walkedKm, onContinue }: Props) {
  const { direction } = useUiDir();
  const t = useT(player);
  const steps = estimateSteps(walkedKm);
  return (
    <motion.div
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="pointer-events-auto absolute inset-x-3 z-20 flex flex-col gap-3 rounded-[22px] bg-white p-4 shadow-v2-card"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 30px)' }}
      dir={direction}
      role="dialog"
      aria-label={t('run.arrive.title')}
    >
      <div className="flex flex-col">
        <span className="text-[18px] font-black text-v2-ink">{t('run.arrive.title')}</span>
        <span className="truncate text-[13px] font-bold text-v2-muted">
          {routeKm ? t('run.arrive.route', { name: routeName, km: routeKm.toFixed(1) }) : routeName}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onContinue('walking')} className="flex flex-col items-center gap-1 rounded-[16px] bg-v2-ink p-3 text-white active:scale-[0.98] transition-transform">
          <ActivityGlyph kind="aerobic" subtype="walking" className="h-5 w-5" />
          <span className="text-[14.5px] font-black">{t('run.arrive.keepWalking')}</span>
        </button>
        <button type="button" onClick={() => onContinue('running')} className="flex flex-col items-center gap-1 rounded-[16px] bg-white p-3 text-v2-ink shadow-v2-ring active:scale-[0.98] transition-transform">
          <ActivityGlyph kind="aerobic" subtype="running" className="h-5 w-5" />
          <span className="text-[14.5px] font-black">{t('run.arrive.switchToRun')}</span>
        </button>
      </div>
      {walkedKm > 0.05 && (
        <span className="text-center text-[12px] font-bold text-v2-muted">
          {t('run.arrive.counts', { km: walkedKm.toFixed(1), steps })}
        </span>
      )}
    </motion.div>
  );
}
