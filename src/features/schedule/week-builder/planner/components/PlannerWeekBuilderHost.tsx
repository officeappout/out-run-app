'use client';

/**
 * The planner's phase-2 week builder pieces in one mount (enable_week_builder_v1): the missed
 * card for the current week and the "סידור השבוע" sheet. The planner renders this only with
 * the flag on and opens a week through `request` (from the agenda's week label).
 */
import { useState } from 'react';
import ErrorBoundary from '@/components/ErrorBoundary';
import { addDaysToKey } from '../../../advisor';
import { localDateKey } from '../../../advisor/adapters/client';
import { usePlannerWeek } from '../usePlannerWeek';
import MissedWeekCard from './MissedWeekCard';
import PlannerWeekSheet, { type PlannerWeekMode } from './PlannerWeekSheet';

export interface PlannerWeekBuilderHostProps {
  userId: string;
  /** A week opened from the agenda ("סידור השבוע"); null = none. */
  request: string | null;
  onRequestDone: () => void;
  refreshKey: number;
  onSaved: () => void;
}

const currentSundayKey = (): string => {
  const now = new Date();
  return addDaysToKey(localDateKey(now), -now.getDay());
};

export default function PlannerWeekBuilderHost(p: PlannerWeekBuilderHostProps) {
  const [currentSunday] = useState(currentSundayKey);
  const current = usePlannerWeek(p.userId, currentSunday, p.refreshKey);
  const [replanOpen, setReplanOpen] = useState(false);
  const sunday = replanOpen ? currentSunday : p.request;
  const close = () => {
    setReplanOpen(false);
    p.onRequestDone();
  };
  return (
    <ErrorBoundary fallback={null}>
      {current.status === 'ready' && <MissedWeekCard count={current.model.missedCount} onReplan={() => setReplanOpen(true)} />}
      <PlannerWeekSheet userId={p.userId} sunday={sunday} mode={(replanOpen ? 'replan' : 'arrange') as PlannerWeekMode} onClose={close} onSaved={p.onSaved} />
    </ErrorBoundary>
  );
}
