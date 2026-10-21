'use client';

import React from 'react';
import { ChevronLeft } from 'lucide-react';
import CommunityAddressSearch from '../../CommunityAddressSearch';
import MiniLocationPicker from '@/features/admin/components/MiniLocationPicker';
import { WorkoutGoalEditor } from '../../WorkoutGoalEditor';
import { updateGroup } from '@/features/arena/services/group.service';
import type { CommunityGroup, ScheduleSlot, SessionGoalSpec } from '@/types/community.types';
import { DAY_LABELS } from '../utils/group-details-logic';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

// ── Slot Editor Sheet ─────────────────────────────────────────────────────────

interface SlotEditorSheetProps {
  group: CommunityGroup;
  slotIndex: number | null; // null = add new slot
  onBack: () => void;
  onSaved: () => void;
  showToast: (type: 'success' | 'error', text: string) => void;
}

export default function SlotEditorSheet({ group, slotIndex, onBack, onSaved, showToast }: SlotEditorSheetProps) {
  const t = useT(community);
  const slot    = slotIndex !== null ? group.scheduleSlots![slotIndex] : null;
  const initLoc = slot?.location
    ? { address: slot.location.address ?? '', lat: slot.location.lat ?? 31.7683, lng: slot.location.lng ?? 35.2137 }
    : group.meetingLocation
    ? { address: group.meetingLocation.address, lat: group.meetingLocation.location?.lat ?? 31.7683, lng: group.meetingLocation.location?.lng ?? 35.2137 }
    : { address: '', lat: 31.7683, lng: 35.2137 };

  const [dayOfWeek,   setDayOfWeek]   = React.useState(slot?.dayOfWeek ?? 1);
  const [time,        setTime]        = React.useState(slot?.time ?? '08:00');
  const [address,     setAddress]     = React.useState(initLoc.address ?? '');
  const [coords,      setCoords]      = React.useState({ lat: initLoc.lat ?? 31.7683, lng: initLoc.lng ?? 35.2137 });
  const [workoutGoal, setWorkoutGoal] = React.useState<SessionGoalSpec | undefined>(slot?.workoutGoal);
  const [saving,    setSaving]    = React.useState(false);

  const handleAddressSelect = ({ address: addr, coords: c }: { address: string; coords: { lat: number; lng: number } }) => {
    setAddress(addr);
    setCoords(c);
  };

  const handleSave = async () => {
    if (!time.match(/^\d{1,2}:\d{2}$/)) {
      showToast('error', t('group.slotEditor.toast.badTime'));
      return;
    }
    const newSlotData: ScheduleSlot = {
      ...(slot ?? { frequency: 'weekly' as const, durationMinutes: 60 }),
      dayOfWeek,
      time,
      location: { address, lat: coords.lat, lng: coords.lng },
      workoutGoal,
    };
    const newSlots = slotIndex !== null
      ? group.scheduleSlots!.map((s, i) => (i === slotIndex ? newSlotData : s))
      : [...(group.scheduleSlots ?? []), newSlotData];
    setSaving(true);
    try {
      await updateGroup(group.id, { scheduleSlots: newSlots });
      showToast('success', slotIndex !== null ? t('group.slotEditor.toast.updated') : t('group.slotEditor.toast.added'));
      onSaved();
    } catch {
      showToast('error', t('group.slotEditor.toast.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden space-y-0" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 active:scale-90 transition-all">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-black text-gray-900 flex-1">{slotIndex !== null ? t('group.slotEditor.titleEdit') : t('group.slotEditor.titleAdd')}</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Day picker */}
        <div>
          <p className="text-xs font-bold text-gray-500 mb-2">{t('group.slotEditor.day')}</p>
          <div className="flex gap-1.5 flex-wrap">
            {DAY_LABELS.map((label, d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDayOfWeek(d)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                  dayOfWeek === d
                    ? 'bg-cyan-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Time input */}
        <div>
          <p className="text-xs font-bold text-gray-500 mb-2">{t('group.slotEditor.time')}</p>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />
        </div>

        {/* Address search */}
        <div>
          <p className="text-xs font-bold text-gray-500 mb-2">{t('group.slotEditor.location')}</p>
          <CommunityAddressSearch
            value={address}
            onChange={handleAddressSelect}
            proximity={coords}
          />
        </div>

        {/* Map pin */}
        <MiniLocationPicker
          value={coords}
          onChange={(c) => setCoords(c)}
        />

        {/* Workout Goal */}
        <WorkoutGoalEditor
          value={workoutGoal}
          onChange={setWorkoutGoal}
          variant="app"
        />
      </div>

      {/* Footer */}
      <div className="px-4 pb-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3.5 rounded-2xl text-sm font-black text-white bg-cyan-500 active:scale-[0.97] transition-all disabled:opacity-50"
        >
          {saving ? t('group.slotEditor.saving') : slotIndex !== null ? t('group.slotEditor.save') : t('group.slotEditor.add')}
        </button>
      </div>
    </div>
  );
}
