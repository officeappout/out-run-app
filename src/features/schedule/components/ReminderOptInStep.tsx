'use client';

/**
 * ReminderOptInStep — "שנזכיר לך לפני כל אימון?" (enable_home_v2; boards
 * jr/J2-09, J1-10, J1-11; compact "כבר פעיל" variant J3-06 / J4-06).
 *
 * Shared by the run signup, the strength signup and the add-track flows.
 * Presentational: the caller owns the side effects (use
 * services/reminderOptIn.service — requestReminderPermission must be the
 * FIRST await inside onAccept so the web prompt stays on the tap).
 *
 *   <ReminderOptInStep subtitle="3 ריצות בשבוע · א׳ ג׳ ו׳" sampleWorkoutName="ריצה קלה"
 *     sampleTime="19:00" alreadyActive={false} onAccept={…} onSkip={…} />
 */

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Bell, CalendarDays, Check, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/v2';
import {
  DEFAULT_REMINDER_LEAD,
  REMINDER_LEAD_OPTIONS,
  reminderPreviewTitle,
  type ReminderLeadMinutes,
} from '../utils/reminderOptIn';
import { PUSH_SOFT_ASK_COPY } from '../utils/pushReAsk';

export interface ReminderOptInResult {
  leadMinutes: ReminderLeadMinutes;
  calendarSync: boolean;
}

export interface ReminderOptInStepProps {
  /** "3 ריצות בשבוע · א׳ ג׳ ו׳" */
  subtitle: string;
  /** The sample notification: next workout's name and time. */
  sampleWorkoutName: string;
  sampleTime: string;
  /** Second line of the sample notification (optional, e.g. a park). */
  sampleDetail?: string;
  /** Reminders already on → compact variant: a note, one "המשך", no "לא עכשיו". */
  alreadyActive: boolean;
  initialLeadMinutes?: ReminderLeadMinutes;
  initialCalendarSync?: boolean;
  /** "כן, תזכירו לי" / "המשך" (compact). */
  onAccept: (result: ReminderOptInResult) => void | Promise<void>;
  /** "לא עכשיו" (full variant only) — never prompts; callers record the deferral (recordReminderDeferral). */
  onSkip: (result: Pick<ReminderOptInResult, 'calendarSync'>) => void | Promise<void>;
}

const BENEFITS = ['תזכורת לפני כל אימון, בשעה שבחרת', 'שקט בימי מנוחה'] as const;

const chipCls = (on: boolean) =>
  `inline-flex h-[34px] items-center whitespace-nowrap rounded-full px-3 text-[13.5px] font-extrabold transition-transform duration-150 ease-v2 active:scale-[0.97] ${
    on ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40' : 'bg-white text-v2-ink-2 shadow-v2-ring'
  }`;

