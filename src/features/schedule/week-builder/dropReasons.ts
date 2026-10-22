/**
 * Week builder — why a drop snapped back, one short Hebrew line per cause. Typed codes first
 * (tests and Kelly read codes), one renderer (the engine's reasonsV2 style). Impersonal Hebrew,
 * so it reads right for every user.
 */
import type { HardRuleId } from '../engine-v2/rules';

export type WbDropCode =
  | 'closed'
  | 'full'
  | 'locked'
  | 'past'
  | 'missing'
  | 'too_many_days'
  | 'too_many_today'
  | HardRuleId;

const DROP_REASON_HE: Record<WbDropCode, string> = {
  closed: 'היום הזה מסומן כלא פנוי',
  full: 'אין מקום ביום הזה',
  locked: 'את האימון הזה לא מזיזים מכאן',
  past: 'היום הזה כבר עבר',
  missing: 'האימון כבר לא בשבוע',
  too_many_days: 'זה יוסיף יום אימון מעבר למה שבחרת',
  too_many_today: 'יותר מדי אימונים ביום אחד',
  H1: 'היום הזה לא פנוי',
  H2: 'ביום הריצה הארוכה לא עושים כוח',
  H3: 'בלי רגליים כבדות יום לפני ריצת מפתח',
  H4: 'בין שתי ריצות איכות צריך 48 שעות',
  H5: 'ביום של ריצת איכות — קודם הריצה',
  H6: 'אותם שרירים צריכים 48 שעות מנוחה',
  H7: 'אחרי עליית כוח — יומיים בלי סקיל קשה',
  H8: 'יותר מדי ימי ריצה ברצף',
  H9: 'יותר מדי אימונים ביום אחד',
};

export const dropReasonHe = (code: WbDropCode): string => DROP_REASON_HE[code];
