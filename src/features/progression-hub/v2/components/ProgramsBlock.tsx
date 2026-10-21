'use client';

/**
 * P-4 — "התוכניות שלך" on the progress tab (v2).
 *   כוח   — the profile's ProgramsSection in its v2 look (moved here from the
 *           profile's "סקילים" tab): main ring + child programs + "עוד לא
 *           בדקת רמה"; taps keep their destinations (resolveProgressionMapDestination
 *           → /progression-map/[id]; a parent → ParentProgramSheet).
 *   ריצה  — RunningPlanCard → the plan summary in view mode.
 *   גלה עוד — the existing DiscoverMoreSection (bucket hook, unchanged).
 */
import dynamic from 'next/dynamic';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useProgressHubBuckets } from '@/features/progression-map/hooks/useProgressHubBuckets';
import { DiscoverMoreSection } from '../../components/DiscoverMoreSection';
import { runningPlanProgress } from '../utils/running-plan-progress';
import RunningPlanCard from './RunningPlanCard';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';

const ProgramsSection = dynamic(() => import('@/features/profile/components/widgets/ProgramsSection'), { ssr: false });

export default function ProgramsBlock() {
  const t = useT(profileNs);
  const running = useUserStore((s) => s.profile?.running);
  const plan = runningPlanProgress(running as Parameters<typeof runningPlanProgress>[0]);
  const { ready, buckets } = useProgressHubBuckets();
  return (
    <section className="space-y-4">
      <ProgramsSection v2 />
      {plan && (
        <div>
          <p className="mb-2 whitespace-nowrap text-[13px] font-extrabold text-v2-deep">{t('hub.programs.running')}</p>
          <RunningPlanCard plan={plan} />
        </div>
      )}
      {ready && <DiscoverMoreSection items={buckets.discover} />}
    </section>
  );
}
