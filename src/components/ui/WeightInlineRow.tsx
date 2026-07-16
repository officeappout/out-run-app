'use client';

/**
 * WeightInlineRow — shared "enter your weight for accurate calories" nudge.
 *
 * Extracted from the inline copy in FreeRunDrawer (the calories goal tab) so it
 * can be reused wherever a weight-dependent calorie value is shown. Self-contained:
 * derives its gender default and persists via `useWeightNudge` (Zustand
 * updateProfile + fire-and-forget Firestore write — byte-identical to the
 * original FreeRunDrawer handler).
 *
 * NOTE: FreeRunDrawer still ships its own inline copy for now. Deduping it onto
 * this shared component belongs in the same follow-up batch that rolls CaloriesChip
 * out to the other calorie surfaces.
 */

import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

const ACCENT = '#00ADEF';

/**
 * Shared weight-nudge state + persistence. Reads the user's weight/gender and
 * exposes whether a weight is missing, the gender-based default, and a save fn.
 */
export function useWeightNudge() {
  const weight = useUserStore((s) => s.profile?.core?.weight ?? null);
  const gender = useUserStore((s) => s.profile?.core?.gender);
  const genderDefault = gender === 'female' ? 60 : gender === 'male' ? 75 : 68;
  // weight 0 / null / undefined all mean "not set" (matches profile-completion's `> 0`).
  const needsWeight = !weight || weight <= 0;

  const saveWeight = async (w: number) => {
    const currentCore = useUserStore.getState().profile?.core;
    if (currentCore) {
      useUserStore.getState().updateProfile({ core: { ...currentCore, weight: w } });
    }
    const uid = auth.currentUser?.uid;
    if (uid) {
      try {
        await updateDoc(doc(db, 'users', uid), { 'core.weight': w });
      } catch {
        // Non-blocking — local store already updated.
      }
    }
  };

  return { weight, needsWeight, genderDefault, saveWeight };
}

/**
 * Inline weight-entry card (30–200 kg, gender default). Calls `onSaved` after a
 * successful save. Presentational + its own persistence — no external wiring.
 */
export default function WeightInlineRow({ onSaved }: { onSaved?: () => void }) {
  const { genderDefault, saveWeight } = useWeightNudge();
  const [value, setValue] = useState(genderDefault);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const adjust = (delta: number) =>
    setValue((v) => Math.min(200, Math.max(30, v + delta)));

  const handleSave = async () => {
    if (saving || value < 30 || value > 200) return;
    setSaving(true);
    try {
      await saveWeight(value);
      setSaved(true);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  if (saved) return null;

  return (
    <div
      className="mt-3 rounded-2xl px-4 py-3.5"
      style={{ backgroundColor: '#F0F9FF', border: '1px solid #BAE6FD' }}
    >
      <p className="text-[12px] font-black text-gray-700 mb-0.5">⚖️ משקלך לחישוב מדויק</p>
      <p className="text-[11px] text-gray-400 leading-tight mb-2.5">
        עדיין לא הזנת משקל — הערך הנוכחי הוא ברירת מחדל. כדי שחישוב הקלוריות יהיה מדויק, שווה לעדכן.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => adjust(-1)}
          className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-gray-700 text-lg font-bold active:scale-90 transition-transform"
          style={{ border: '1px solid #E2E8F0' }}
          aria-label="הפחת ק״ג"
        >
          −
        </button>

        <div className="flex-1 text-center">
          <input
            type="number"
            inputMode="numeric"
            value={value}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= 30 && v <= 200) setValue(v);
            }}
            className="text-[18px] font-black text-gray-900 text-center bg-transparent border-none outline-none w-full"
            aria-label="משקל בקילוגרם"
          />
          <span className="text-[11px] text-gray-400 leading-none">ק״ג</span>
        </div>

        <button
          type="button"
          onClick={() => adjust(1)}
          className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-gray-700 text-lg font-bold active:scale-90 transition-transform"
          style={{ border: '1px solid #E2E8F0' }}
          aria-label="הוסף ק״ג"
        >
          +
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-3.5 h-9 rounded-xl text-[13px] font-black text-white active:scale-95 transition-transform disabled:opacity-50"
          style={{ backgroundColor: ACCENT, minWidth: 52 }}
        >
          {saving ? '...' : 'שמור'}
        </button>
      </div>
      <p className="text-[10px] text-gray-400 mt-1.5">אפשר לדלג — יישמר לפרופיל אם תבחר</p>
    </div>
  );
}
