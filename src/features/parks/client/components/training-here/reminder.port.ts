/**
 * reminder.port — TODO interface only (enable_where_to_train_v1). NOT wired, nothing calls it.
 *
 * The "later" choice of the "I'm training here" sheet should remind the user REMINDER_LEAD_MIN before
 * the start (reminderTimeFor in training-here.logic.ts). No client-side one-off notification path
 * exists today (reminder-schedule.service only stores weekly slots; @capacitor/local-notifications is
 * not installed), so until the owner picks one — a scheduled function reading planned_sessions by
 * startTime, or local notifications — the sheet's CTA is a plain "שמור" and promises no reminder.
 * When one exists: implement this, call it from TrainingHereSheet after a successful "later" publish,
 * and bring back the "נזכיר לך ב-HH:MM" CTA copy.
 */
export interface TrainingHereReminderScheduler {
  /** Schedule a one-off reminder for the planned_sessions doc `sessionId` at `at`. */
  schedule(args: { sessionId: string; at: Date; placeName: string; workoutTitle?: string | null }): Promise<void>;
  /** Cancel it (the user cancelled the arrival). */
  cancel(sessionId: string): Promise<void>;
}
