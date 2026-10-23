'use client';

import dynamic from 'next/dynamic';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useTvPhoneStore } from './phone-store';

const Inner = dynamic(() => import('./TvPhoneLayerInner'), { ssr: false });

/**
 * Mounted once in ClientLayout. With enable_tv_mode_v1 off it renders nothing and never loads
 * the TV code (no chunk, no listener, no read). Once on, the chunk is fetched when the phone
 * has something to show: a pending pair, a stored connection (reload resume) or a live session.
 */
export default function TvPhoneLayer() {
  const { flags } = useFeatureFlags();
  const active = useTvPhoneStore((s) => s.view !== 'none' || s.code !== null);
  if (!flags.enableTvModeV1) return null;
  return <ResumeGate active={active} />;
}

function ResumeGate({ active }: { active: boolean }) {
  // A stored connection must be able to resume even before the store knows about it.
  const stored = typeof window !== 'undefined' && hasStoredConnection();
  return active || stored ? <Inner /> : null;
}

function hasStoredConnection(): boolean {
  try {
    return sessionStorage.getItem('tv:phone') !== null;
  } catch {
    return false;
  }
}
