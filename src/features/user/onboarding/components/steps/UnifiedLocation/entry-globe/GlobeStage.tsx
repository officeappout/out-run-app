'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { Map as MapboxGLMap } from 'mapbox-gl';
import { MAPBOX_TOKEN, MAPBOX_STYLE } from '../location-constants';
import { setMapLanguageToHebrew } from '../location-utils';
import {
  buildDiveSequence,
  buildRestStep,
  globeRestCamera,
  nextSpinOffset,
  DIVE_DURATIONS,
  type CameraStep,
  type Viewport,
} from './globe-camera';
import { skyFog, PAGE_SKY } from './globe-sky';

export type GlobePhase = 'rest' | 'dive';

export interface GlobeStageProps {
  /** rest = the half-Earth idling; dive = flying in (to the target once known). */
  phase: GlobePhase;
  /** The user's fix. Only read while diving. */
  target: { lat: number; lng: number } | null;
  /** The street flight landed (or the globe can't render) — the caller reveals the street map. */
  onArrived: () => void;
}

/**
 * The live Earth (enable_entry_globe_v1) — its own non-interactive mapbox-gl
 * instance in globe projection, the app's token + style. Sits ABOVE the
 * step's street map while the user is at rest / locating, then fades away
 * once the dive lands at street zoom on the same centre. mapbox-gl is loaded
 * lazily (it is already in the bundle for the street map; this keeps it off
 * the module graph of the step).
 */
