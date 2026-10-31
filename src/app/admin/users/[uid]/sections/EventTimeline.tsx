'use client';

import React from 'react';
import { Activity, Clock } from 'lucide-react';
import type { AnalyticsEvent } from '@/features/analytics/AnalyticsService';
import type { UserTabData } from '../tabs/types';

const ONBOARDING_STEP_LABELS: Record<string, string> = {
  ACCESS_CODE: 'קוד גישה',
  PERSONA: 'בחירת פרסונה',
  PERSONAL_STATS: 'נתונים אישיים',
  LOCATION: 'מיקום ואזור',
  EQUIPMENT: 'ציוד זמין',
  SCHEDULE: 'לוח אימונים',
  HEALTH_DECLARATION: 'הצהרת בריאות',
  ACCOUNT_SECURE: 'אבטחת חשבון',
  COMPLETED: 'הסתיים',
};

/**
 * Visual identity for each AnalyticsEvent type rendered in the timeline.
 * Tailwind classes — `dot` paints the stepper bullet, `text` colors the
 * event title. Unknown event types fall back to the `default` slot.
 *
 * Event-instrumentation audit (06.10.2026, Journey Hub arc) — kept this
 * in sync with `AnalyticsEventType`'s real 12 live values after removing
 * 12 dead ones (AnalyticsService.ts's own comment has the full list).
 * Before this fix, 4 already-firing events (recommendation_shown,
 * workout_play_pressed, reminder_set, reminder_updated) had NO entry here
 * and silently fell back to "פעילות לא מזוהה" in this very timeline —
 * real, correctly-named data that was simply never displayed correctly.
 */
const EVENT_TIMELINE_STYLE: Record<
  string,
  { dot: string; text: string }
> = {
  onboarding_start: { dot: 'bg-blue-500', text: 'text-blue-700' },
  onboarding_step_complete: { dot: 'bg-green-500', text: 'text-green-700' },
  onboarding_step_completed: { dot: 'bg-green-500', text: 'text-green-700' },
  onboarding_completed: { dot: 'bg-emerald-600', text: 'text-emerald-700' },
  workout_session_started: { dot: 'bg-[#5BC2F2]', text: 'text-[#1e88c4]' },
  workout_complete: { dot: 'bg-green-600', text: 'text-green-700' },
  permission_location_status: { dot: 'bg-cyan-500', text: 'text-cyan-700' },
  error_occurred: { dot: 'bg-red-500', text: 'text-red-700' },
  recommendation_shown: { dot: 'bg-amber-300', text: 'text-amber-600' },
  workout_detail_viewed: { dot: 'bg-teal-300', text: 'text-teal-600' },
  workout_play_pressed: { dot: 'bg-sky-400', text: 'text-sky-600' },
  workout_start_pressed: { dot: 'bg-blue-400', text: 'text-blue-600' },
  reminder_set: { dot: 'bg-indigo-400', text: 'text-indigo-600' },
  reminder_updated: { dot: 'bg-indigo-300', text: 'text-indigo-500' },
  default: { dot: 'bg-gray-400', text: 'text-gray-600' },
};

// Helper function to get event label in Hebrew
// Phase B fix (04.10.2026): this used to fall through to the raw English
// eventName for anything not in the map — a real leak, not hypothetical.
// Fallback is a generic Hebrew label, never the raw key.
//
// Event-instrumentation audit fix (06.10.2026, Journey Hub arc): this
// map had drifted stale again — 4 real, already-firing events
// (recommendation_shown, workout_play_pressed, reminder_set,
// reminder_updated) had no entry and silently rendered as "פעילות לא
// מזוהה" despite being correctly captured in Firestore. Re-synced with
// AnalyticsEventType's current 12 live values (12 dead ones removed in
// the same change — see AnalyticsService.ts's own comment for the
// full list and the historical-data caveat for old docs with those
// retired eventName values).
//
// Journey Hub Phase 2 (07.10.2026) — 2 more added as they go live:
// workout_detail_viewed, workout_start_pressed. 14 real values total now.
const getEventLabel = (eventName: string): string => {
  const labels: Record<string, string> = {
    onboarding_start: 'תחילת תהליך הרשמה',
    onboarding_step_complete: 'שלב הרשמה הושלם',
    onboarding_step_completed: 'שלב הרשמה הושלם',
    onboarding_completed: 'תהליך הרשמה הושלם',
    workout_session_started: 'התחלת אימון',
    workout_complete: 'אימון הושלם',
    permission_location_status: 'הרשאת מיקום',
    error_occurred: 'שגיאה',
    recommendation_shown: 'הצעת אימון הוצגה',
    workout_detail_viewed: 'צפייה בפרטי אימון',
    workout_play_pressed: 'לחיצה להתחלת אימון',
    workout_start_pressed: 'לחיצה על "התחל אימון"',
    reminder_set: 'תזכורת נקבעה',
    reminder_updated: 'תזכורת עודכנה',
  };
  return labels[eventName] || 'פעילות לא מזוהה';
};

