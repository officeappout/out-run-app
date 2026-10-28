'use client';

/**
 * DestinationPlanner (enable_destination_planner_v1; design M-2a…M-2e) — the
 * step between an address pick / "נווט לכאן" and the commute player:
 * destination header, mode tabs with minutes, preference chips, "2 דרכים לשם"
 * and one start button. Start hands the chosen route back to DiscoverLayer,
 * which runs the existing commute player with it.
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Bike, ChevronRight, Footprints } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import type { Route } from '../types/route.types';
import { useMapStore } from '../store/useMapStore';
import { PLANNER_MODES } from './mode-minutes';
import { PlannerRouteCard } from './PlannerRouteCard';
import { PlannerSelectedRow } from './PlannerSelectedRow';
import { visiblePlannerPrefs } from './alternatives';
import { useDestinationPlan } from './useDestinationPlan';
import type { LatLng, PlannerMode, PlannerPreference } from './types';

const MODE_ICON = { walking: Footprints, running: Activity, cycling: Bike } as const;

export interface DestinationPlannerProps {
  userPosition: LatLng;
  destination: LatLng;
  destinationLabel?: string;
  /** The user's last activity (default tab). */
  initialMode: PlannerMode;
  onBack: () => void;
  onStart: (route: Route, mode: PlannerMode) => void;
  onFocusChange?: (route: Route | null) => void;
}