export default function GlobeStage({ phase, target, onArrived }: GlobeStageProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxGLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const reduce = !!useReducedMotion();

  const onArrivedRef = useRef(onArrived);
  onArrivedRef.current = onArrived;
  const arrivedRef = useRef(false);
  /** Generation of the running camera sequence — a newer one stops the older. */
  const runRef = useRef(0);
  const spinRef = useRef({ raf: 0, offset: 0 });
  const skyRafRef = useRef(0);
  const prevPhaseRef = useRef<GlobePhase>('rest');
  /** The fog is (going) dark — set once per dive, even if the dive started before the map loaded. */
  const skyDarkRef = useRef(false);

  const viewport = (): Viewport => ({
    width: nodeRef.current?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 390),
    height: nodeRef.current?.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 844),
  });

  const arrive = () => {
    if (arrivedRef.current) return;
    arrivedRef.current = true;
    onArrivedRef.current();
  };

  // ── Create / dispose the map ─────────────────────────────────────────
  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    if (!MAPBOX_TOKEN) {
      setFailed(true);
      return;
    }
    let disposed = false;
    let map: MapboxGLMap | null = null;
    const spin = spinRef.current;
    const run = runRef;
    const skyRaf = skyRafRef;

    void import('mapbox-gl')
      .then(({ default: mapboxgl }) => {
        if (disposed) return;
        try {
          mapboxgl.accessToken = MAPBOX_TOKEN;
          const rest = globeRestCamera(viewport());
          map = new mapboxgl.Map({
            container: node,
            style: MAPBOX_STYLE,
            projection: { name: 'globe' },
            center: rest.center,
            zoom: rest.zoom,
            interactive: false,
            attributionControl: false,
            fadeDuration: 0,
          });
          map.setPadding(rest.padding);
          mapRef.current = map;
          const m = map;
          m.on('style.load', () => {
            try {
              m.setFog(skyFog(0));
              setMapLanguageToHebrew(m);
            } catch {
              /* cosmetic */
            }
          });
          m.once('load', () => {
            if (!disposed) setReady(true);
          });
          m.on('error', () => {
            // Only a failure before the first load means "no globe" (tile hiccups later are harmless).
            if (!disposed && !m.loaded()) setFailed(true);
          });
        } catch {
          if (!disposed) setFailed(true);
        }
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });

    return () => {
      disposed = true;
      run.current++;
      cancelAnimationFrame(spin.raf);
      cancelAnimationFrame(skyRaf.current);
      try {
        map?.remove();
      } catch {
        /* already gone */
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sky: light page sky at rest → space while diving ─────────────────
  const animateSky = (to: 0 | 1) => {
    const map = mapRef.current;
    if (!map) return;
    cancelAnimationFrame(skyRafRef.current);
    if (reduce) {
      try { map.setFog(skyFog(to)); } catch { /* cosmetic */ }
      return;
    }
    const start = performance.now();
    const from = to === 1 ? 0 : 1;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / DIVE_DURATIONS.lift);
      try { map.setFog(skyFog(from + (to - from) * p)); } catch { /* cosmetic */ }
      if (p < 1) skyRafRef.current = requestAnimationFrame(tick);
    };
    skyRafRef.current = requestAnimationFrame(tick);
  };

  // ── Idle spin at rest ────────────────────────────────────────────────
  const stopSpin = () => cancelAnimationFrame(spinRef.current.raf);
  const startSpin = () => {
    stopSpin();
    if (reduce) return;
    const tick = () => {
      const map = mapRef.current;
      if (!map) return;
      spinRef.current.offset = nextSpinOffset(spinRef.current.offset);
      try {
        map.jumpTo(globeRestCamera(viewport(), spinRef.current.offset));
      } catch {
        /* transient */
      }
      spinRef.current.raf = requestAnimationFrame(tick);
    };
    spinRef.current.raf = requestAnimationFrame(tick);
  };

  // Runs one camera step; resolves when it ends (or a safety timeout).
  const runStep = (map: MapboxGLMap, step: CameraStep) =>
    new Promise<void>((resolve) => {
      if (step.method === 'jumpTo') {
        try { map.jumpTo(step.options); } catch { /* transient */ }
        resolve();
        return;
      }
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        map.off('moveend', done);
        resolve();
      };
      const timer = setTimeout(done, step.options.duration + 1500);
      try {
        // Start first, listen after: starting a flight stops the previous one,
        // which fires a `moveend` that must not resolve THIS step.
        if (step.method === 'flyTo') map.flyTo(step.options);
        else map.easeTo(step.options);
        map.on('moveend', done);
      } catch {
        done();
      }
    });

  // ── Phase / target driver ────────────────────────────────────────────
  const targetKey = target ? `${target.lat.toFixed(6)},${target.lng.toFixed(6)}` : '';
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;

    if (phase === 'rest') {
      arrivedRef.current = false;
      const map = mapRef.current;
      if (!ready || !map) return;
      const gen = ++runRef.current;
      if (skyDarkRef.current) {
        skyDarkRef.current = false;
        animateSky(0);
      }
      if (prev === 'dive') {
        spinRef.current.offset = 0;
        void runStep(map, buildRestStep(viewport(), reduce)).then(() => {
          if (runRef.current === gen) startSpin();
        });
      } else {
        startSpin();
      }
      return () => stopSpin();
    }

    // phase === 'dive'
    stopSpin();
    if (failed) {
      if (target) arrive();
      return;
    }
    const map = mapRef.current;
    if (!ready || !map) {
      // Still loading — never hold the user on the globe: once the fix is
      // known, give the map a short grace and then reveal the street anyway.
      if (!target) return;
      const t = setTimeout(arrive, 1200);
      return () => clearTimeout(t);
    }
    const gen = ++runRef.current;
    if (!skyDarkRef.current) {
      skyDarkRef.current = true;
      animateSky(1);
    }
    const steps = buildDiveSequence({ viewport: viewport(), target, reduceMotion: reduce });
    void (async () => {
      for (const step of steps) {
        await runStep(map, step);
        if (runRef.current !== gen) return;
        if (step.role === 'street') arrive();
      }
    })();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, ready, failed, targetKey, reduce]);

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: PAGE_SKY }} aria-hidden>
      <motion.div
        className="absolute inset-0"
        initial={reduce ? false : { y: 120 }}
        animate={{ y: 0 }}
        transition={{ duration: 1.6, ease: [0.23, 1, 0.32, 1] }}
      >
        <div
          ref={nodeRef}
          className="absolute inset-0 transition-opacity duration-500 ease-v2"
          style={{ opacity: ready && !failed ? 1 : 0 }}
        />
      </motion.div>
    </div>
  );
}
