'use client';

import React from 'react';
import { CalendarDays, Dumbbell } from 'lucide-react';
import { COACH_ACTIONS, type CoachActionId } from '@/lib/ai/coach/action-chips';

const ICON: Record<CoachActionId, typeof CalendarDays> = {
  open_schedule: CalendarDays,
  build_today: Dumbbell,
};

/**
 * Action chips under a Kelly reply (ids from the server; label + target from
 * COACH_ACTIONS). A chip either navigates in-app (href) or sends a message to Kelly.
 */
export default function AiCoachActionChips({
  actions,
  onNavigate,
  onSend,
  disabled,
}: {
  actions: CoachActionId[];
  onNavigate: (href: string) => void;
  onSend: (message: string) => void;
  disabled?: boolean;
}) {
  if (actions.length === 0) return null;
  return (
    <div className="mt-1.5 flex max-w-[80%] flex-wrap justify-end gap-2">
      {actions.map((id) => {
        const spec = COACH_ACTIONS[id];
        const Icon = ICON[id];
        const sendsMessage = !spec.href && !!spec.message;
        return (
          <button
            key={id}
            type="button"
            disabled={disabled && sendsMessage}
            onClick={() => {
              if (spec.href) onNavigate(spec.href);
              else if (spec.message) onSend(spec.message);
            }}
            className="flex items-center gap-1.5 rounded-full border border-cyan-200 bg-white px-3.5 py-2 text-[13px] font-bold text-cyan-700 shadow-sm transition-transform active:scale-[0.97] disabled:opacity-40"
          >
            <Icon className="h-4 w-4" aria-hidden />
            {spec.label}
          </button>
        );
      })}
    </div>
  );
}
