'use client';

/**
 * /progress/run — the progress hub's running page (enable_progress_hub_v2).
 * Thin route wrapper; the page itself guards the flag (off → /progression).
 */
import RunHubPage from '@/features/progression-hub/v2/hub/run/RunHubPage';

export default function ProgressRunPage() {
  return <RunHubPage />;
}
