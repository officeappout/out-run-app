'use client';

import { Calendar, Dumbbell } from 'lucide-react';
import type { CommunityGroup, ScheduleSlot } from '@/types/community.types';
import { DAY_LABELS } from '../utils/group-details-logic';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

interface FullScheduleListProps {
  v2: boolean;
  group: CommunityGroup;
  slots: ScheduleSlot[];
  nextSlot: ScheduleSlot | null;
  destAddress: string | undefined;
}

/** Expandable full weekly schedule — per-slot address / price / equipment overrides. */
export default function FullScheduleList({ v2, group, slots, nextSlot, destAddress }: FullScheduleListProps) {
  const t = useT(community);
  return (
    <div className={v2 ? 'overflow-hidden rounded-[20px] bg-white shadow-v2-ring' : 'bg-gray-50 dark:bg-gray-800/40 rounded-2xl border border-gray-100 dark:border-gray-700/40 overflow-hidden'}>
      <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700/40">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" />
          {t('group.schedule.title')}
        </p>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-700/40">
        {slots.map((slot, i) => {
          const isNext = nextSlot === slot;
          const slotAddr = slot.location?.address || destAddress;
          const slotPrice = slot.price != null ? slot.price : group.price;
          const slotEquip = slot.requiredEquipment?.length ? slot.requiredEquipment : group.equipment;
          return (
            <div key={i} className={`px-4 py-2.5 flex items-center gap-3 ${isNext ? 'bg-cyan-50/60 dark:bg-cyan-900/10' : ''}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
                  {t('group.schedule.slot', { day: DAY_LABELS[slot.dayOfWeek], time: slot.time })}
                  {slot.label && <span className="text-gray-400 font-medium"> — {slot.label}</span>}
                </p>
                {slotAddr && (
                  <p className="text-xs text-gray-400 truncate mt-0.5">📍 {slotAddr}</p>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {isNext && (
                  <span className="px-1.5 py-0.5 rounded bg-cyan-500 text-white text-xs font-black">{t('group.schedule.next')}</span>
                )}
                {slotPrice != null && slotPrice > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-xs font-bold">₪{slotPrice}</span>
                )}
                {slotEquip && slotEquip.length > 0 && (
                  <Dumbbell className="w-3.5 h-3.5 text-emerald-500" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
