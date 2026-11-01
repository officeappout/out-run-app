'use client';

import type { ReactNode } from 'react';

/**
 * Phone frame for design-lab prototypes. Full screen on a phone; a 390×844
 * device on a desktop, with an optional control panel beside it. The frame
 * sets `transform`, so `position: fixed` children (bottom nav, drawers) stay
 * inside the device. It also covers the app's own bottom navigation.
 */
export default function LabFrame({
  children,
  panel,
}: {
  children: ReactNode;
  panel?: ReactNode;
}) {
  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[200] overflow-hidden bg-[#e3edf2] sm:flex sm:items-center sm:justify-center sm:gap-10"
    >
      <div
        className="relative h-full w-full overflow-hidden bg-v2-surface text-v2-ink sm:h-[844px] sm:max-h-[calc(100vh-32px)] sm:w-[390px] sm:rounded-[44px] sm:shadow-v2-float"
        style={{ transform: 'translateZ(0)' }}
      >
        {children}
      </div>
      {panel && <aside className="hidden w-[260px] sm:block">{panel}</aside>}
    </div>
  );
}

/** A labeled set of state buttons for the desktop panel. */
export function LabStates<T extends string>({
  title,
  value,
  options,
  onChange,
}: {
  title: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <div className="mb-5">
      <div className="mb-2 text-[13px] font-extrabold text-v2-deep">{title}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`h-9 rounded-full px-4 text-[13px] font-extrabold transition-[transform,background-color] duration-150 ease-v2 active:scale-[0.97] ${
              value === o.id ? 'bg-v2-ink text-white' : 'bg-white text-v2-ink shadow-v2-ring'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
