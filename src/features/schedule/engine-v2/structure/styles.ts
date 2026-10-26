/**
 * Advanced (14+) without a skill lead: varied styles instead of repeating the same session.
 * Little time + high intensity put EMOM / AMRAP / circuits FIRST; otherwise they are finishers.
 */
import { STYLE_FINISHER_ROTATION, STYLE_FIRST_FOR_TIME_PRESSED, STYLE_LITTLE_TIME_MINUTES } from './config';
import type { StrengthDay, StructureInput, StyleChoice } from './types';

export const isTimePressedHigh = (i: Pick<StructureInput, 'sessionMinutes' | 'intensity'>): boolean =>
  i.intensity === 'high' && i.sessionMinutes != null && i.sessionMinutes <= STYLE_LITTLE_TIME_MINUTES;

export function applyStyles(days: StrengthDay[], input: Pick<StructureInput, 'sessionMinutes' | 'intensity'>): StrengthDay[] {
  const pressed = isTimePressedHigh(input);
  let n = 0;
  return days.map((d) => {
    if (d.skill) return d; // the skill leads this session
    const k = n++;
    const style: StyleChoice = pressed
      ? { primary: STYLE_FIRST_FOR_TIME_PRESSED[k % STYLE_FIRST_FOR_TIME_PRESSED.length], finisher: null }
      : { primary: 'strength', finisher: STYLE_FINISHER_ROTATION[k % STYLE_FINISHER_ROTATION.length] };
    return { ...d, style };
  });
}
