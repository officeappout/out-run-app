'use client';
/**
 * enable_equipment_scan_v1 (owner 31.10.2026): camera scan of park equipment (phase 1) and park
 * mapping from photos (phase 2). False while the flags load.
 */
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

export function useEquipmentScanV1(): boolean {
  const isSuperAdmin = useUserStore((s) => !!(s.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  return !loading && flags.enableEquipmentScanV1;
}
