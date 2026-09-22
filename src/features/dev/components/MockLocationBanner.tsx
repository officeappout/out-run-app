'use client';

/**
 * MockLocationBanner — persistent top-of-screen strip, visible whenever the
 * super-admin-only location override (MockLocationPanel) is active (David,
 * 22.09.2026, field-test doc 37). Deliberately NOT just the small
 * bottom-left panel's own indicator dot — this stays up regardless of mode
 * (discover/free_run/active/…) for the whole duration of a workout, so
 * there's no way to forget a fake position is driving distance/pace/route
 * instead of real GPS.
 *
 * z-[120] — "Dev-only banners" per .cursorrules' registered budget entry
 * (shared with HybridStationLayer's full-screen station overlay; the two
 * are not expected to compete for attention in the same moment).
 */
import type { DevSimulationState } from '@/features/parks/core/hooks/useDevSimulation';

interface MockLocationBannerProps {
  devSim: DevSimulationState;
}

export default function MockLocationBanner({ devSim }: MockLocationBannerProps) {
  if (!devSim.isMockEnabled) return null;

  const label = devSim.selectedCity
    ?? (devSim.mockLocation ? `${devSim.mockLocation.lat.toFixed(4)}, ${devSim.mockLocation.lng.toFixed(4)}` : '—');

  return (
    <div
      dir="rtl"
      className="fixed top-0 inset-x-0 z-[120] flex items-center justify-between gap-2 bg-orange-600 text-white px-3 py-2 shadow-md pointer-events-auto"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
    >
      <span className="text-[12px] font-bold truncate">
        🧪 מצב בדיקה: מיקום מדומה — {label}
      </span>
      <button
        type="button"
        onClick={devSim.toggleMock}
        className="shrink-0 rounded-full bg-white/20 hover:bg-white/30 px-3 py-1 text-[11px] font-bold transition-colors active:scale-95"
      >
        כבה
      </button>
    </div>
  );
}
