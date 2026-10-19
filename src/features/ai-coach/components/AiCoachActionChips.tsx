'use client';

import React from 'react';
import { CalendarDays, Dumbbell, Gauge } from 'lucide-react';
import { COACH_ACTIONS, isCheckLevelActionId, type CoachActionId, type CoachAssessTarget, type WorkoutRating } from '@/lib/ai/coach/action-chips';

function iconFor(id: CoachActionId): typeof CalendarDays {
  if (id === 'open_schedule') return CalendarDays;
  if (isCheckLevelActionId(id)) return Gauge;
  return Dumbbell;
}

/**
 * Action chips under a Kelly reply (ids from the server; label + target from
 * COACH_ACTIONS). A chip navigates in-app (href), sends a message to Kelly, or starts the
 * mini level check for one program (assess → startMiniDomainAssessment, via onAssess).
 * Kelly phase 3: a rating chip ("קל" / "בדיוק" / "קשה") answers "איך היה?" via onRate; without
 * onRate those chips are not shown.
 */
export default function AiCoachActionChips({
  actions,
  onNavigate,
  onSend,
  onAssess,
  onRate,
  disabled,
}: {
  actions: CoachActionId[];
  onNavigate: (href: string) => void;
  onSend: (message: string) => void;
  onAssess: (target: CoachAssessTarget) => void;
  onRate?: (rating: WorkoutRating) => void;
  disabled?: boolean;
}) {
  const shown = actions.filter((id) => !!COACH_ACTIONS[id] && (!COACH_ACTIONS[id].rating || !!onRate));
  if (shown.length === 0) return null;
  return (
    <div className="mt-1.5 flex max-w-[80%] flex-wrap justify-end gap-2">
      {shown.map((id) => {
        const spec = COACH_ACTIONS[id];
        const Icon = iconFor(id);
        const sendsMessage = !spec.href && !spec.assess && !!spec.message;
        return (
          <button
            key={id}
            type="button"
            disabled={disabled && sendsMessage}
            onClick={() => {
              if (spec.href) onNavigate(spec.href);
              else if (spec.assess) onAssess(spec.assess);
              else if (spec.rating) onRate?.(spec.rating);
              else if (spec.message) onSend(spec.message);
            }}
            className="flex min-h-[40px] items-center gap-1.5 rounded-full border border-cyan-200 bg-white px-3.5 py-2 text-[13px] font-bold text-cyan-700 shadow-sm transition-transform active:scale-[0.97] disabled:opacity-40"
          >
            {!spec.rating && <Icon className="h-4 w-4" aria-hidden />}
            {spec.label}
          </button>
        );
      })}
    </div>
  );
}
