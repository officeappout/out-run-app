'use client';

/**
 * RunOverviewHomeSheet — the run overview opened from the home week card
 * (board M-6a, enable_home_v2): the same overview drawer as on the map,
 * over a dimmed home, opened full. "התחל אימון" goes to the map and starts
 * from where you are (today's path); "הצע לי מסלול" goes to the map and
 * opens the route suggestions there. The edits (level, swapped main set,
 * paces — run-edits.ts) travel in the link.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { SHEET_Z } from '@/components/ui/v2';
import { useSuppressBottomNav } from '@/features/parks/core/hooks/useSuppressBottomNav';
import type RunWorkout from '../../types/run-workout.type';
import type { RunWeekContext } from '../../utils/run-preview/run-week';
import { NO_RUN_EDITS, type RunEdits } from '../../utils/run-overview/run-edits';
import RunWorkoutOverview from './RunWorkoutOverview';

export interface RunOverviewHomeSheetProps {
  isOpen: boolean;
  onClose: () => void;
  workout: RunWorkout | null;
  isLoading?: boolean;
  templateCategory?: string | null;
  week?: RunWeekContext | null;
  onGo: (edits: RunEdits) => void;
  onSuggestRoute: (edits: RunEdits) => void;
}

export default function RunOverviewHomeSheet({
  isOpen, onClose, workout, isLoading, templateCategory, week, onGo, onSuggestRoute,
}: RunOverviewHomeSheetProps) {
  const [edits, setEdits] = useState<RunEdits>(NO_RUN_EDITS);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => { if (!isOpen) setEdits(NO_RUN_EDITS); }, [isOpen]);
  useSuppressBottomNav(isOpen);

  if (!isOpen || !mounted || typeof document === 'undefined') return null;
  const ready = !!workout && !isLoading;

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: SHEET_Z.overlay }} dir="rtl">
      <button type="button" aria-label="סגירה" onClick={onClose} className="absolute inset-0 bg-[rgba(14,20,25,0.32)]" />
      {ready ? (
        <RunWorkoutOverview
          workout={workout!}
          templateCategory={templateCategory}
          week={week}
          edits={edits}
          onEditsChange={setEdits}
          ctaMode="free"
          initialDetent="full"
          onBack={onClose}
          onStart={() => onGo(edits)}
          onSuggest={() => onSuggestRoute(edits)}
        />
      ) : (
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-center gap-3 rounded-t-[28px] bg-v2-surface py-24 shadow-v2-sheet">
          <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-v2-accent border-t-transparent" aria-hidden />
          <span className="text-[14px] font-bold text-v2-muted">טוען אימון...</span>
        </div>
      )}
    </div>,
    document.body,
  );
}
