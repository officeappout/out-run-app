/**
 * Pure label helpers that used to read a module-scope Hebrew translator (`makeT('he', ns)`): with the default
 * locale their Hebrew output is pinned (recorded from unmodified main), so making them locale-aware cannot move it.
 */
import { describe, expect, it } from 'vitest';
import { blockTitle, clockCaption, formatInfo, itemTargetText, nextCaption, readyItemLine, resultLine } from '@/features/workout-engine/players/strength/timed/logic/timed-labels';
import { promptEyebrow } from '@/features/workout-engine/players/strength/timed/logic/timed-prompt';
import { runWeekSummary } from '@/features/workout-engine/players/running/utils/run-preview/run-week';
import { processFeedback } from '@/features/workout-engine/components/PostWorkoutSurvey';
import { topUpTitleHe } from '@/features/home/utils/strength-top-up';
import { nextHeaderHe } from '@/features/home/utils/next-recommendation';
import { mapTutorialDoneLabel } from '@/features/user/onboarding/services/map-tutorial-tour';
import { placeholderHints } from '@/lib/ai/coach/suggestions/placeholders';
import { describeCoachError, workoutCardLabel } from '@/lib/ai/coach/protocol';

/* eslint-disable @typescript-eslint/no-explicit-any */
const amrap: any = { format: 'amrap', config: { capSec: 600 }, items: [{ kind: 'exercise', name: 'a', targetReps: 12 }, { kind: 'exercise', name: 'b', targetHoldSec: 30 }] };
const emom: any = { format: 'emom', config: { intervalSec: 60, totalIntervals: 12 }, items: [{ kind: 'exercise', name: 'a', targetReps: 10 }, { kind: 'exercise', name: 'b', targetReps: 8 }] };
const tabata: any = { format: 'tabata', config: { workSec: 20, restSec: 10, rounds: 8 }, items: [{ kind: 'exercise', name: 'a', isUnilateral: true }] };

describe('module-scope locale: Hebrew output stays pinned', () => {
  it('timed labels', () => {
    const out = [
      blockTitle(amrap), blockTitle(emom), blockTitle(tabata),
      itemTargetText(amrap.items[0]), itemTargetText(amrap.items[1]),
      clockCaption({ status: 'running' } as any), clockCaption({ status: 'done' } as any, 'x'),
      nextCaption({ format: 'emom', round: 3 } as any),
      formatInfo(amrap), formatInfo(emom), formatInfo(tabata),
      resultLine({ amrap: { score: { fullRounds: 4, extraReps: 16 } } } as any), resultLine({ emom: { done: 11, total: 12 } } as any),
      readyItemLine(amrap, 0), readyItemLine(emom, 1), readyItemLine(tabata, 0),
      promptEyebrow({ kind: 'emom_partial', minuteIndex: 2, item: { name: 'squat' } } as any),
      promptEyebrow({ kind: 'amrap_partial', round: 5, item: { name: 'squat' } } as any),
    ];
    expect(out).toMatchInlineSnapshot(`
      [
        "AMRAP 10′",
        "EMOM 12′",
        "טבטה 20/10",
        "12 חזרות",
        "30 שנ׳",
        "נותרו",
        "הזמן נגמר",
        "דקה 4",
        {
          "lines": [
            "AMRAP = כמה שיותר סבבים בזמן הקצוב. כאן: 10 דקות.",
            "סבב = 2 התרגילים לפי הסדר. מסיימים אחד ועוברים מיד לבא.",
            "סופרים סבבים מלאים, ובסוף מוסיפים את החזרות של הסבב שלא נגמר.",
            "אין מנוחה קבועה: נחים כשצריך, השעון ממשיך.",
          ],
          "title": "מה זה AMRAP?",
        },
        {
          "lines": [
            "EMOM = כל דקה מתחילים משימה חדשה. כאן: 12 פעמים.",
            "מסיימים את המשימה ולוחצים סיימתי — מה שנשאר מהזמן הוא המנוחה.",
            "לא הספקת עד הסוף? רושמים כמה עשית, והמשימה הבאה מתחילה בזמן.",
          ],
          "title": "מה זה EMOM?",
        },
        {
          "lines": [
            "20 שניות עבודה, 10 שניות מנוחה — 8 אינטרוולים.",
            "הטיימר מוביל: עוברים לבד בין עבודה למנוחה, אין צורך ללחוץ.",
            "עובדים בעצימות גבוהה לאורך כל האינטרוול.",
          ],
          "title": "מה זה טבטה?",
        },
        "4 סבבים מלאים · ועוד 16 חזרות",
        "11/12 דקות בזמן",
        "12 חזרות · בכל סבב",
        "דקות זוגיות · 8 חזרות",
        "20 שנ׳ לכל צד",
        "דקה 3 · squat",
        "הזמן נגמר · squat בסבב 5",
      ]
    `);
  });

  it('run week, survey, home defaults', () => {
    const out = [
      runWeekSummary([{ state: 'done' }, { state: 'upcoming' }] as any).label,
      processFeedback('too_easy').message, processFeedback('too_hard').message, processFeedback('just_right').message,
      topUpTitleHe(3), nextHeaderHe({ kind: 'strength', why: 'topup', sets: 4 } as any), nextHeaderHe({ kind: 'run', why: 'week' } as any),
    ];
    expect(out).toMatchInlineSnapshot(`
      [
        "1 מתוך 2 בוצע",
        "תודה! נשתמש בזה כדי להתאים את האימונים הבאים.",
        "תודה על הכנות! נשתמש בזה כדי להתאים את האימונים הבאים.",
        "מעולה, תודה!",
        "השלמת סטים · נשארו 3 סטים להיום",
        "אימון משלים, לסגור את יעד הכוח של היום",
        "נשארה ריצה השבוע",
      ]
    `);
  });

  it('onboarding tour + coach copy', () => {
    const out = [
      mapTutorialDoneLabel('route', true),
      placeholderHints({ gender: 'male', daysAway: 10, weather: 'rain', buildableToday: true, doneToday: false, trainingDayToday: 2 } as any),
      workoutCardLabel({ title: 'T', minutes: 25, exerciseCount: 6 }),
      describeCoachError({ offline: true }, 'male'), describeCoachError({ status: 500 }, 'female'),
    ];
    expect(out).toMatchInlineSnapshot(`
      [
        "יאללה, בואו נתחיל",
        [
          "נסה: תבנה לי אימון חזרה קל",
          "נסה: תבנה לי אימון בבית בלי ציוד",
          "נסה: תבנה לי את האימון של היום",
          "נסה: תבנה לי אימון בטן של 15 דק׳",
        ],
        "T · 25 דק׳ · 6 תרגילים",
        {
          "body": "קלי AI צריך אינטרנט. בינתיים אפשר לבנות אימון בבונה האימונים.",
          "offerBuilder": true,
          "retryable": true,
          "title": "אין חיבור",
        },
        {
          "body": "נסי שוב בעוד רגע.",
          "offerBuilder": false,
          "retryable": true,
          "title": "משהו השתבש",
        },
      ]
    `);
  });
});
