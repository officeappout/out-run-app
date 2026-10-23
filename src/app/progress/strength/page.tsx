'use client';

/**
 * /progress/strength — the progress hub's strength page (enable_progress_hub_v2).
 * Thin route wrapper; the page itself guards the flag (off → /progression).
 */
import StrengthHubPage from '@/features/progression-hub/v2/hub/strength/StrengthHubPage';

export default function ProgressStrengthPage() {
  return <StrengthHubPage />;
}