export default function DestinationPlanner(props: DestinationPlannerProps) {
  const { userPosition, destination, destinationLabel, initialMode, onBack, onStart, onFocusChange } = props;
  const t = useT(map);
  const plan = useDestinationPlan({ from: userPosition, to: destination, initialMode });
  const setMapRoutes = useMapStore((s) => s.setFreeRunCarouselRoutes);
  const { options, selected, mode } = plan;
  // Compact by default (Google-Maps pattern): the route stays visible above the
  // sheet; the full list of ways + preference chips open on demand.
  const [expanded, setExpanded] = useState(false);

  // Map↔sheet sync: publish the sheet's real height so the camera frames the
  // selected route in the free area ABOVE it (useCameraController's
  // overview drawer-sync fit, bottom padding = this height). Cleared on unmount.
  const sheetRef = useRef<HTMLDivElement>(null);
  const setSheetHeight = useMapStore((s) => s.setOverviewSheetHeightPx);
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const publish = () => setSheetHeight(Math.round(el.getBoundingClientRect().height / 8) * 8);
    publish();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, [setSheetHeight]);
  useEffect(() => () => setSheetHeight(null), [setSheetHeight]);

  // The options' polylines on the map (same slot the commute carousel uses), focus = selected.
  useEffect(() => {
    setMapRoutes(options.length ? options.map((o) => o.route) : null);
  }, [options, setMapRoutes]);
  useEffect(() => {
    onFocusChange?.(selected?.route ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);
  useEffect(() => () => setMapRoutes(null), [setMapRoutes]);

  const modeLabel = (m: PlannerMode) => t(m === 'walking' ? 'destPlanner.mode.walking' : m === 'running' ? 'destPlanner.mode.running' : 'destPlanner.mode.cycling');
  const prefLabel = (p: PlannerPreference) => t(p === 'park' ? 'destPlanner.pref.park' : p === 'lit' ? 'destPlanner.pref.lit' : p === 'shortest' ? 'destPlanner.pref.shortest' : 'destPlanner.pref.shade');
  // Only chips that can do something right now — no disabled "בקרוב" placeholders.
  const visiblePrefs = visiblePlannerPrefs(mode, plan.available);
  const onPanEnd = (_e: unknown, info: { offset: { y: number } }) => {
    if (info.offset.y < -24) setExpanded(true);
    else if (info.offset.y > 24) setExpanded(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] pointer-events-none" role="dialog" aria-label={t('destPlanner.sheetLabel')}>
      <div ref={sheetRef} className="pointer-events-auto mx-auto max-w-md bg-[#f6fbfd] rounded-t-[28px] shadow-[0_-18px_40px_-24px_rgba(9,30,50,0.35)] max-h-[72vh] flex flex-col pb-[env(safe-area-inset-bottom)]">
        <motion.div onPanEnd={onPanEnd} style={{ touchAction: 'none' }}>
          <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}
            aria-label={expanded ? t('destPlanner.collapse') : t('destPlanner.expand')} className="w-full h-5 grid place-items-center">
            <span className="w-10 h-1.5 rounded-full bg-[#dfe7ed]" aria-hidden />
          </button>
          <div className="px-5 flex items-center gap-3">
            <button type="button" onClick={onBack} aria-label={t('destPlanner.back')} className="w-9 h-9 rounded-full bg-white ring-1 ring-[#e6edf2] grid place-items-center shrink-0">
              <ChevronRight className="ltr:-scale-x-100" size={18} strokeWidth={2.6} aria-hidden />
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-[17px] font-black tracking-tight truncate text-[#0e1419] leading-tight">{destinationLabel}</div>
              <div className="text-[12.5px] font-bold text-slate-500 truncate">
                <span className="font-extrabold text-sky-600">{t('destPlanner.eyebrow')}</span>
                {plan.shortestKm != null && <> · {t('destPlanner.fromYou', { km: (Math.round(plan.shortestKm * 10) / 10).toFixed(1) })}</>}
              </div>
            </div>
          </div>
        </motion.div>

        <div className="px-5 mt-2.5 grid grid-cols-3 gap-2" role="tablist" aria-label={t('destPlanner.modes')}>
          {PLANNER_MODES.map((m) => {
            const Icon = MODE_ICON[m];
            const active = m === mode;
            const min = plan.minutes[m];
            return (
              <button key={m} type="button" role="tab" aria-selected={active} onClick={() => plan.setMode(m)}
                className={`h-11 rounded-2xl flex items-center justify-center gap-1.5 font-extrabold ${active ? 'bg-[#0e1419] text-white' : 'bg-white text-[#0e1419] ring-1 ring-[#e6edf2]'}`}>
                <span className="inline-flex items-center gap-1 text-[13px]"><Icon size={14} strokeWidth={2.4} aria-hidden />{modeLabel(m)}</span>
                <span className={`text-[12px] ${active ? 'text-white/80' : 'text-slate-500'}`}>{min != null ? t('destPlanner.minutes', { n: min }) : '—'}</span>
              </button>
            );
          })}
        </div>

        {expanded && visiblePrefs.length > 0 && (
          <div className="px-5 mt-3 flex gap-2 overflow-x-auto no-scrollbar" aria-label={t('destPlanner.prefs')}>
            {visiblePrefs.map((p) => {
              const active = plan.preference === p;
              return (
                <button key={p} type="button" aria-pressed={active} onClick={() => plan.togglePreference(p)}
                  className={`h-8 px-3 rounded-full text-[12.5px] font-extrabold whitespace-nowrap inline-flex items-center gap-1.5 shrink-0 ${
                    active ? 'bg-[#eef8fc] text-sky-700 ring-2 ring-[#00baf7]' : 'bg-white text-[#0e1419] ring-1 ring-[#e6edf2]'}`}>
                  {prefLabel(p)}
                </button>
              );
            })}
          </div>
        )}

        {!expanded && plan.status === 'ready' && selected && (
          <div className="px-5 mt-2.5">
            <PlannerSelectedRow option={selected} mode={mode} optionCount={options.length} onExpand={() => setExpanded(true)} />
          </div>
        )}

        {expanded && (
        <div className="px-5 mt-4 flex items-baseline justify-between">
          {plan.status === 'ready' && (
            <>
              <span className="text-[15px] font-black text-[#0e1419]">{t('destPlanner.options.title', { count: options.length })}</span>
              <span className="text-[12px] font-bold text-slate-500">{t('destPlanner.options.byMode', { mode })}</span>
            </>
          )}
        </div>
        )}

        <div className={`px-5 mt-2 flex-1 overflow-y-auto flex flex-col gap-3 ${expanded || plan.status !== 'ready' ? 'pb-3' : 'hidden'}`}>
          {plan.status === 'loading' && (
            <div className="bg-white rounded-[18px] px-3.5 py-3 ring-1 ring-[rgba(14,27,42,0.06)]" aria-busy="true">
              <div className="text-[13px] font-extrabold text-slate-500">{t('destPlanner.loading')}</div>
            </div>
          )}
          {plan.status === 'empty' && (
            <div className="bg-white rounded-[22px] p-4 ring-1 ring-[rgba(14,27,42,0.06)]">
              <div className="text-[15px] font-black text-[#0e1419]">{t('destPlanner.empty.title')}</div>
              <div className="text-[13px] font-bold text-slate-500 mt-1">{t('destPlanner.empty.hint')}</div>
            </div>
          )}
          {expanded && plan.status === 'ready' && options.map((o) => (
            <PlannerRouteCard key={o.id} option={o} mode={mode} fountains={plan.fountains}
              selected={o.id === selected?.id} onSelect={() => plan.setSelectedId(o.id)} />
          ))}
        </div>

        <div className="px-5 pt-2.5 pb-4">
          <button type="button" disabled={!selected || plan.status !== 'ready'} onClick={() => selected && onStart(selected.route, mode)}
            className="w-full h-[52px] rounded-full bg-gradient-to-br from-[#00baf7] to-[#0cf2e3] text-[#04222b] text-[16px] font-extrabold disabled:opacity-50 shadow-[0_10px_26px_-12px_rgba(0,186,247,0.7)]">
            {selected ? t('destPlanner.cta', { mode, min: selected.route.duration }) : t('destPlanner.ctaNoMin', { mode })}
          </button>
        </div>
      </div>
    </div>
  );
}