// Helper function to get event details
const getEventDetails = (event: AnalyticsEvent): string => {
  const details: string[] = [];

  if (event.eventName === 'onboarding_step_complete' && 'step_name' in event) {
    details.push(`שלב: ${event.step_name}`);
    if (event.time_spent) {
      details.push(`זמן: ${Math.floor(event.time_spent)} שניות`);
    }
  }

  if (event.eventName === 'workout_session_started' && 'level' in event) {
    if (event.level) details.push(`רמה: ${event.level}`);
    if (event.location) details.push(`מיקום: ${event.location}`);
  }

  if (event.eventName === 'workout_complete' && 'duration' in event) {
    if (event.duration) details.push(`משך: ${Math.floor(event.duration / 60)} דקות`);
    if (event.calories) details.push(`קלוריות: ${event.calories}`);
    if (event.earned_coins) details.push(`מטבעות: +${event.earned_coins}`);
  }

  if (event.eventName === 'error_occurred' && 'error_code' in event) {
    details.push(`קוד שגיאה: ${event.error_code}`);
    if (event.screen) details.push(`מסך: ${event.screen}`);
  }

  if (event.eventName === 'permission_location_status' && 'status' in event) {
    const statusLabel = event.status === 'granted' ? 'אושרה' : event.status === 'denied' ? 'נדחתה' : 'התבקשה';
    details.push(`סטטוס: ${statusLabel}`);
  }

  if (event.eventName === 'onboarding_completed') {
    if ('total_time_spent' in event && event.total_time_spent) {
      details.push(`זמן כולל: ${Math.floor(event.total_time_spent / 60)} דקות`);
    }
    if ('steps_completed' in event && event.steps_completed) {
      details.push(`שלבים: ${event.steps_completed}`);
    }
  }

  return details.join(' • ') || 'אין פרטים נוספים';
};

/** Analytics event log (newest first) with the event-name legend. */
export default function EventTimeline({ analyticsEvents }: Pick<UserTabData, 'analyticsEvents'>) {
  return (
    <div className="space-y-4">
      {/* Event-name legend — new 04.10.2026. Pulled via real
          getEventLabel() calls (not re-typed Hebrew text) so it
          can never drift from the actual mapping the timeline
          below uses. */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[11px] text-slate-500 font-simpler flex flex-wrap items-center gap-x-4 gap-y-1" dir="rtl">
        <span className="font-bold text-slate-600">מיפוי שמות אירועים:</span>
        <span>{getEventLabel('onboarding_start')} ⟵ onboarding_start</span>
        <span>{getEventLabel('onboarding_step_completed')} ⟵ onboarding_step_completed</span>
        <span>{getEventLabel('workout_session_started')} ⟵ workout_session_started</span>
      </div>

      {/* Vertical Stepper */}
      <div>
        <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
          <Clock size={20} className="text-[#5BC2F2]" />
          ציר זמן כרונולוגי (חדש → ישן)
        </h3>

        {analyticsEvents.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <Activity size={32} className="mx-auto text-gray-300 mb-2" />
            <div className="text-gray-500 text-sm font-simpler">
              אין אירועים מתועדים למשתמש זה
            </div>
          </div>
        ) : (
          <div className="relative">
            {/* Vertical line — RTL: line sits on the right edge */}
            <div className="absolute top-2 bottom-2 right-[11px] w-px bg-gray-200" />

            <div className="space-y-4 max-h-[600px] overflow-y-auto pe-2">
              {analyticsEvents.map((event) => {
                const style =
                  EVENT_TIMELINE_STYLE[event.eventName] ??
                  EVENT_TIMELINE_STYLE.default;

                // Humanize onboarding step events using the
                // module-level dictionary. Falls back to the
                // generic label helper for non-onboarding events.
                const isOnboardingStep =
                  event.eventName === 'onboarding_step_complete' ||
                  event.eventName === 'onboarding_step_completed';

                const rawStepName =
                  isOnboardingStep && 'step_name' in event
                    ? (event as { step_name?: string }).step_name
                    : undefined;

                const title = isOnboardingStep && rawStepName
                  ? `שלב Onboarding: ${
                      ONBOARDING_STEP_LABELS[rawStepName] ?? rawStepName
                    }`
                  : getEventLabel(event.eventName);

                // Optional payload chips: time_spent + step_index
                // for onboarding, plus the generic detail string
                // for non-onboarding events.
                const stepIndex =
                  isOnboardingStep && 'step_index' in event
                    ? (event as { step_index?: number }).step_index
                    : undefined;
                const timeSpent =
                  isOnboardingStep && 'time_spent' in event
                    ? (event as { time_spent?: number }).time_spent
                    : undefined;

                return (
                  <div
                    key={event.id}
                    className="relative pe-8"
                  >
                    {/* Stepper dot */}
                    <div
                      className={`absolute top-1.5 right-[5px] w-3.5 h-3.5 rounded-full ring-4 ring-white ${style.dot}`}
                    />

                    <div className="bg-white border border-gray-200 rounded-xl p-3 hover:shadow-sm transition-shadow">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className={`font-bold text-sm font-simpler ${style.text}`}>
                          {title}
                        </div>
                        <div className="text-[11px] text-gray-400 font-simpler whitespace-nowrap">
                          {/* Journey Hub Phase 2 (07.10.2026) — timeStyle 'medium'
                              adds seconds (HH:MM:SS) so same-minute events still
                              order correctly in this chronological timeline. */}
                          {new Date(event.timestamp).toLocaleString('he-IL', {
                            dateStyle: 'short',
                            timeStyle: 'medium',
                          })}
                        </div>
                      </div>

                      {/* Onboarding payload chips */}
                      {isOnboardingStep && (stepIndex !== undefined || timeSpent !== undefined) && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {stepIndex !== undefined && (
                            <span className="text-[10px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-bold border border-green-200">
                              שלב #{stepIndex + 1}
                            </span>
                          )}
                          {typeof timeSpent === 'number' && timeSpent > 0 && (
                            <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold border border-blue-200">
                              {Math.floor(timeSpent)} שניות
                            </span>
                          )}
                        </div>
                      )}

                      {/* Generic details for non-onboarding events */}
                      {!isOnboardingStep && (
                        <div className="text-xs text-gray-600 font-simpler mt-1">
                          {getEventDetails(event)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
