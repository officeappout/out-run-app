import type { WorkoutActivityStatus } from '../services/presence.service';

export interface ActivityVisual {
  emoji: string;
  label: string;
  badgeColor: string;
}

export const ACTIVITY_ICON_MAP: Record<WorkoutActivityStatus, ActivityVisual> = {
  strength: { emoji: '💪', label: 'אימון כוח', badgeColor: '#00BAF7' },
  running:  { emoji: '🏃', label: 'ריצה',      badgeColor: '#22D3EE' },
  walking:  { emoji: '🚶', label: 'הליכה',     badgeColor: '#34D399' },
  cycling:  { emoji: '🚴', label: 'רכיבה',     badgeColor: '#F59E0B' },
};

export function getActivityVisual(status?: WorkoutActivityStatus): ActivityVisual | null {
  if (!status) return null;
  return ACTIVITY_ICON_MAP[status] ?? null;
}

const LEMUR_ASSET_MAP: Record<WorkoutActivityStatus, string> = {
  strength: '/assets/lemur/king-lemur.png',
  running:  '/assets/lemur/lemur-avatar.png',
  walking:  '/assets/lemur/lemur-avatar.png',
  cycling:  '/assets/lemur/smart-lemur.png',
};

const DEFAULT_LEMUR = '/assets/lemur/smart-lemur.png';

export function getLemurAsset(status?: WorkoutActivityStatus): string {
  if (!status) return DEFAULT_LEMUR;
  return LEMUR_ASSET_MAP[status] ?? DEFAULT_LEMUR;
}
