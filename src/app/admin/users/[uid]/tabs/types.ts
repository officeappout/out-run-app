import type { AdminUserListItem } from '@/features/admin/services/users.service';
import type { UserFullProfile } from '@/types/user-profile';
import type { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import type { DailyStepsSnapshot } from '@/features/activity/services/activity-history.service';
import type { AnalyticsEvent } from '@/features/analytics/AnalyticsService';
import type { GearDefinition } from '@/features/content/equipment/gear';
import type { Program } from '@/features/content/programs';
import type { PushHistoryEntry, UserAuthorityInfo } from '../../shared.utils';

/** Everything page.tsx loads, handed down to the tabs as plain props. */
export interface UserTabData {
  user: AdminUserListItem;
  fullProfile: UserFullProfile;
  workoutHistory: WorkoutHistoryEntry[];
  stepsHistory: DailyStepsSnapshot[];
  analyticsEvents: AnalyticsEvent[];
  pushHistory: PushHistoryEntry[];
  gearDefinitions: GearDefinition[];
  authority: UserAuthorityInfo | null;
  programs: Program[];
  healthDeclarationPdfUrl?: string;
}