export default function ReminderOptInStep(p: ReminderOptInStepProps) {
  const reduce = useReducedMotion();
  const [lead, setLead] = useState<ReminderLeadMinutes>(p.initialLeadMinutes ?? DEFAULT_REMINDER_LEAD);
  const [calendarSync, setCalendarSync] = useState<boolean>(p.initialCalendarSync ?? false);
  const [busy, setBusy] = useState<'accept' | 'skip' | null>(null);

  const run = async (kind: 'accept' | 'skip') => {
    if (busy) return;
    setBusy(kind);
    try {
      if (kind === 'accept') await p.onAccept({ leadMinutes: lead, calendarSync });
      else await p.onSkip({ calendarSync });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div dir="rtl" className="relative mx-auto flex w-full max-w-md flex-1 flex-col bg-v2-surface font-simpler text-v2-ink">
      <div className="px-4 pb-2 pt-1">
        <h1 className="truncate whitespace-nowrap text-[24px] font-black leading-[1.2] !tracking-[-0.02em]">שנזכיר לך לפני כל אימון?</h1>
        <p className="mt-0.5 truncate whitespace-nowrap text-[13.5px] font-bold text-v2-muted">{p.subtitle}</p>
        {!p.alreadyActive && <p className="mt-1.5 text-[14.5px] font-bold leading-snug text-v2-ink-2">{PUSH_SOFT_ASK_COPY.body}</p>}

        {/* Sample notification over a soft brand glow */}
        <div
          className="relative mt-3.5 rounded-[28px] pb-5 pt-3.5"
          style={{ background: 'radial-gradient(circle at 50% 30%, rgba(0,186,247,0.18), rgba(12,242,227,0.06) 60%, transparent 70%)' }}
        >
          <div className="flex justify-center">
            <span className="grid h-[72px] w-[72px] place-items-center rounded-full bg-white text-v2-deep shadow-v2-card" aria-hidden>
              <Bell size={34} strokeWidth={2.2} />
            </span>
          </div>
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1], delay: 0.1 }}
            className="mx-auto mt-4 flex w-[min(300px,100%)] items-start gap-2.5 rounded-[18px] bg-white/95 px-3.5 py-3 shadow-v2-card"
            aria-label="דוגמה לתזכורת"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/logo/logo-mark.png" alt="" className="h-[34px] w-[34px] shrink-0 rounded-[9px] object-cover" draggable={false} />
            <div className="min-w-0 flex-1">
              <div className="flex justify-between text-[12px] font-bold text-v2-muted">
                <span>OUT</span>
                <span>עכשיו</span>
              </div>
              <p className="truncate whitespace-nowrap text-[14px] font-black">{reminderPreviewTitle(lead, p.sampleWorkoutName, p.sampleTime)}</p>
              {p.sampleDetail && <p className="truncate whitespace-nowrap text-[12.5px] font-semibold text-v2-ink-2">{p.sampleDetail}</p>}
            </div>
          </motion.div>
        </div>

        {/* What you get */}
        <ul className="mt-2">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-center gap-2.5 py-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-v2-tint text-v2-deep" aria-hidden>
                <Check size={13} strokeWidth={3} />
              </span>
              <span className="truncate whitespace-nowrap text-[14.5px] font-extrabold">{b}</span>
            </li>
          ))}
        </ul>

        {p.alreadyActive && (
          <div className="mt-2 flex items-center gap-2 rounded-[16px] bg-v2-tint px-3.5 py-2.5 text-[13px] font-extrabold text-v2-deep">
            <Bell size={16} strokeWidth={2.4} aria-hidden className="shrink-0" />
            <span className="min-w-0">התזכורות כבר פעילות — נוסיף אותן גם לאימונים החדשים</span>
          </div>
        )}

        {/* Lead time */}
        <div className="mt-3 flex items-center gap-2" role="group" aria-label="כמה זמן לפני האימון">
          <span className="whitespace-nowrap text-[13px] font-extrabold text-v2-muted">כמה לפני?</span>
          {REMINDER_LEAD_OPTIONS.map((o) => (
            <button key={o.minutes} type="button" aria-pressed={lead === o.minutes} onClick={() => setLead(o.minutes)} className={chipCls(lead === o.minutes)}>
              {o.label}
            </button>
          ))}
        </div>

        {/* Calendar sync — secondary */}
        <Card padding="none" className="mt-3.5 !shadow-v2-ring">
          <button
            type="button"
            role="switch"
            aria-checked={calendarSync}
            onClick={() => setCalendarSync((v) => !v)}
            className="flex w-full items-center gap-2.5 px-3.5 py-3 text-start"
          >
            <CalendarDays size={18} strokeWidth={2.2} className="shrink-0 text-v2-deep" aria-hidden />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate whitespace-nowrap text-[14.5px] font-extrabold">גם ביומן של הטלפון</span>
              <span className="truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted">לא חובה · אפשר להפעיל אחר כך</span>
            </span>
            <span
              aria-hidden
              className={`relative h-[26px] w-11 shrink-0 rounded-full transition-colors duration-150 ease-v2 ${calendarSync ? 'bg-v2-accent' : 'bg-v2-hairline'}`}
            >
              <span
                className="absolute top-[2px] h-[22px] w-[22px] rounded-full bg-white shadow transition-[right] duration-150 ease-v2"
                style={{ right: calendarSync ? 20 : 2 }}
              />
            </span>
          </button>
        </Card>
      </div>

      <div className="flex-grow" />

      {/* One gradient CTA (+ a plain "לא עכשיו" in the full variant) */}
      <div className="sticky bottom-0 z-30 px-4 pb-3 pt-3" style={{ background: 'linear-gradient(to top, #f6fbfd 75%, rgba(246,251,253,0))' }}>
        <button
          type="button"
          onClick={() => run('accept')}
          disabled={!!busy}
          className="flex h-[52px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-v2-cta text-[16.5px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97] disabled:opacity-80"
        >
          {busy === 'accept' && <Loader2 size={20} className="animate-spin" aria-hidden />}
          {p.alreadyActive ? 'המשך' : PUSH_SOFT_ASK_COPY.accept}
        </button>
        {!p.alreadyActive && (
          <button
            type="button"
            onClick={() => run('skip')}
            disabled={!!busy}
            className="mt-1 h-10 w-full whitespace-nowrap text-[15px] font-extrabold text-v2-muted transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            {PUSH_SOFT_ASK_COPY.defer}
          </button>
        )}
      </div>
    </div>
  );
}
