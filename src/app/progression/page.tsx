'use client';

/**
 * /progression — the "התקדמות" bottom-nav tab's route.
 *
 * Thin App Router wrapper around ProgressionScreen
 * (src/features/progression-hub/) — same pattern as
 * /progression-map/[programId]/page.tsx: the route file itself carries no
 * logic, everything lives in the feature component.
 */
import { ProgressionScreen } from '@/features/progression-hub/components/ProgressionScreen';

export default function ProgressionPage() {
  return <ProgressionScreen />;
}
