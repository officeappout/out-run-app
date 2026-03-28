'use client';

import React from 'react';

interface Attendee {
  uid: string;
  name: string;
  photoURL?: string;
}

interface AttendeesPreviewProps {
  attendees: Attendee[];
  total: number;
  maxShown?: number;
}

const AVATAR_COLORS = [
  'bg-cyan-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-purple-500', 'bg-rose-500', 'bg-indigo-500', 'bg-teal-500',
];

function getColorForUid(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return parts[0][0] + parts[1][0];
  return name.slice(0, 2);
}

export default function AttendeesPreview({ attendees, total, maxShown = 4 }: AttendeesPreviewProps) {
  const visible = attendees.slice(0, maxShown);
  const overflow = total - visible.length;

  if (total === 0 && visible.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center -space-x-2 rtl:space-x-reverse" dir="ltr">
        {visible.map((a) => (
          <div
            key={a.uid}
            className="relative w-7 h-7 rounded-full border-2 border-white dark:border-slate-900 flex-shrink-0 overflow-hidden"
            title={a.name}
          >
            {a.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.photoURL} alt={a.name} className="w-full h-full object-cover" />
            ) : (
              <div className={`w-full h-full flex items-center justify-center text-[9px] font-bold text-white ${getColorForUid(a.uid)}`}>
                {getInitials(a.name)}
              </div>
            )}
          </div>
        ))}

        {overflow > 0 && (
          <div className="relative w-7 h-7 rounded-full border-2 border-white dark:border-slate-900 flex-shrink-0 bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
            <span className="text-[9px] font-bold text-gray-600 dark:text-gray-300">
              +{overflow > 99 ? '99' : overflow}
            </span>
          </div>
        )}
      </div>

      <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium tabular-nums">
        {total} {total === 1 ? 'משתתף' : 'משתתפים'}
      </span>
    </div>
  );
}
