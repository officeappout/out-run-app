'use client';

/**
 * Home v2 (enable_home_v2) look for the add-location wizard + quick report.
 *
 * Styling only: the wizard's parent resolves the flag once and provides it
 * through `WizardV2Context`; every step reads it with `useWizardV2()`. With
 * the flag off nothing here renders and each step keeps today's markup.
 */
import React from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

export const WizardV2Context = React.createContext(false);
export const useWizardV2 = () => React.useContext(WizardV2Context);

/** Small section label above a field / group. */
export const V2_LABEL = 'mb-2 block whitespace-nowrap text-[13px] font-extrabold text-v2-deep';

/** White rounded input on the ring shadow. */
export const V2_INPUT =
  'w-full rounded-[16px] bg-white px-4 py-3 text-[15px] font-bold text-v2-ink shadow-v2-ring outline-none placeholder:font-semibold placeholder:text-v2-muted transition-shadow focus:ring-2 focus:ring-v2-accent';

/** Choice card / chip — white on the ring shadow; selected = ring (cards) or tint (chips). */
export const v2Card = (selected: boolean) =>
  `rounded-[20px] bg-white transition-transform duration-150 ease-v2 active:scale-[0.97] ${
    selected ? 'shadow-v2-card ring-2 ring-v2-accent text-v2-ink' : 'shadow-v2-ring text-v2-ink-2'
  }`;

export const v2Chip = (selected: boolean) =>
  `transition-transform duration-150 ease-v2 active:scale-[0.97] ${
    selected
      ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40'
      : 'bg-white text-v2-ink-2 shadow-v2-ring'
  }`;

/** Round white back button (RTL: "back" points right). */
export function V2BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="חזרה"
      className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-full bg-white text-v2-ink shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
    >
      <ChevronRight size={20} strokeWidth={2.4} />
    </button>
  );
}

/** The screen's one gradient pill (next / submit). */
export function V2PrimaryButton({
  onClick,
  disabled,
  loading,
  children,
  arrow = true,
  className = '',
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  arrow?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-12 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-v2-cta text-[16px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 ${className}`}
    >
      {loading && <Loader2 size={18} className="animate-spin" />}
      {children}
      {arrow && !loading && <ChevronLeft size={18} strokeWidth={2.6} />}
    </button>
  );
}
