/**
 * Admin "all users" list — the account-kind filters (pure, tested).
 *
 *   testFilter  HIDE (default) hides test, legacy mock and demo accounts;
 *               ALL shows everyone; ONLY shows just those accounts.
 *   demoOnly    the "דמו" chip (demo-users-design.md PR 2): only demo-world
 *               users (uid demo_* / core.demo), whatever testFilter says.
 */
import { isTestOrMockUser } from '@/lib/testAccountFilter';

export type TestAccountFilter = 'HIDE' | 'ALL' | 'ONLY';

export interface AccountKindFlags {
  isTestData?: boolean;
  isMockData?: boolean;
  isDemo?: boolean;
}

export function matchesAccountKind(
  user: AccountKindFlags,
  opts: { testFilter: TestAccountFilter; demoOnly: boolean },
): boolean {
  if (opts.demoOnly) return user.isDemo === true;
  const hidden = isTestOrMockUser({ isTestData: user.isTestData, isMockData: user.isMockData }) || user.isDemo === true;
  if (opts.testFilter === 'ALL') return true;
  return opts.testFilter === 'HIDE' ? !hidden : hidden;
}
