'use client';

/**
 * FindEquipmentOverlay — guided "מצא את המתקן" screen (PR-B3), drawn over the station player
 * while it is held paused (see logic/find-equipment.ts). Order: welcome → this → demo gate → set.
 *
 * Media = the same equipment icon RunnerHeader shows (resolveEquipmentSvgPathList, park variant
 * first), label via resolveEquipmentLabel. 'single': one machine exercise with "מצאתי ✓" and the
 * "לא מוצא, החלף תרגיל" pill. 'tabata': every machine of the block on one screen, each with its
 * own "החלף", and one "מצאתי ✓" for the block (the intervals are never interrupted).
 */
import { motion } from 'framer-motion';
import { PersonStanding } from 'lucide-react';
import BrandCtaButton from '@/components/ui/BrandCtaButton';
import { g, type AppGender } from '@/lib/utils/gendered-text';
import {
  resolveEquipmentLabel, resolveEquipmentSvgPathList,
} from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import type { FindScreen, FindItem } from '../logic/find-equipment';

function EquipmentIcon({ id, size }: { id: string; size: number }) {
  const src = resolveEquipmentSvgPathList(id, 'park')[0] ?? null;
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="object-contain"
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
    />
  ) : (
    <PersonStanding size={size} className="text-slate-400" />
  );
}

const labels = (item: FindItem) => item.equipmentIds.map((id) => resolveEquipmentLabel(id)).join(' + ');

interface Props {
  screen: FindScreen;
  gender: AppGender | null | undefined;
  onFound: () => void;
  /** Open the station's replacement modal for this exercise (absent → no swap affordance). */
  onSwap?: (item: FindItem) => void;
}

export default function FindEquipmentOverlay({ screen, gender, onFound, onSwap }: Props) {
  const isTabata = screen.kind === 'tabata';
  const single = screen.items[0];
  return (
    <motion.div
      key="find-equipment"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="absolute inset-0 z-[44] flex flex-col bg-white dark:bg-slate-950"
      dir="rtl"
    >
      <div
        className="flex-1 overflow-y-auto px-5"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}
      >
        <p className="text-[12px] font-bold text-[#00ADEF] mb-1" style={{ fontFamily: 'var(--font-simpler)' }}>
          {isTabata ? g(gender, 'מצא את המתקנים', 'מצאי את המתקנים') : g(gender, 'מצא את המתקן', 'מצאי את המתקן')}
        </p>

        {isTabata ? (
          <>
            <h2 className="text-[22px] font-black text-slate-900 dark:text-white mb-4" style={{ fontFamily: 'var(--font-simpler)' }}>
              לפני שמתחילים את הבלוק
            </h2>
            <div className="space-y-3">
              {screen.items.map((item) => (
                <div
                  key={`${item.exerciseId}-${item.exIdx}`}
                  className="flex items-center gap-3 rounded-2xl p-3"
                  style={{ border: '1px solid #E0E9FF', background: '#F8FBFF' }}
                >
                  <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center flex-shrink-0">
                    <EquipmentIcon id={item.equipmentIds[0]} size={36} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-black text-slate-900 dark:text-white truncate">{labels(item)}</div>
                    <div className="text-[12px] text-slate-500 truncate">{item.exerciseName}</div>
                  </div>
                  {onSwap && (
                    <button
                      type="button"
                      onClick={() => onSwap(item)}
                      className="flex-shrink-0 rounded-full px-3 py-1.5 text-[12px] font-bold text-slate-600 border border-slate-200 bg-white active:scale-95 transition-transform"
                    >
                      {g(gender, 'החלף', 'החליפי')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center text-center pt-4">
            <div className="w-36 h-36 rounded-3xl flex items-center justify-center mb-4" style={{ background: '#F0F9FF' }}>
              <EquipmentIcon id={single.equipmentIds[0]} size={96} />
            </div>
            <h2 className="text-[24px] font-black text-slate-900 dark:text-white leading-tight" style={{ fontFamily: 'var(--font-simpler)' }}>
              {labels(single)}
            </h2>
            <p className="text-[14px] text-slate-500 mt-1" style={{ fontFamily: 'var(--font-simpler)' }}>
              לתרגיל: {single.exerciseName}
            </p>
          </div>
        )}
      </div>

      <div className="px-5 pt-2 space-y-2" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 20px))' }}>
        <BrandCtaButton onClick={onFound} className="w-full h-14 rounded-full text-[16px] font-bold">
          מצאתי ✓
        </BrandCtaButton>
        {!isTabata && onSwap && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => onSwap(single)}
              className="rounded-full px-4 py-2 text-[13px] font-bold text-slate-500 border border-slate-200 active:scale-95 transition-transform"
            >
              {g(gender, 'לא מוצא, החלף תרגיל', 'לא מוצאת, החליפי תרגיל')}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
