'use client';

/**
 * EquipmentFilterSheet — "Smart Equipment & Location" filter.
 *
 * Layout (RTL, top → bottom):
 *   1. Preset row — 3 segmented shortcuts: [בית | פארק | חדר כושר].
 *      Tapping a preset auto-selects the gear that fits that location:
 *        • בית     → Bodyweight + Section B (improvised)
 *        • פארק    → Bodyweight + Section A (park / stationary)
 *        • חדר כושר → Bodyweight + ALL gear (every section)
 *      The preset is purely a shortcut: after tapping, the user can still
 *      toggle individual chips on/off ("granular control").
 *   2. Bodyweight chip — universal calisthenics toggle (sentinel ID).
 *   3. Section A · ציוד פארק       (gear.category === 'stationary')
 *   4. Section B · ציוד מאולתר/ביתי (gear.category === 'improvised')
 *   5. Section C · ציוד אישי        (everything else)
 *
 * Categorization rationale:
 *   The Firestore `category` field is the physical type (suspension,
 *   resistance, weights, stationary, accessories, cardio, improvised). We
 *   collapse 7 categories into 3 location-relevant buckets:
 *     • stationary  → Park (mounted/anchored: pull-up bar, dips, parallels)
 *     • improvised  → Home (chair, wall, towel — "things you already have")
 *     • everything else → Personal (gear someone owns and brings along)
 *
 * State model:
 *   • Local `draftSelection: Set<string>` — the user stages choices here.
 *     Includes BODYWEIGHT_SENTINEL when the bodyweight chip is on.
 *   • Apply commits to `useExerciseLibraryStore.setEquipmentIds(...)`.
 *   • Active preset is derived from the draft (not stored) so it stays
 *     accurate even after manual chip toggles deviate from a preset.
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Home, MapPin, Building, PersonStanding } from 'lucide-react';
import { getAllGearDefinitions } from '@/features/content/equipment/gear/core/gear-definition.service';
import type { GearDefinition } from '@/features/content/equipment/gear/core/gear-definition.types';
import {
  useExerciseLibraryStore,
  BODYWEIGHT_SENTINEL,
} from '../store/useExerciseLibraryStore';
import {
  resolveEquipmentSvgPathList,
  ensureEquipmentCachesLoaded,
} from '@/features/workout-engine/shared/utils/gear-mapping.utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type PresetId = 'home' | 'park' | 'gym';

// ── Categorization helpers ──────────────────────────────────────────────
// Park = anchored / mounted gear (pull-up bar, dips, parallel bars).
function isParkGear(g: GearDefinition): boolean {
  if (g.category === 'stationary') return true;
  // Belt-and-braces fallback: a gear with no category but explicitly tagged
  // as a park-only item (e.g. legacy docs missing `category`).
  if (!g.category && g.defaultLocation === 'park') return true;
  return false;
}

// Improvised = "things you already have" at home.
function isImprovisedGear(g: GearDefinition): boolean {
  return g.category === 'improvised';
}

// Personal = brought-with-you gear (bands, weights, mat, jump rope, etc).
function isPersonalGear(g: GearDefinition): boolean {
  return !isParkGear(g) && !isImprovisedGear(g);
}

export default function EquipmentFilterSheet({ isOpen, onClose }: Props) {
  const filterIds = useExerciseLibraryStore((s) => s.filters.equipmentIds);
  const setEquipmentIds = useExerciseLibraryStore((s) => s.setEquipmentIds);

  // ── Lazy data sources ────────────────────────────────────────────────
  const [gear, setGear] = useState<GearDefinition[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [iconCacheVersion, setIconCacheVersion] = useState(0);

  // Portal mount guard (SSR-safe).
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Load the gear catalog the first time the sheet opens.
  useEffect(() => {
    if (!isOpen) return;
    if (gear.length > 0) return;
    let cancelled = false;
    getAllGearDefinitions()
      .then((list) => { if (!cancelled) setGear(list); })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : 'Failed to load gear');
      });
    return () => { cancelled = true; };
  }, [isOpen, gear.length]);

  // Warm the equipment-icon caches so chips render with their SVGs on first paint.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    ensureEquipmentCachesLoaded()
      .then(() => { if (!cancelled) setIconCacheVersion((v) => v + 1); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isOpen]);

  // ── Draft selection — initialized from current filter on each open ──
  const [draft, setDraft] = useState<Set<string>>(() => new Set(filterIds));
  useEffect(() => {
    if (isOpen) setDraft(new Set(filterIds));
  }, [isOpen, filterIds]);

  // ── Derived: gear partitioned into 3 sections ────────────────────────
  const sections = useMemo(() => {
    const parkArr: GearDefinition[] = [];
    const improvisedArr: GearDefinition[] = [];
    const personalArr: GearDefinition[] = [];
    for (const g of gear) {
      if (isParkGear(g)) parkArr.push(g);
      else if (isImprovisedGear(g)) improvisedArr.push(g);
      else personalArr.push(g);
    }
    const cmp = (a: GearDefinition, b: GearDefinition) =>
      (a.name?.he || a.name?.en || a.id).localeCompare(
        b.name?.he || b.name?.en || b.id,
        'he',
      );
    parkArr.sort(cmp);
    improvisedArr.sort(cmp);
    personalArr.sort(cmp);
    return { park: parkArr, improvised: improvisedArr, personal: personalArr };
  }, [gear]);

  // Convenient ID sets per section — used by both presets and detection.
  const idSets = useMemo(() => {
    const park = new Set(sections.park.map((g) => g.id));
    const improvised = new Set(sections.improvised.map((g) => g.id));
    const personal = new Set(sections.personal.map((g) => g.id));
    const all = new Set<string>([
      ...park,
      ...improvised,
      ...personal,
    ]);
    return { park, improvised, personal, all };
  }, [sections]);

  // ── Active preset detection ──────────────────────────────────────────
  // A preset is "active" when the draft is exactly {sentinel + the section's
  // gear}. Any deviation (missing chip, extra chip, or gear from a different
  // section) demotes the indicator to "Custom".
  const activePreset: PresetId | null = useMemo(() => {
    if (gear.length === 0) return null;
    const has = (id: string) => draft.has(id);
    const wantsBW = has(BODYWEIGHT_SENTINEL);
    if (!wantsBW) return null;

    // Helper: is the draft equal to {sentinel} ∪ candidateIds?
    const matches = (ids: Set<string>) => {
      if (draft.size !== ids.size + 1) return false;
      for (const id of ids) if (!draft.has(id)) return false;
      return true;
    };
    if (matches(idSets.park)) return 'park';
    if (matches(idSets.improvised)) return 'home';
    if (matches(idSets.all)) return 'gym';
    return null;
  }, [draft, gear.length, idSets]);

  // ── Preset application (replaces the entire draft set) ──────────────
  const applyPreset = (preset: PresetId) => {
    const next = new Set<string>([BODYWEIGHT_SENTINEL]);
    if (preset === 'home') idSets.improvised.forEach((id) => next.add(id));
    else if (preset === 'park') idSets.park.forEach((id) => next.add(id));
    else /* gym */ idSets.all.forEach((id) => next.add(id));
    setDraft(next);
  };

  // ── Manual chip toggle (granular control after presets) ─────────────
  const toggle = (id: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Footer summary text ──────────────────────────────────────────────
  const summary = useMemo(() => {
    const totalChips = draft.size; // includes sentinel
    if (totalChips === 0) return 'לא נבחר ציוד — יוצגו כל התרגילים';
    if (activePreset === 'home') return 'ערכת בית · גוף + מאולתר';
    if (activePreset === 'park') return 'ערכת פארק · גוף + ציוד פארק';
    if (activePreset === 'gym') return 'ערכת חדר כושר · כל הציוד';
    const realGear = totalChips - (draft.has(BODYWEIGHT_SENTINEL) ? 1 : 0);
    if (realGear === 0) return 'משקל גוף בלבד';
    return `${realGear} פריטי ציוד נבחרו`;
  }, [draft, activePreset]);

  const apply = () => {
    setEquipmentIds(Array.from(draft));
    onClose();
  };
  const clear = () => {
    setDraft(new Set());
    setEquipmentIds([]);
    onClose();
  };

  // Use `iconCacheVersion` once so React doesn't tree-shake the dependency
  // (it's only here to force a re-render after the equipment cache loads).
  void iconCacheVersion;

  const sheet = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-[70]"
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => { if (info.offset.y > 120) onClose(); }}
            className="fixed bottom-0 left-0 right-0 z-[71] bg-white rounded-t-3xl shadow-drawer max-h-[85vh] flex flex-col"
            dir="rtl"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">ציוד ומיקום</h2>
              <button
                type="button"
                onClick={onClose}
                className="p-2 -me-2 text-gray-400 hover:text-gray-600 rounded-full"
                aria-label="סגור"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {/* ── Preset shortcuts ── */}
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                מקום אימון
              </p>
              <div className="grid grid-cols-3 gap-2 mb-5">
                <PresetButton
                  active={activePreset === 'home'}
                  onClick={() => applyPreset('home')}
                  icon={<Home size={18} />}
                  label="בית"
                />
                <PresetButton
                  active={activePreset === 'park'}
                  onClick={() => applyPreset('park')}
                  icon={<MapPin size={18} />}
                  label="פארק"
                />
                <PresetButton
                  active={activePreset === 'gym'}
                  onClick={() => applyPreset('gym')}
                  icon={<Building size={18} />}
                  label="חדר כושר"
                />
              </div>

              {/* ── Bodyweight (universal) ── */}
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                בסיס
              </p>
              <div className="mb-5">
                <Chip
                  active={draft.has(BODYWEIGHT_SENTINEL)}
                  onClick={() => toggle(BODYWEIGHT_SENTINEL)}
                  iconNode={<PersonStanding size={16} className="text-cyan-600" />}
                  label="משקל גוף"
                />
              </div>

              {loadError ? (
                <p className="text-sm text-red-600 text-center py-6">
                  שגיאה בטעינת הציוד
                </p>
              ) : gear.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  טוען ציוד...
                </p>
              ) : (
                <>
                  <Section
                    title="ציוד פארק"
                    items={sections.park}
                    draft={draft}
                    onToggle={toggle}
                  />
                  <Section
                    title="ציוד מאולתר / ביתי"
                    items={sections.improvised}
                    draft={draft}
                    onToggle={toggle}
                  />
                  <Section
                    title="ציוד אישי"
                    items={sections.personal}
                    draft={draft}
                    onToggle={toggle}
                  />
                </>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 bg-white">
              <p className="px-5 pt-3 text-[12px] font-semibold text-gray-500 text-center">
                {summary}
              </p>
              <div className="flex items-center gap-2 px-5 py-3">
                <button
                  type="button"
                  onClick={clear}
                  className="flex-1 py-2.5 rounded-lg text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  נקה
                </button>
                <button
                  type="button"
                  onClick={apply}
                  className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white bg-primary hover:opacity-90 transition-opacity"
                >
                  החל סינון
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (!mounted) return null;
  return createPortal(sheet, document.body);
}

