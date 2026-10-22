/**
 * Which sessions move the adaptive progression (pure).
 * Deload week (periodization week 5, also forced by long gaps), heat / UV and a calm-return
 * lightened session never advance or break a streak (3a), and never get a goal presence
 * boost (3e). Recovery sessions are never saved to the progression at all.
 */
export interface SessionGateInput {
  periodizationWeek?: number | null;
  heat?: boolean;
  calmReturnLightened?: boolean;
  isRecovery?: boolean;
}

export const DELOAD_PERIODIZATION_WEEK = 5;

export function isProgressHoldSession(s: SessionGateInput): boolean {
  return s.periodizationWeek === DELOAD_PERIODIZATION_WEEK || !!s.heat || !!s.calmReturnLightened || !!s.isRecovery;
}
