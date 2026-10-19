import { SCHEDULE_BUILDER_DRAWER_ENABLED } from '@/config/feature-flags';

/** localStorage override, same pattern as isRunningOnboardingGateEnabled/isAgendaHybridDayDisplayEnabled/isPlsCacheEnabled. */
export function isScheduleBuilderDrawerEnabled(): boolean {
  if (typeof window !== 'undefined') {
    try {
      const ls = window.localStorage?.getItem('OUT_SCHEDULE_DRAWER');
      if (ls === '0' || ls === 'false') return false;
      if (ls === '1' || ls === 'true') return true;
    } catch {
      /* private mode — ignore */
    }
  }
  return SCHEDULE_BUILDER_DRAWER_ENABLED;
}
