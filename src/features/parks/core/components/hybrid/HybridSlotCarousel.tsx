'use client';

/**
 * HybridSlotCarousel — the map's "מה עושים היום?" slot layer (Phase 1).
 *
 * A floating, scale-fade horizontal carousel of resolver-produced slots
 * (hybrid-slots.ts → resolveSlots). Mirrors the home carousel's scale-fade
 * motion (WorkoutSelectionCarousel) and reuses the shared DifficultyBolts (⚡)
 * and ShimmerPhraseButton ("הרכב אימון בעצמי"). Presentational only — all
 * behaviour is delegated via props to DiscoverLayer:
 *   • select a slot     → onSelectSlot(slot)   (hybrid → compose→overview; aerobic_quick → start now)
 *   • build yourself     → onBuildYourself()    (opens the existing FreeRunDrawer)
 *   • change activity    → onActivityChange(k)  (re-runs resolveSlots upstream)
 *
 * Floats over the LIVE map: outer layer is pointer-events-none, interactive
 * bits opt back in. Shares the z-[100] free-run overlay tier with
 * HybridOverviewScreen (mutually exclusive freeRunStep — no new z-index value).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, type PanInfo } from 'framer-motion';
import { ArrowRight, Play } from 'lucide-react';
import DifficultyBolts from '@/features/workout-engine/components/DifficultyBolts';
import ShimmerPhraseButton from '@/components/ui/ShimmerPhraseButton';
import RouteCardUnified from '@/features/parks/core/components/RouteCardUnified';
import { UNIFIED_ROUTE_CARDS_ENABLED, MAP_OVERVIEW_CHROME_V1 } from '@/config/feature-flags';
import type { HybridSlot } from '@/features/workout-engine/hybrid/hybrid-slots';
import type { AerobicKind } from '@/features/workout-engine/hybrid/compose-hybrid-session.service';
import { setOnboardingPref } from '@/lib/onboardingPrefs';
import {
  ROUTE_STOPS_DURATION_KEY,
  ROUTE_STOPS_DURATION_CHOICES,
  readRememberedRouteStopsDuration,
} from './route-stops-duration.util';

// When the unified-cards flag is on, the slot card matches ROUTE_CARD_WIDTH
// (85vw / max 340px) and is content-height; otherwise the legacy slot dims.
const CARD_MAX_W = UNIFIED_ROUTE_CARDS_ENABLED ? 340 : 300;
const CARD_VW = UNIFIED_ROUTE_CARDS_ENABLED ? 85 : 78;
const CARD_HEIGHT = 190; // legacy slot-card height (flag off); unified = content-height
const GAP = 12;
const ACTIVE_SCALE = 1.0;
const SIDE_SCALE = 0.9;

const BRAND = '#00ADEF';
const CTA_GRADIENT = 'linear-gradient(to left, #0CF2E3, #00BAF7)';

// ── Route-stops duration chips (15/30/45 min) ───────────────────────────────
// Constants + durable "remember my last pick" logic live in route-stops-duration.util.ts
// (a pure .ts file, unit-testable — this file has no JSX-test precedent to rely on).

/** Local, unexported — same "one-off pill, no shared component" pattern as FreeRunDrawer's Pill. */
function DurationChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="text-[12px] font-bold rounded-full transition-colors"
      style={{
        padding: '4px 12px',
        border: active ? 'none' : '1px solid #E0E9FF',
        background: active ? BRAND : '#FFFFFF',
        color: active ? '#FFFFFF' : '#6B7280',
      }}
    >
      {children}
    </button>
  );
}

function RouteStopsDurationChips({ valueMin, onChange }: { valueMin: number; onChange: (min: number) => void }) {
  return (
    <div
      className="flex items-center justify-center gap-2 pointer-events-auto"
      style={{ marginTop: 8 }}
      dir="rtl"
    >
      {ROUTE_STOPS_DURATION_CHOICES.map((min) => (
        <DurationChip key={min} active={valueMin === min} onClick={() => onChange(min)}>
          {min} דק׳
        </DurationChip>
      ))}
    </div>
  );
}

