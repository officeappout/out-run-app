'use client';

/**
 * /progress/steps — the progress hub's steps page (enable_progress_hub_v2).
 * Thin route wrapper; the page itself guards the flag (off → /progression).
 */
import StepsHubPage from '@/features/progression-hub/v2/hub/steps/StepsHubPage';

export default function ProgressionStepsPage() {
  return <StepsHubPage />;
}
