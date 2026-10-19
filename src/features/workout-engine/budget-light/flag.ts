/**
 * Budget light mode — the live panel flag (enable_budget_light_mode), read synchronously from
 * this device's last-known flags (readLiveFlag). Off in node / hermetic runs (FLAG_DEFS default).
 */
import { readLiveFlag } from '@/lib/feature-flag-live';

export function isBudgetLightModeEnabled(): boolean {
  return readLiveFlag('enableBudgetLightMode');
}