// ── Sub-components ────────────────────────────────────────────────────

function PresetButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 transition-all ${
        active
          ? 'border-primary bg-primary/10 text-primary shadow-sm'
          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
      }`}
    >
      <span className={active ? 'text-primary' : 'text-gray-500'}>{icon}</span>
      <span className="text-xs font-bold leading-none">{label}</span>
    </button>
  );
}

function Section({
  title,
  items,
  draft,
  onToggle,
}: {
  title: string;
  items: GearDefinition[];
  draft: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
          {title}
        </p>
        <span className="text-[10px] text-gray-400">{items.length}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((g) => {
          const label = g.name?.he || g.name?.en || g.id;
          const svgPaths = resolveEquipmentSvgPathList(g.id);
          const iconSrc = svgPaths[0] ?? null;
          return (
            <Chip
              key={g.id}
              active={draft.has(g.id)}
              onClick={() => onToggle(g.id)}
              iconSrc={iconSrc}
              label={label}
            />
          );
        })}
      </div>
    </section>
  );
}

function Chip({
  active,
  onClick,
  iconSrc,
  iconNode,
  label,
}: {
  active: boolean;
  onClick: () => void;
  iconSrc?: string | null;
  iconNode?: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 ps-2.5 pe-3 py-1.5 rounded-full border text-xs font-bold transition-all ${
        active
          ? 'bg-primary/10 border-primary text-primary'
          : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
      }`}
    >
      {iconNode ?? (iconSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconSrc}
          alt=""
          width={16}
          height={16}
          className="object-contain flex-shrink-0"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
          }}
        />
      ) : (
        <span className="w-4 h-4 rounded-full bg-gray-100 flex-shrink-0" />
      ))}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}
