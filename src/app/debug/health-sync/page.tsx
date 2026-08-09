'use client';

/**
 * Route: /debug/health-sync
 *
 * TEMPORARY diagnostic screen for the "only today syncs" HealthKit
 * backfill investigation (Aug 2026). devicectl console streaming and
 * Safari Web Inspector both proved unreliable for capturing live JS
 * logs on-device this session — this routes around that entirely:
 * plain text on screen, screenshot it, done.
 *
 * Reached via the 🔧 button in StepsAnalyticsPage's header. Delete this
 * file, the debugState module (src/lib/healthBridge/debugState.ts), and
 * the header button once the backfill bug is confirmed fixed on-device.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PREF_KEY_PERMISSIONS } from '@/lib/healthBridge/init';
import { getHealthSyncDebugState, type HealthSyncDebugState } from '@/lib/healthBridge/debugState';
import { useSettingsStore } from '@/features/home/store/useSettingsStore';
import { OutboxFlusher } from '@/lib/outbox/OutboxFlusher';

export const dynamic = 'force-dynamic';

function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as any).Capacitor?.isNativePlatform?.());
}

interface Snapshot {
  prefKeyPermissionsRaw: string | null;
  healthBridgeEnabledZustand: boolean;
  depthSamples: number;
  depthWorkouts: number;
  sync: HealthSyncDebugState;
  capturedAt: string;
}

async function takeSnapshot(): Promise<Snapshot> {
  let prefKeyPermissionsRaw: string | null = null;
  if (isNativeApp()) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      const { value } = await Preferences.get({ key: PREF_KEY_PERMISSIONS });
      prefKeyPermissionsRaw = value;
    } catch (err) {
      prefKeyPermissionsRaw = `<error: ${err instanceof Error ? err.message : String(err)}>`;
    }
  } else {
    prefKeyPermissionsRaw = '<web — n/a>';
  }

  const depth = await OutboxFlusher.getDepth();

  return {
    prefKeyPermissionsRaw,
    healthBridgeEnabledZustand: useSettingsStore.getState().healthBridgeEnabled,
    depthSamples: depth.samples,
    depthWorkouts: depth.workouts,
    sync: getHealthSyncDebugState(),
    capturedAt: new Date().toISOString(),
  };
}

function Row({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-gray-100 text-[13px]" dir="ltr">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="font-mono text-gray-900 text-right break-all">
        {value === null || value === '' ? '—' : String(value)}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">{title}</p>
      <div className="bg-white rounded-xl border border-gray-200 px-3">{children}</div>
    </div>
  );
}

export default function HealthSyncDebugPage() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  const refresh = useCallback(() => {
    void takeSnapshot().then(setSnapshot);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4" dir="rtl">
      <div
        className="sticky top-0 z-10 flex items-center gap-2 pb-3 bg-gray-50"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
      >
        <button
          onClick={() => router.back()}
          className="text-sm font-bold text-gray-500"
        >
          ← חזור
        </button>
        <h1 className="flex-1 text-center text-[15px] font-black text-gray-900">
          אבחון סנכרון בריאות (זמני)
        </h1>
        <button
          onClick={refresh}
          className="text-sm font-bold text-[#00C07A]"
        >
          רענן
        </button>
      </div>

      {!snapshot ? (
        <p className="text-center text-gray-400 py-8">טוען…</p>
      ) : (
        <div className="max-w-lg mx-auto">
          <p className="text-[11px] text-gray-400 mb-3" dir="ltr">
            captured: {snapshot.capturedAt}
          </p>

          <Section title="1. Connected state">
            <Row label="PREF_KEY_PERMISSIONS (native, ground truth)" value={snapshot.prefKeyPermissionsRaw} />
            <Row
              label="healthBridgeEnabled (Zustand)"
              value={String(snapshot.healthBridgeEnabledZustand)}
            />
          </Section>

          <Section title="2. Last syncSince() call">
            <Row label="reason" value={snapshot.sync.lastSyncReason} />
            <Row label="sinceISO (actual query start)" value={snapshot.sync.lastSyncSinceISO} />
            <Row label="untilISO" value={snapshot.sync.lastSyncUntilISO} />
            <Row label="error" value={snapshot.sync.lastSyncError} />
          </Section>

          <Section title="3. Last syncSince() result">
            <Row label="sample count" value={snapshot.sync.lastSyncSampleCount} />
            <Row label="min sample date" value={snapshot.sync.lastSyncMinSampleDate} />
            <Row label="max sample date" value={snapshot.sync.lastSyncMaxSampleDate} />
            <Row label="cursor written" value={snapshot.sync.lastSyncCursorWritten} />
          </Section>

          <Section title="4. Outbox queue">
            <Row label="depth — samples remaining" value={snapshot.depthSamples} />
            <Row label="depth — workouts remaining" value={snapshot.depthWorkouts} />
            <Row label="enqueued (lifetime this session)" value={snapshot.sync.totalEnqueuedLifetime} />
            <Row label="flushed (lifetime this session)" value={snapshot.sync.totalFlushedLifetime} />
            <Row label="last flush error" value={snapshot.sync.lastFlushError} />
            <Row label="last flush at" value={snapshot.sync.lastFlushAt} />
          </Section>

          <Section title="Other">
            <Row label="last debug state update" value={snapshot.sync.lastUpdatedAt} />
          </Section>

          <p className="text-[11px] text-gray-400 text-center mt-2 mb-8">
            צלם מסך ושלח לדוד. מסך זמני — יוסר לאחר סגירת הבאג.
          </p>
        </div>
      )}
    </div>
  );
}
