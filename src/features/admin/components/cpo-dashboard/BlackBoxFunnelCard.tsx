'use client';

/**
 * Journey Hub Phase 3, item D (07.10.2026) — the "black box" between
 * finished-onboarding and first-workout: opened → browsed → viewed
 * workout → pressed Play → completed. Consumes #176's new events
 * (`workout_detail_viewed`, `workout_start_pressed`) for the middle two
 * stages — but those events only started firing when #176 merged, so
 * there is no real sample yet. Per David's explicit instruction ("no
 * fake numbers... honestly stubbed until they accumulate"), every stage
 * here renders the literal string "מתמלא" rather than a real or
 * computed count — this ships the real STRUCTURE now (labels, sequence,
 * the push-target callout), the same "placeholder now, wire real data in
 * a later task" pattern this hub's own Activation tab originally used
 * (see journey/page.tsx's file-header comment, Wave 1 vs. Wave 2/3).
 *
 * Wiring real counts later needs: a query against `analytics_events`
 * for `workout_detail_viewed`/`workout_start_pressed` (grouped by
 * workout_id/surface as needed), gated behind a minimum-sample-size
 * threshold — same discipline already established for D7/cohort
 * retention (`retention-depth/route.ts`). Not built here; this phase is
 * structure-only, per the explicit "build once accumulated" scope.
 */

import { Eye, MousePointerClick, CheckCircle2, Smartphone, LayoutGrid, ArrowLeft } from 'lucide-react';
import InfoHint from './InfoHint';

interface BlackBoxStage {
  key: string;
  labelHe: string;
  icon: React.ElementType;
  hintHe: string;
}

const STAGES: BlackBoxStage[] = [
  {
    key: 'opened',
    labelHe: 'האפליקציה נפתחה',
    icon: Smartphone,
    hintHe: 'משתמש שסיים אונבורדינג ופתח את האפליקציה — אין היום אירוע ייעודי למדידת זה (session_start/screen_view עדיין לא קיימים).',
  },
  {
    key: 'browsed',
    labelHe: 'דפדוף במסך הבית',
    icon: LayoutGrid,
    hintHe: 'המשתמש צפה בהצעות אימון במסך הבית — אין היום מדד מצטבר מוצג כאן (recommendation_shown קיים כאירוע, אך לא מחובר לכרטיס הזה).',
  },
  {
    key: 'viewed',
    labelHe: 'צפייה בפרטי אימון',
    icon: Eye,
    hintHe: 'workout_detail_viewed (#176) — נפתחה כרטיסיית פרטי האימון. אירוע חדש, מצטבר מעכשיו.',
  },
  {
    key: 'pressed_play',
    labelHe: 'לחיצה על "התחל אימון"',
    icon: MousePointerClick,
    hintHe: 'workout_start_pressed (#176) — נלחץ כפתור ההתחלה בפועל. אירוע חדש, מצטבר מעכשיו.',
  },
  {
    key: 'completed',
    labelHe: 'אימון הושלם',
    icon: CheckCircle2,
    hintHe: 'workout_session_started/isRealWorkoutCompletion — זהה למדד "הפעלה" הקיים במשפך הראשי.',
  },
];

export default function BlackBoxFunnelCard() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 md:p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-black text-slate-900 flex items-center gap-1">
          הקופסה השחורה: מסיום אונבורדינג לאימון ראשון
          <InfoHint text="כל השלבים כאן ממתינים לנתונים אמיתיים — workout_detail_viewed ו-workout_start_pressed (#176) התחילו להצטבר רק מעכשיו. יוצגו מספרים אמיתיים לאחר שיצטבר מדגם מספק, באותו עיקרון שכבר נהוג בשימור D7/קוהורט." />
        </h3>
      </div>
      <p className="text-sm text-slate-500 mb-5">
        מה קורה בין סיום האונבורדינג לאימון הראשון בפועל — שלב-שלב
      </p>

      <div className="flex items-stretch gap-1 overflow-x-auto pb-1" dir="rtl">
        {STAGES.map((stage, idx) => (
          <div key={stage.key} className="flex items-stretch gap-1 shrink-0">
            <div className="shrink-0 min-w-[150px] rounded-2xl p-4 border-2 border-slate-200 bg-slate-50">
              <div className="flex items-center gap-1.5 mb-2">
                <stage.icon size={16} className="text-slate-400" />
                <span className="text-xs font-bold text-slate-600">{stage.labelHe}</span>
                <InfoHint text={stage.hintHe} />
              </div>
              <div className="text-lg font-black text-slate-400">מתמלא</div>
            </div>
            {idx < STAGES.length - 1 && (
              <div className="flex items-center text-slate-300 shrink-0">
                <ArrowLeft size={18} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* "Viewed but didn't press Play" — the explicit push-target segment David asked for. */}
      <div className="mt-5 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <MousePointerClick size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-amber-800 flex items-center gap-1">
            פלח למיקוד פוש: צפו בפרטי אימון אך לא לחצו "התחל"
            <InfoHint text="הפרש בין workout_detail_viewed ל-workout_start_pressed — משתמשים שראו אימון ספציפי ונטשו לפני ההתחלה. מועמדים טבעיים לתזכורת/פוש ממוקד." />
          </p>
          <p className="text-xs text-amber-700 mt-1">מתמלא — יחושב כפער בין שני האירועים לאחר שיצטבר מדגם.</p>
        </div>
      </div>
    </div>
  );
}
