'use client';

import { useRunningPlayer } from '../../store/useRunningPlayer';
import { useSessionStore } from '../../../../core/store/useSessionStore';

/**
 * Debug HUD — visible only when URL contains ?debug=gps.
 * Shows real-time GPS diagnostics without needing console access.
 * Mount inside FreeRunLayer (inside the workout overlay, inside the map).
 */
export default function GpsDebugHud() {
  const accuracy       = useRunningPlayer((s) => s.gpsAccuracy);
  const gpsStatus      = useRunningPlayer((s) => s.gpsStatus);
  const hasHadGoodFix  = useRunningPlayer((s) => s.hasHadGoodFix);
  const lastAction     = useRunningPlayer((s) => s.lastFilterAction);
  const totalDistance  = useSessionStore((s) => s.totalDistance);

  const statusColor =
    gpsStatus === 'perfect' ? '#4ade80' :
    gpsStatus === 'good'    ? '#86efac' :
    gpsStatus === 'poor'    ? '#f97316' :
    gpsStatus === 'simulated' ? '#a78bfa' :
    '#94a3b8';

  const actionColor =
    lastAction?.startsWith('✅') ? '#4ade80' :
    lastAction?.startsWith('🔇') ? '#facc15' :
    '#f97316';

  return (
    <div
      style={{
        position: 'fixed',
        top: 'max(3.5rem, calc(env(safe-area-inset-top, 0px) + 3.5rem))',
        left: '0.75rem',
        zIndex: 9999,
        background: 'rgba(0,0,0,0.86)',
        backdropFilter: 'blur(6px)',
        color: '#e2e8f0',
        padding: '10px 14px',
        borderRadius: 14,
        fontFamily: 'ui-monospace, monospace',
        fontSize: 15,
        lineHeight: 1.75,
        minWidth: 210,
        pointerEvents: 'none',
        border: '1px solid rgba(255,255,255,0.10)',
      }}
    >
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, letterSpacing: '0.06em' }}>
        GPS DEBUG
      </div>

      <div>
        <Lbl>acc</Lbl>{' '}
        <Val>{accuracy != null ? `${Math.round(accuracy)} m` : '—'}</Val>
      </div>

      <div>
        <Lbl>status</Lbl>{' '}
        <Val color={statusColor}>{gpsStatus}</Val>
      </div>

      <div>
        <Lbl>hadGoodFix</Lbl>{' '}
        <Val color={hasHadGoodFix ? '#4ade80' : '#f97316'}>
          {hasHadGoodFix ? 'yes' : 'no'}
        </Val>
      </div>

      <div>
        <Lbl>distance</Lbl>{' '}
        <Val>{totalDistance.toFixed(3)} km</Val>
      </div>

      <div style={{ marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 4 }}>
        <Lbl>last</Lbl>{' '}
        <Val color={actionColor}>{lastAction ?? '—'}</Val>
      </div>
    </div>
  );
}

function Lbl({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ color: '#64748b', fontSize: 12 }}>{children}:</span>
  );
}

function Val({ children, color = '#e2e8f0' }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{ color, fontWeight: 700 }}>{children}</span>
  );
}
