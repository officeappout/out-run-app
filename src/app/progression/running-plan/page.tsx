'use client';

/**
 * /progression/running-plan — the running plan in view mode (enable_home_v2,
 * board P-4). Thin wrapper; the screen lives in the progress-hub feature.
 */
import RunningPlanViewV2 from '@/features/progression-hub/v2/components/RunningPlanViewV2';

export default function RunningPlanViewPage() {
  return <RunningPlanViewV2 />;
}
