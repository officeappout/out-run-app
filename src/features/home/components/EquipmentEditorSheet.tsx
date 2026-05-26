'use client';

/**
 * EquipmentEditorSheet — standalone post-onboarding equipment editor.
 *
 * Opens as a bottom sheet. Loads gear definitions from Firestore
 * (same source as EquipmentStep in onboarding). Saves the selected
 * home-equipment IDs back to `users/{uid}.equipment.home`.
 *
 * Design decisions:
 *   - Independent of useOnboardingStore — safe to open from Settings.
 *   - Initialises from profile.equipment.home on every open.
 *   - Writes only on explicit "שמור" tap — no auto-save.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Check, ChevronRight } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useUserStore } from '@/features/user';
import { getAllGearDefinitions, type GearDefinition } from '@/features/content/equipment/gear';
import { getUserFromFirestore } from '@/lib/firestore.service';
import { useToast } from '@/components/ui/Toast';

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// ── Identical SVG map to EquipmentStep (keeps icon parity) ──────────────────
const EQUIPMENT_SVG_MAP: Record<string, string> = {
  rings:                  '/assets/icons/equipment/rings.svg',
  gymnastic_rings:        '/assets/icons/equipment/rings.svg',
  ring_park:              '/assets/icons/equipment/ring_park.svg',
  bands:                  '/assets/icons/equipment/long_resistance_band.svg',
  resistance_band:        '/assets/icons/equipment/long_resistance_band.svg',
  resistance_bands:       '/assets/icons/equipment/long_resistance_band.svg',
  long_resistance_band:   '/assets/icons/equipment/long_resistance_band.svg',
  pull_up_bar:            '/assets/icons/equipment/pullupbar_park.svg',
  pullup_bar:             '/assets/icons/equipment/pullupbar_park.svg',
  pullUpBar:              '/assets/icons/equipment/pullupbar_park.svg',
  pullupbar_park:         '/assets/icons/equipment/pullupbar_park.svg',
  pullup_bar_park:        '/assets/icons/equipment/pullupbar_park.svg',
  pullup_bar_door:        '/assets/icons/equipment/pullup_bar_door.svg',
  dip_station:            '/assets/icons/equipment/parallel_bars.svg',
  parallettes:            '/assets/icons/equipment/parallel_bars.svg',
  parallel_bars:          '/assets/icons/equipment/parallel_bars.svg',
  parallel_bars_home:     '/assets/icons/equipment/parallel_bars_home.svg',
  trx:                    '/assets/icons/equipment/trx.svg',
};

const CATEGORY_NAMES: Record<string, string> = {
  suspension:  'תלייה',
  resistance:  'התנגדות',
  weights:     'משקולות',
  stationary:  'סטטי',
  accessories: 'אביזרים',
  cardio:      'קרדיו',
  other:       'אחר',
};

function getSvgPath(gear: GearDefinition): string | null {
  if (EQUIPMENT_SVG_MAP[gear.id]) return EQUIPMENT_SVG_MAP[gear.id];
  const en = (gear.name?.en ?? '').toLowerCase();
  const he = (gear.name?.he ?? '').toLowerCase();
  if (en.includes('ring') || he.includes('טבעות')) return EQUIPMENT_SVG_MAP.rings;
  if (en.includes('band') || en.includes('resistance') || he.includes('גומי')) return EQUIPMENT_SVG_MAP.resistance_bands;
  if ((en.includes('pull') && en.includes('bar')) || he.includes('מתח')) return EQUIPMENT_SVG_MAP.pull_up_bar;
  if (en.includes('parallel') || en.includes('dip') || he.includes('מקביל')) return EQUIPMENT_SVG_MAP.dip_station;
  if (en.includes('trx') || he.includes('trx')) return EQUIPMENT_SVG_MAP.trx;
  return null;
}

function GearIcon({ gear, isSelected }: { gear: GearDefinition; isSelected: boolean }) {
  const svgPath = getSvgPath(gear);
  if (svgPath) {
    return (
      <img
        src={svgPath}
        alt=""
        className={`w-6 h-6 object-contain transition-opacity ${isSelected ? 'opacity-100' : 'opacity-40'}`}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }
  const en = (gear.name?.en ?? '').toLowerCase();
  const he = (gear.name?.he ?? '').toLowerCase();
  let emoji = '🏋️';
  if (en.includes('mat') || he.includes('מזרן')) emoji = '🧘';
  else if (en.includes('bench') || he.includes('ספסל')) emoji = '🪑';
  else if (en.includes('kettlebell') || he.includes('קטלבל')) emoji = '🔔';
  else if (en.includes('rope') || he.includes('חבל')) emoji = '⏱️';
  else if (en.includes('roller') || he.includes('רולר')) emoji = '🧴';
  return <span className="text-lg">{emoji}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function EquipmentEditorSheet({ isOpen, onClose }: Props) {
  const { profile } = useUserStore();
  const { showToast } = useToast();

  const [allGear, setAllGear] = useState<GearDefinition[]>([]);
  const [gearLoading, setGearLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // ── Load gear definitions once on first open ─────────────────────────────
  useEffect(() => {
    if (!isOpen || allGear.length > 0) return;
    setGearLoading(true);
    getAllGearDefinitions()
      .then(setAllGear)
      .catch((err) => console.error('[EquipmentEditor] getAllGearDefinitions failed:', err))
      .finally(() => setGearLoading(false));
  }, [isOpen, allGear.length]);

  // ── Initialise selection from profile on each open ───────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const homeIds = profile?.equipment?.home ?? [];
    setSelectedIds([...homeIds]);
  }, [isOpen, profile?.equipment?.home]);

  // ── Group gear by category ───────────────────────────────────────────────
  const groupedGear = useMemo(() => {
    const groups: Record<string, GearDefinition[]> = {};
    for (const g of allGear) {
      const cat = g.category ?? 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(g);
    }
    return groups;
  }, [allGear]);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  // ── Save to Firestore ────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const uid = auth.currentUser?.uid ?? profile?.id;
    if (!uid) return;
    setSaving(true);
    console.log('[Settings][Firestore] → equipment.home =', selectedIds);
    try {
      await updateDoc(doc(db, 'users', uid), { 'equipment.home': selectedIds });
      console.log('[Settings][Firestore] ✓ equipment.home saved');
      // Refresh profile store
      const fresh = await getUserFromFirestore(uid);
      if (fresh) useUserStore.setState({ profile: fresh });
      showToast('success', 'הציוד עודכן בהצלחה');
      onClose();
    } catch (err) {
      console.error('[Settings][Firestore] ✗ equipment.home write failed:', err);
      showToast('error', 'שגיאה בשמירת הציוד');
    } finally {
      setSaving(false);
    }
  }, [selectedIds, profile?.id, onClose, showToast]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  const selectedCount = selectedIds.length;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="equip-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-sm"
        >
          <motion.div
            key="equip-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-t-3xl shadow-2xl w-full max-w-md max-h-[88vh] flex flex-col"
            dir="rtl"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-5 py-3 flex items-center justify-between z-10 flex-shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-gray-900 font-simpler">הציוד שלי</h2>
                {selectedCount > 0 && (
                  <span className="text-xs font-bold bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full">
                    {selectedCount} נבחרו
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {gearLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 size={28} className="animate-spin text-cyan-400" />
                  <p className="text-sm text-gray-400 font-simpler">טוען ציוד...</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-gray-400 font-simpler">
                    בחר את הציוד הזמין לך לאימון. הבחירה משפיעה על תוכניות האימון שלך.
                  </p>

                  {/* "אין לי ציוד" quick-clear option */}
                  <button
                    type="button"
                    onClick={() => setSelectedIds([])}
                    className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-right ${
                      selectedCount === 0
                        ? 'border-cyan-400 bg-cyan-50'
                        : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      selectedCount === 0 ? 'bg-cyan-100' : 'bg-gray-100'
                    }`}>
                      <span className="text-xl">🤸</span>
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-bold font-simpler ${
                        selectedCount === 0 ? 'text-cyan-700' : 'text-gray-700'
                      }`}>
                        אין לי ציוד
                      </p>
                      <p className="text-xs text-gray-400 font-simpler">מתאמן ללא אביזרים</p>
                    </div>
                    {selectedCount === 0 && (
                      <Check size={16} className="text-cyan-500 flex-shrink-0" />
                    )}
                  </button>

                  {/* Gear groups */}
                  {Object.entries(groupedGear).map(([category, items]) => (
                    <div key={category}>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 font-simpler">
                        {CATEGORY_NAMES[category] ?? category}
                      </p>
                      <div className="grid grid-cols-2 gap-2.5">
                        {items.map((gear) => {
                          const isSelected = selectedIds.includes(gear.id);
                          const name = gear.name?.he ?? gear.name?.en ?? gear.id;
                          return (
                            <button
                              key={gear.id}
                              type="button"
                              onClick={() => toggle(gear.id)}
                              className={`flex items-center justify-between p-3 rounded-2xl border-2 transition-all h-14 text-right ${
                                isSelected
                                  ? 'bg-cyan-50 border-cyan-400 shadow-sm shadow-cyan-100'
                                  : 'bg-gray-50 border-transparent hover:border-gray-200'
                              }`}
                            >
                              <span className={`text-sm font-simpler leading-tight ${
                                isSelected ? 'font-bold text-cyan-700' : 'font-medium text-gray-700'
                              }`}>
                                {name}
                              </span>
                              <GearIcon gear={gear} isSelected={isSelected} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Footer save button */}
            <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 bg-white">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || gearLoading}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white rounded-2xl text-sm font-bold font-simpler transition-colors active:scale-[0.98]"
              >
                {saving ? (
                  <><Loader2 size={16} className="animate-spin" /><span>שומר...</span></>
                ) : (
                  <><ChevronRight size={16} /><span>שמור שינויים</span></>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
