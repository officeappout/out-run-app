'use client';

import React from 'react';

export const USER_TABS = [
  { id: 'overview', label: 'סקירה' },
  { id: 'workouts', label: 'אימונים' },
  { id: 'progress', label: 'התקדמות' },
  { id: 'profile', label: 'שאלונים ופרופיל' },
  { id: 'admin', label: 'ניהול' },
] as const;

export type UserTabId = (typeof USER_TABS)[number]['id'];

/** `?tab=` value to a known tab id; anything else falls back to סקירה. */
export function parseUserTab(value: string | null | undefined): UserTabId {
  return USER_TABS.find((t) => t.id === value)?.id ?? 'overview';
}

interface Props {
  active: UserTabId;
  onChange: (tab: UserTabId) => void;
}

/** Tab bar under the fixed header. */
export default function UserTabs({ active, onChange }: Props) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto">
      {USER_TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`px-4 py-2.5 text-sm font-bold whitespace-nowrap border-b-2 transition-colors ${
              isActive
                ? 'border-[#5BC2F2] text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