const ENTRY_PHRASES = [
  'מה עושים היום? ✨',
  'בא לך לזוז? יש לי רעיון ✨',
  'תנועה + כוח, בדרך שלך ✨',
];

type CarouselActivity = AerobicKind | 'cycling';

// ── Activity toggle (walk / run · cycling = "בקרוב") ─────────────────────────
function ActivityToggle({
  activity,
  onChange,
}: {
  activity: AerobicKind;
  onChange: (k: AerobicKind) => void;
}) {
  const items: { key: CarouselActivity; label: string; emoji: string; soon?: boolean }[] = [
    { key: 'walking', label: 'הליכה', emoji: '🚶' },
    { key: 'running', label: 'ריצה', emoji: '🏃' },
    { key: 'cycling', label: 'בקרוב', emoji: '🚴', soon: true },
  ];
  return (
    <div className="flex items-center justify-center gap-2 mb-2 pointer-events-auto" dir="rtl">
      {items.map((it) => {
        const active = !it.soon && it.key === activity;
        return (
          <button
            key={it.key}
            type="button"
            disabled={it.soon}
            onClick={() => !it.soon && onChange(it.key as AerobicKind)}
            className="flex items-center gap-1.5 rounded-full text-[12.5px] font-black transition-all active:scale-95"
            style={{
              padding: '6px 13px',
              background: active ? `${BRAND}14` : 'rgba(255,255,255,0.92)',
              border: `1.5px solid ${active ? BRAND : 'transparent'}`,
              color: it.soon ? '#9CA3AF' : active ? BRAND : '#374151',
              opacity: it.soon ? 0.65 : 1,
              boxShadow: '0 2px 10px rgba(0,0,0,.06)',
              backdropFilter: 'blur(6px)',
            }}
          >
            <span aria-hidden>{it.emoji}</span>{it.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Single slot card ─────────────────────────────────────────────────────────
// Compose fires ONLY from the CTA, and ONLY when THIS card's CTA was the one that
// received the pointerdown (onArm sets the carousel's armed slot-id; consumeArmed
// checks + clears it). This rejects: (a) ghost clicks — a click whose pointerdown
// landed on the on-map entry button before this card mounted; (b) cross-card arms
// — pointerdown on card A must not let a click on card B fire (id match); (c) stale
// arms from a carousel drag — the track's onDragStart clears the armed id. The card
// body is NOT clickable (compose is a deliberate CTA action, never a body/auto tap).
function SlotCard({ slot, onSelect, onArm, consumeArmed, isActive }: {
  slot: HybridSlot;
  onSelect: () => void;
  onArm: () => void;
  consumeArmed: () => boolean;
  isActive: boolean;
}) {
  // Unified text-only card (flag-gated). Reuses the shared RouteCardUnified so
  // the slot matches the discover/aerobic cards. The anti-ghost-click arming
  // (onArm/consumeArmed) is preserved verbatim on the CTA.
  if (UNIFIED_ROUTE_CARDS_ENABLED) {
    return (
      <RouteCardUnified
        name={slot.title}
        subtitle={slot.subtitle}
        difficulty={slot.bolts}
        isActive={isActive}
        onCtaPointerDown={onArm}
        onCta={(e) => {
          e.stopPropagation();
          const armed = consumeArmed();
          // eslint-disable-next-line no-console
          console.log('[compose-trigger]', 'cta', slot.kind, slot.id, 'armed=', armed);
          if (!armed) return;
          onSelect();
        }}
        ctaContent={
          <>
            {slot.kind === 'aerobic_quick' ? <Play size={16} /> : null}
            {slot.kind === 'aerobic_quick' ? 'יוצאים מיד' : 'צא לדרך'}
          </>
        }
      />
    );
  }

  return (
    <div
      className="relative w-full h-full bg-white overflow-hidden flex flex-col justify-between"
      style={{
        borderRadius: 20,
        border: '0.5px solid #E0E9FF',
        boxShadow: '0 6px 22px rgba(0,0,0,0.1)',
        padding: '16px 18px 14px',
      }}
      dir="rtl"
    >
      <div>
        <div className="flex items-center gap-2">
          <span className="text-[17px] font-black" style={{ color: '#111827' }}>{slot.title}</span>
          {slot.recommended && (
            <span className="text-[11px] font-black rounded-full" style={{ color: slot.accent, background: `${slot.accent}18`, padding: '2px 8px' }}>
              מומלץ
            </span>
          )}
        </div>
        <div className="text-[13px] font-semibold mt-1" style={{ color: '#6B7280' }}>{slot.subtitle}</div>

        <div className="mt-3 inline-flex items-center rounded-lg" style={{ border: '0.5px solid #E0E9FF', boxShadow: '0 2px 12px rgba(0,0,0,.05)', padding: '4px 10px' }}>
          <DifficultyBolts difficulty={slot.bolts} size="sm" />
        </div>
      </div>

      {/* CTA — the ONLY trigger for compose / start */}
      <button
        type="button"
        onPointerDown={onArm}
        onClick={(e) => {
          e.stopPropagation();
          const armed = consumeArmed();
          // eslint-disable-next-line no-console
          console.log('[compose-trigger]', 'cta', slot.kind, slot.id, 'armed=', armed);
          if (!armed) return; // ghost / cross-card / stale-drag click → ignore
          onSelect();
        }}
        className="w-full flex items-center justify-center gap-2 text-white text-[14px] font-black rounded-full active:scale-[0.97] transition-transform"
        style={{ height: 44, background: CTA_GRADIENT }}
      >
        {slot.kind === 'aerobic_quick' ? <Play size={16} /> : null}
        {slot.kind === 'aerobic_quick' ? 'יוצאים מיד' : 'צא לדרך'}
      </button>
    </div>
  );
}

// ── Loading skeleton ─────────────────────────────────────────────────────────
function SlotSkeleton() {
  return (
    <div className="w-full flex justify-center pointer-events-none" style={{ height: CARD_HEIGHT }}>
      <div className="bg-white animate-pulse" style={{ width: `min(${CARD_MAX_W}px, ${CARD_VW}vw)`, height: CARD_HEIGHT, borderRadius: 20, border: '0.5px solid #E0E9FF' }} />
    </div>
  );
}

interface HybridSlotCarouselProps {
  slots: HybridSlot[];
  loading?: boolean;
  aerobicKind: AerobicKind;
  onActivityChange: (k: AerobicKind) => void;
  onSelectSlot: (slot: HybridSlot) => void;
  onBuildYourself: () => void;
  onClose?: () => void;
  /**
   * READ-ONLY preview channel — fired ~300ms after the carousel SETTLES on a
   * card (drag-end / tap / dot), never mid-swipe. Separate from the CTA (which
   * owns compose→overview): the consumer composes + draws the settled slot's
   * route on the map. No-op when omitted → byte-identical.
   */
  onSettleSlot?: (slot: HybridSlot) => void;
  /** Subtle "computing route…" chip above the cards (cards stay interactive). */
  computingPreview?: boolean;
}

export default function HybridSlotCarousel({
  slots,
  loading = false,
  aerobicKind,
  onActivityChange,
  onSelectSlot,
  onBuildYourself,
  onClose,
  onSettleSlot,
  computingPreview = false,
}: HybridSlotCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [cardW, setCardW] = useState(CARD_MAX_W);
  const [viewportW, setViewportW] = useState(390);
  // route_stops duration chips (15/30/45): lazy-init from the durable "last pick" pref,
  // defaulting to 30min on first-ever use. Read once on mount — the initializer runs
  // synchronously (localStorage), so the FIRST render already reflects the remembered choice.
  const [routeStopsDurationMin, setRouteStopsDurationMin] = useState<number>(readRememberedRouteStopsDuration);
  // Which card's CTA received the most recent pointerdown (by slot.id, or null).
  // Single source of truth for "armed" — matched per card, cleared on drag-start.
  const armedSlotIdRef = useRef<string | null>(null);

  useEffect(() => {
    const sync = () => {
      setCardW(Math.min(CARD_MAX_W, (window.innerWidth * CARD_VW) / 100));
      if (viewportRef.current) setViewportW(viewportRef.current.offsetWidth);
    };
    sync();
    const ro = new ResizeObserver(sync);
    if (viewportRef.current) ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, []);

  // Keep the active index valid when the slot set changes (activity toggle).
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, slots.length - 1)));
  }, [slots.length]);

  // ── Preview-on-settle ──────────────────────────────────────────────────────
  // Fire onSettleSlot ~300ms after the carousel rests on a card. Every change to
  // activeIndex (drag-end / card tap / dot) resets the timer, so a fast swipe
  // through several cards fires ONCE — at the destination — never mid-swipe. Ref
  // holds the latest handler so the effect keys only on [activeIndex, slots]
  // (a re-created handler must not re-fire the debounce). Runs on mount too →
  // index 0 (the recommended slot) auto-previews the instant the layer opens.
  const onSettleSlotRef = useRef(onSettleSlot);
  onSettleSlotRef.current = onSettleSlot;
  useEffect(() => {
    if (!onSettleSlotRef.current) return;
    const slot = slots[activeIndex];
    if (!slot) return;
    const t = setTimeout(() => onSettleSlotRef.current?.(slot), 300);
    return () => clearTimeout(t);
  }, [activeIndex, slots]);

  const stride = cardW + GAP;
  const centerX = viewportW / 2 - cardW / 2;
  const trackX = centerX - activeIndex * stride;
  const lastIndex = Math.max(0, slots.length - 1);

  const handleSelect = useCallback((idx: number) => {
    setActiveIndex(Math.max(0, Math.min(lastIndex, idx)));
  }, [lastIndex]);

  const handleDragEnd = useCallback((_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x < -40) handleSelect(activeIndex + 1);
    else if (info.offset.x > 40) handleSelect(activeIndex - 1);
  }, [activeIndex, handleSelect]);

  return (
    <div className="absolute inset-0 z-[100] pointer-events-none flex flex-col justify-end" dir="rtl">
      {/* back / close */}
      {onClose && (
        <div className="flex justify-start px-4 mb-2 pointer-events-none">
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            className="w-9 h-9 rounded-full bg-white shadow-lg flex items-center justify-center active:scale-90 transition-transform pointer-events-auto"
          >
            <ArrowRight size={17} className="text-gray-600" />
          </button>
        </div>
      )}

      <ActivityToggle activity={aerobicKind} onChange={onActivityChange} />

      {/* computing-preview chip — subtle, non-blocking (cards stay interactive) */}
      {computingPreview && (
        <div className="flex justify-center mb-1 pointer-events-none">
          <div
            className="flex items-center gap-1.5 rounded-full text-[11.5px] font-black animate-pulse"
            style={{ padding: '4px 12px', background: 'rgba(255,255,255,0.92)', color: BRAND, boxShadow: '0 2px 10px rgba(0,0,0,.06)', backdropFilter: 'blur(6px)' }}
          >
            <span aria-hidden>✨</span> מחשב מסלול…
          </div>
        </div>
      )}

      {/* carousel */}
      <div ref={viewportRef} className="overflow-hidden w-full" style={{ height: UNIFIED_ROUTE_CARDS_ENABLED ? undefined : CARD_HEIGHT + 16 }}>
        {loading ? (
          <div className="pt-2"><SlotSkeleton /></div>
        ) : (
          <motion.div
            className="flex flex-row items-center"
            style={{ gap: GAP, paddingTop: 8, paddingBottom: 8, direction: 'ltr' }}
            animate={{ x: trackX }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            drag="x"
            dragConstraints={{ left: centerX - lastIndex * stride, right: centerX }}
            dragElastic={0.1}
            // Tap-vs-drag (MAP_OVERVIEW_CHROME_V1): the old onDragStart-disarm fired on
            // ANY micro-drag, so a CTA tap with a few px of jitter was rejected — worse on
            // non-first cards (e.g. full_park) that need a swipe to reach. Disarm ONLY past
            // a ~10px REAL-drag threshold; a tap stays armed → onSelect fires. Paging is
            // untouched (onDragEnd still pages at >40px). Flag OFF = the original behaviour.
            onDragStart={MAP_OVERVIEW_CHROME_V1 ? undefined : () => { armedSlotIdRef.current = null; }}
            onDrag={
              MAP_OVERVIEW_CHROME_V1
                ? (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
                    if (Math.abs(info.offset.x) > 10) armedSlotIdRef.current = null;
                  }
                : undefined
            }
            onDragEnd={handleDragEnd}
          >
            {slots.map((slot, i) => {
              const isActive = i === activeIndex;
              return (
                <motion.div
                  key={slot.id}
                  className="flex-shrink-0 pointer-events-auto"
                  style={{ width: cardW, height: UNIFIED_ROUTE_CARDS_ENABLED ? undefined : CARD_HEIGHT }}
                  // When unified, RouteCardUnified owns the active ring/scale/opacity,
                  // so the wrapper must not double-apply the legacy scale-fade.
                  animate={
                    UNIFIED_ROUTE_CARDS_ENABLED
                      ? { scale: 1, opacity: 1, zIndex: isActive ? 20 : 0 }
                      : { scale: isActive ? ACTIVE_SCALE : SIDE_SCALE, opacity: isActive ? 1 : 0.7, zIndex: isActive ? 20 : 0 }
                  }
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  onClick={() => !isActive && handleSelect(i)}
                >
                  <SlotCard
                    slot={slot}
                    isActive={isActive}
                    onSelect={() => {
                      // route_stops only: inject the CURRENT chip-selected duration (not the
                      // resolveSlots-time default) so this session's targetKm reflects the
                      // user's live pick, all the way through deriveAerobicTargetKm →
                      // resolveRouteStopsBackbone → idealWaypointDistanceKm (P6, unchanged).
                      const finalSlot = (slot.kind === 'hybrid' && slot.id === 'route_stops')
                        ? { ...slot, timeBudgetMin: routeStopsDurationMin }
                        : slot;
                      onSelectSlot(finalSlot);
                    }}
                    onArm={() => { armedSlotIdRef.current = slot.id; }}
                    consumeArmed={() => {
                      const ok = armedSlotIdRef.current === slot.id;
                      armedSlotIdRef.current = null;
                      return ok;
                    }}
                  />
                  {slot.id === 'route_stops' && (
                    <RouteStopsDurationChips
                      valueMin={routeStopsDurationMin}
                      onChange={(min) => {
                        setRouteStopsDurationMin(min);
                        setOnboardingPref(ROUTE_STOPS_DURATION_KEY, String(min));
                      }}
                    />
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* pagination dots */}
      {!loading && slots.length > 1 && (
        <div className="flex justify-center items-center gap-2 mt-1 mb-1 pointer-events-none">
          {slots.map((s, i) => (
            <button
              key={s.id}
              aria-label={`סלוט ${i + 1}`}
              onClick={() => handleSelect(i)}
              className="rounded-full transition-all pointer-events-auto"
              style={{ width: i === activeIndex ? 16 : 6, height: 6, background: i === activeIndex ? BRAND : 'rgba(0,173,239,0.28)', border: 'none', padding: 0 }}
            />
          ))}
        </div>
      )}

      {/* build-yourself escape hatch */}
      <div className="pointer-events-auto pb-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}>
        <ShimmerPhraseButton
          messages={['⚙️ הרכב אימון בעצמי']}
          onTap={onBuildYourself}
          className="px-4 pt-1"
        />
      </div>
    </div>
  );
}

/** Rotating phrases for the on-map entry button (consumed by DiscoverLayer). */
export { ENTRY_PHRASES };
