'use client';

import React from 'react';
import { X, Pencil, Trash2, Plus } from 'lucide-react';
import { updateGroup } from '@/features/arena/services/group.service';
import type { CommunityGroup } from '@/types/community.types';
import { DAY_LABELS } from '../utils/group-details-logic';
import { getSlotStatus, type SlotStatus } from '../services/slot-status.service';
import SlotEditorSheet from './SlotEditorSheet';

// ── Schedule Manager Panel ────────────────────────────────────────────────────

interface ScheduleManagerPanelProps {
  group: CommunityGroup;
  editingSlotIndex: number | null;
  onEdit: (index: number | null) => void;
  onClose: () => void;
  onSaved: () => void;
  showToast: (type: 'success' | 'error', text: string) => void;
}

export default function ScheduleManagerPanel({ group, editingSlotIndex, onEdit, onClose, onSaved, showToast }: ScheduleManagerPanelProps) {
  const slots = group.scheduleSlots ?? [];
  const [statusMap, setStatusMap] = React.useState<Record<number, SlotStatus>>({});
  const [checking, setChecking] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  // Fetch lock status + RSVP count for every slot on mount
  React.useEffect(() => {
    let cancelled = false;
    setChecking(true);
    Promise.all(
      slots.map((slot, i) => getSlotStatus(group.id, slot).then((status) => ({ i, status })))
    ).then((results) => {
      if (cancelled) return;
      const map: Record<number, SlotStatus> = {};
      results.forEach(({ i, status }) => { map[i] = status; });
      setStatusMap(map);
      setChecking(false);
    });
    return () => { cancelled = true; };
  }, [group.id, slots.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRemoveSlot = async (index: number) => {
    const newSlots = slots.filter((_, i) => i !== index);
    setSaving(true);
    try {
      await updateGroup(group.id, { scheduleSlots: newSlots });
      showToast('success', 'מפגש הוסר');
      onSaved();
    } catch {
      showToast('error', 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  if (editingSlotIndex !== null) {
    return (
      <SlotEditorSheet
        group={group}
        slotIndex={editingSlotIndex >= 0 ? editingSlotIndex : null}
        onBack={() => onEdit(null)}
        onSaved={onSaved}
        showToast={showToast}
      />
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-black text-gray-900">ניהול מפגשים</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 active:scale-90 transition-all">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Slot list */}
      <div className="divide-y divide-gray-50">
        {slots.map((slot, i) => {
          const status = statusMap[i];
          const locked = status?.locked ?? false;
          const attendeeCount = status?.attendeeCount ?? 0;
          const isOnly = slots.length === 1;
          return (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              {/* Day + time */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900">
                  {DAY_LABELS[slot.dayOfWeek]}{'  '}
                  <span className="font-mono">{slot.time}</span>
                </p>
                {(slot.location?.address ?? group.meetingLocation?.address) && (
                  <p className="text-[11px] text-gray-500 truncate mt-0.5">
                    {slot.location?.address ?? group.meetingLocation?.address}
                  </p>
                )}
              </div>

              {/* RSVP count (informational) or lock badge */}
              {checking ? (
                <span className="text-[10px] text-gray-400 flex-shrink-0">...</span>
              ) : locked ? (
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full flex-shrink-0">
                  פעיל
                </span>
              ) : attendeeCount > 0 ? (
                <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">
                  {attendeeCount} נרשמו
                </span>
              ) : null}

              {/* Edit */}
              <button
                onClick={() => !locked && !checking && onEdit(i)}
                disabled={locked || checking || saving}
                title={locked ? 'מפגש פעיל כרגע — לא ניתן לערוך' : 'ערוך'}
                className={`p-2 rounded-xl transition-all active:scale-90 ${
                  locked || checking ? 'text-gray-300 cursor-not-allowed' : 'text-cyan-600 hover:bg-cyan-50'
                }`}
              >
                <Pencil className="w-4 h-4" />
              </button>

              {/* Remove */}
              <button
                onClick={() => !locked && !isOnly && !checking && handleRemoveSlot(i)}
                disabled={locked || isOnly || checking || saving}
                title={isOnly ? 'להפסיק מפגשים לגמרי — בקרוב' : locked ? 'מפגש פעיל כרגע' : 'הסר מפגש'}
                className={`p-2 rounded-xl transition-all active:scale-90 ${
                  locked || isOnly || checking ? 'text-gray-300 cursor-not-allowed' : 'text-red-400 hover:bg-red-50'
                }`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add slot */}
      <div className="px-4 pb-4 pt-2">
        <button
          onClick={() => onEdit(-1)}
          disabled={saving || checking}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-black text-cyan-600 bg-cyan-50 hover:bg-cyan-100 active:scale-[0.97] transition-all disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          הוסף מפגש
        </button>
      </div>
    </div>
  );
}
