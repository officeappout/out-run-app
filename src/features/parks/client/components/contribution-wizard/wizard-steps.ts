/**
 * The add-location wizard's step list. Pure — unit-tested in
 * __tests__/wizard-steps.test.ts.
 *
 * The "equipment" step exists only for a gym park, and the facility type is
 * picked on the details step — so the indicator used to read 3 steps
 * (מיקום · פרטים · תמונה) on the first two steps and jump to 4 once "גינת
 * כושר" was chosen (owner report 23.10.2026). The INDICATOR now counts the
 * equipment step from the start whenever the place is a park / gym and its
 * type is still open; navigation keeps the real list, so nothing about which
 * screens run or what is submitted changes.
 */
export type StepId = 'location' | 'details' | 'equipment' | 'photo' | 'scan' | 'send';

interface StepData {
  facilityType: string | null | undefined;
  isPointOfInterest: boolean;
  /** Camera scan park mapping (enable_equipment_scan_v1): צילום · מיקום · מתקנים · שליחה. */
  scanMode?: boolean;
}

export const SCAN_STEP_IDS: StepId[] = ['scan', 'location', 'equipment', 'send'];

/** The steps the wizard actually walks through. */
export function wizardStepIds(data: StepData): StepId[] {
  if (data.scanMode) return SCAN_STEP_IDS;
  return ['location', 'details', ...(data.facilityType === 'gym_park' ? (['equipment'] as StepId[]) : []), 'photo'];
}

/** The steps the indicator shows while the user is on `step` (index into wizardStepIds). */
export function indicatorStepIds(data: StepData, step: number): StepId[] {
  const real = wizardStepIds(data);
  if (data.scanMode) return real;
  const typeOpen = !data.facilityType && !data.isPointOfInterest;
  // Only before leaving the details step — after it, the real list is final.
  if (typeOpen && step <= real.indexOf('details')) {
    return ['location', 'details', 'equipment', 'photo'];
  }
  return real;
}
