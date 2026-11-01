'use client';

/**
 * DrawerToolButton — a small round tool in the drawer's corner (enable_unified_player_v1,
 * canvas FinalNav / FinalDrawerUp): 34px white with a hairline ring, slate icon.
 * Used for "add a friend" and the workout settings.
 */

import React from 'react';

export interface DrawerToolButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

export default function DrawerToolButton({ label, onClick, disabled, children }: DrawerToolButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="pointer-events-auto grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-white text-[#4b5a66] shadow-v2-ring active:scale-[0.95] disabled:opacity-60"
    >
      {children}
    </button>
  );
}
