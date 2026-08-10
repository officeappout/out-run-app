'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { MapRef } from 'react-map-gl';
import { useMapStore, type MapPressureLevel } from '../store/useMapStore';
import { useLastMemoryWarningAt } from '@/lib/appForeground';
import { Analytics } from '@/features/analytics/AnalyticsService';

// ── Thresholds (design: .claude/knowledge/map-watchdog-plan.md §5B) ────────
const WARNING_FPS = 40;
const CRITICAL_FPS = 25;
const WARNING_SUSTAIN_MS = 3000;
const CRITICAL_SUSTAIN_MS = 2000;
/** Repeated native memoryWarning inside this window escalates warning → critical. */
const MEMORY_WARNING_REPEAT_WINDOW_MS = 15000;
/** Don't spam Analytics if the level flaps around a threshold. */
const BREADCRUMB_COOLDOWN_MS = 30000;
/** Rolling frame-time window for the FPS average — ~0.5-1s at a healthy frame rate. */
const FPS_SAMPLE_WINDOW = 30;

/**
 * Map Performance Monitor — Part B of the map-watchdog design
 * (.claude/knowledge/map-watchdog-plan.md §5). PURE OBSERVABILITY: computes a
 * `pressureLevel` ('normal' | 'warning' | 'critical') from FPS + the native
 * memoryWarning signal + `webglcontextlost`, and writes it to `useMapStore`.
 *
 * This does NOT change any map behavior — no markers dropped, no fetches
 * throttled. It's the "measure before you shed" step the plan calls for:
 * a future Adaptive Shed ladder would read `pressureLevel` to actually react;
 * this hook only produces the signal + Analytics breadcrumbs so real
 * thresholds can be tuned from device data before that Shed exists.
 *
 * `performance.memory` (JS heap size) is intentionally NOT used — it's a
 * Chromium-only, non-standard API. WKWebView/iOS — our actual target —
 * does not implement it (§4 of the plan doc). FPS + native signals are the
 * only cross-platform pressure indicators available here.
 */
export function useMapPerfMonitor(mapRef: React.RefObject<MapRef | null>, isMapLoaded: boolean): void {
  const setPressureLevel = useMapStore((s) => s.setPressureLevel);
  const lastMemoryWarningAt = useLastMemoryWarningAt();

  const currentLevelRef = useRef<MapPressureLevel>('normal');
  const lastBreadcrumbAtRef = useRef(0);
  const belowWarningSinceRef = useRef<number | null>(null);
  const belowCriticalSinceRef = useRef<number | null>(null);
  const aboveWarningSinceRef = useRef<number | null>(null);
  const memoryWarningTimestampsRef = useRef<number[]>([]);
  const rafIdRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const fpsBufferRef = useRef<number[]>([]);

  const emit = useCallback((level: MapPressureLevel, reason: string) => {
    if (currentLevelRef.current === level) return;
    currentLevelRef.current = level;
    if (level !== 'normal') {
      // Escalating via a non-FPS path (memoryWarning / webglcontextlost) must
      // clear any recovery timer already running from an earlier FPS dip —
      // otherwise the very next good-FPS tick can satisfy the recovery
      // window instantly (it was already counting from before this
      // escalation) and flip straight back to 'normal' one frame later.
      aboveWarningSinceRef.current = null;
    }
    setPressureLevel(level);
    const now = Date.now();
    if (now - lastBreadcrumbAtRef.current > BREADCRUMB_COOLDOWN_MS) {
      lastBreadcrumbAtRef.current = now;
      Analytics.logError('map_degraded', 'map', `${level}:${reason}`);
    }
  }, [setPressureLevel]);

  // ── FPS sampler (rAF frame-delta, sustained-threshold state machine) ────
  useEffect(() => {
    if (!isMapLoaded) return;
    let cancelled = false;

    function tick(now: number) {
      if (cancelled) return;
      // Don't sample while backgrounded — rAF is throttled/suspended by the
      // browser there, so a resumed delta would read as a false stall, not
      // real jank.
      if (typeof document !== 'undefined' && document.hidden) {
        lastFrameTimeRef.current = null;
        rafIdRef.current = requestAnimationFrame(tick);
        return;
      }

      const prev = lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;
      if (prev !== null) {
        const delta = now - prev;
        const fps = delta > 0 ? 1000 / delta : 60;
        const buf = fpsBufferRef.current;
        buf.push(fps);
        if (buf.length > FPS_SAMPLE_WINDOW) buf.shift();
        const avgFps = buf.reduce((a, b) => a + b, 0) / buf.length;

        if (avgFps < CRITICAL_FPS) {
          if (belowCriticalSinceRef.current === null) belowCriticalSinceRef.current = now;
          if (now - belowCriticalSinceRef.current >= CRITICAL_SUSTAIN_MS) emit('critical', 'low-fps');
        } else {
          belowCriticalSinceRef.current = null;
        }

        if (avgFps < WARNING_FPS) {
          belowWarningSinceRef.current ??= now;
          aboveWarningSinceRef.current = null;
          if (
            currentLevelRef.current === 'normal' &&
            now - belowWarningSinceRef.current >= WARNING_SUSTAIN_MS
          ) {
            emit('warning', 'low-fps');
          }
        } else {
          belowWarningSinceRef.current = null;
          aboveWarningSinceRef.current ??= now;
          if (
            currentLevelRef.current !== 'normal' &&
            belowCriticalSinceRef.current === null &&
            now - aboveWarningSinceRef.current >= WARNING_SUSTAIN_MS
          ) {
            emit('normal', 'recovered');
          }
        }
      }
      rafIdRef.current = requestAnimationFrame(tick);
    }

    rafIdRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      lastFrameTimeRef.current = null;
      fpsBufferRef.current = [];
      belowWarningSinceRef.current = null;
      belowCriticalSinceRef.current = null;
      aboveWarningSinceRef.current = null;
    };
  }, [isMapLoaded, emit]);

  // ── webglcontextlost — hard signal, immediate critical ──────────────────
  useEffect(() => {
    if (!isMapLoaded || !mapRef.current) return;
    const map = mapRef.current.getMap();
    if (!map) return;
    const canvas = map.getCanvas();
    const onContextLost = () => emit('critical', 'webglcontextlost');
    canvas.addEventListener('webglcontextlost', onContextLost);
    return () => canvas.removeEventListener('webglcontextlost', onContextLost);
  }, [isMapLoaded, mapRef, emit]);

  // ── native memoryWarning — single = warning, repeated in-window = critical ─
  useEffect(() => {
    if (!lastMemoryWarningAt) return;
    const stamps = memoryWarningTimestampsRef.current.filter(
      (t) => lastMemoryWarningAt - t < MEMORY_WARNING_REPEAT_WINDOW_MS,
    );
    stamps.push(lastMemoryWarningAt);
    memoryWarningTimestampsRef.current = stamps;
    if (stamps.length >= 2) {
      emit('critical', 'repeated-memoryWarning');
    } else if (currentLevelRef.current === 'normal') {
      emit('warning', 'memoryWarning');
    }
  }, [lastMemoryWarningAt, emit]);

  // Reset to normal on unmount so a stale pressureLevel from a prior map
  // instance (e.g. the free-run AppMap swap) never leaks into a fresh one.
  useEffect(() => {
    return () => {
      currentLevelRef.current = 'normal';
      setPressureLevel('normal');
    };
  }, [setPressureLevel]);
}
