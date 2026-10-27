/** The part-of-day icon per time window (the S-2b days pickers: RunDaysStep, the schedule tutorial ל3). */
import { Sun, Sunrise, Sunset } from 'lucide-react';
import type { TimeWindow } from '../engine-v2/types';

export const WINDOW_ICON: Record<TimeWindow, typeof Sun> = { morning: Sunrise, noon: Sun, evening: Sunset };
