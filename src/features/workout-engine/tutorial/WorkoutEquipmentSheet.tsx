'use client';
/**
 * Equipment sheet (enable_workout_tutorial_v1, pilot S2): at the start of a workout that needs
 * gear, "what this workout needs" with the gear as icon cards, like the park station intro.
 * "Start" closes it for this workout; "don't show again" hides it for good. Holds the first set.
 */
import React from 'react';
import { motion } from 'framer-motion';
import { PersonStanding } from 'lucide-react';
import { Button } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import { resolveEquipmentLabel, resolveEquipmentSvgPathList } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import TutorialPortal from './TutorialPortal';

interface Props {
  gearIds: string[];
  location?: string;
  onClose: (hideForGood: boolean) => void;
}

export default function WorkoutEquipmentSheet({ gearIds, location, onClose }: Props) {
  const t = useT(player);
  return (
    <TutorialPortal>
      <div className="absolute inset-0 bg-black/50" aria-hidden />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={t('workoutTutorial.equipment.title')}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        className="absolute inset-x-0 bottom-0 rounded-t-v2-card bg-white p-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] shadow-v2-sheet"
        style={{ fontFamily: 'var(--font-simpler)' }}
      >
        <h2 className="text-[20px] font-black text-v2-ink">{t('workoutTutorial.equipment.title')}</h2>
        <p className="mt-1 text-[13px] font-bold text-v2-muted">{t('workoutTutorial.equipment.sub')}</p>
        <div className="mt-4 flex gap-2.5 overflow-x-auto pb-1">
          {gearIds.map((id) => {
            const icon = resolveEquipmentSvgPathList(id, location)[0] ?? null;
            return (
              <div key={id} className="flex w-[92px] shrink-0 flex-col items-center gap-2 rounded-v2-tile bg-v2-surface p-3 ring-1 ring-inset ring-v2-hairline">
                {icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={icon} alt="" width={40} height={40} className="h-10 w-10 object-contain" />
                ) : (
                  <PersonStanding size={32} className="text-v2-muted" aria-hidden />
                )}
                <span className="text-center text-[12px] font-extrabold leading-tight text-v2-ink-2">{resolveEquipmentLabel(id)}</span>
              </div>
            );
          })}
        </div>
        <Button variant="cta" block className="mt-5" onClick={() => onClose(false)}>
          {t('workoutTutorial.equipment.start')}
        </Button>
        <Button variant="ghost" block className="mt-2" onClick={() => onClose(true)}>
          {t('workoutTutorial.equipment.hide')}
        </Button>
      </motion.div>
    </TutorialPortal>
  );
}
