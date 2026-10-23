'use client';

/**
 * useDestinationPlan — the planner's state: mode tab, preference chip, the
 * generated candidates (re-fetched per mode, like the commute carousel's
 * activity picker), the options to show and the selected one.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchRealParks } from '../services/parks.service';
import { fetchPlannerCandidates } from './plan-routes';
import { availablePreferences, selectPlannerOptions, shortestOf } from './alternatives';
import { modeMinutes } from './mode-minutes';
import { fountainPoints } from './route-tags';
import type { LatLng, PlannerCandidates, PlannerMode, PlannerPreference } from './types';

const EMPTY: PlannerCandidates = { commute: [], viaParks: [] };

export type PlanStatus = 'loading' | 'ready' | 'empty';

export function useDestinationPlan(args: { from: LatLng; to: LatLng; initialMode: PlannerMode }) {
  const { from, to, initialMode } = args;
  const [mode, setMode] = useState<PlannerMode>(initialMode);
  const [preference, setPreference] = useState<PlannerPreference | null>(null);
  const [status, setStatus] = useState<PlanStatus>('loading');
  const [candidates, setCandidates] = useState<PlannerCandidates>(EMPTY);
  const [fountains, setFountains] = useState<LatLng[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Last known shortest distance — keeps the other tabs' minutes while a mode switch refetches. */
  const [knownKm, setKnownKm] = useState<number | null>(null);
  /** Each mode's routes, kept for this destination — switching back to a tab is instant. */
  const cacheRef = useRef(new Map<string, PlannerCandidates>());

  useEffect(() => {
    let cancelled = false;
    setSelectedId(null);
    const cacheKey = `${mode}|${to.lat},${to.lng}`;
    const apply = (c: PlannerCandidates) => {
      setCandidates(c);
      const km = shortestOf(c.commute)?.distance;
      if (km) setKnownKm(km);
      setStatus(c.commute.length + c.viaParks.length > 0 ? 'ready' : 'empty');
    };
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      apply(cached);
      return () => { cancelled = true; };
    }
    setStatus('loading');
    setCandidates(EMPTY);
    (async () => {
      const parks = await fetchRealParks().catch(() => []);
      const c = await fetchPlannerCandidates({ from, to, mode, parks }).catch(() => EMPTY);
      if (cancelled) return;
      setFountains(fountainPoints(parks));
      if (c.commute.length + c.viaParks.length > 0) cacheRef.current.set(cacheKey, c);
      apply(c);
    })();
    return () => { cancelled = true; };
    // `from` is captured when the fetch fires (a GPS tick must not refetch).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, to.lat, to.lng]);

  const available = useMemo(() => availablePreferences(candidates), [candidates]);
  const options = useMemo(() => selectPlannerOptions(candidates, preference), [candidates, preference]);
  const selected = options.find((o) => o.id === selectedId) ?? options[0] ?? null;
  const shortest = useMemo(() => shortestOf(candidates.commute), [candidates]);
  const minutes = useMemo(
    () => modeMinutes(knownKm, status === 'ready' ? { mode, minutes: shortest?.duration } : null),
    [knownKm, shortest, mode, status],
  );

  const togglePreference = (p: PlannerPreference) => {
    setSelectedId(null);
    setPreference((cur) => (cur === p ? null : p));
  };

  return {
    mode, setMode,
    preference, togglePreference,
    status, available, options, selected, setSelectedId,
    shortestKm: knownKm,
    minutes, fountains,
  };
}
