'use client';

/**
 * ProgramPathSwitcher — Feature #5 (Phase 1): the exercise-detail sheet's
 * program/path switcher chip.
 *
 * An exercise's membership + per-program level come exclusively from
 * Exercise.targetPrograms[].{programId, level} — an exercise can belong to
 * several programs at once (e.g. "מתח סופינציה" is in משיכה at level 9 AND
 * in מתח יד אחת at level 1). This chip shows the currently ACTIVE path
 * (name + level) and, when the exercise has 2+ targetPrograms entries,
 * expands into a small anchored panel to switch between them.
 *
 * Deliberately NOT a new bottom sheet — mirrors the exact interaction
 * pattern of LocationVariantSwitcher.tsx (the ציוד/פארק equipment chip):
 * small trigger chip with a chevron, tap expands a compact panel anchored
 * directly below the chip (portalled to document.body, positioned via a
 * measured getBoundingClientRect, NOT a full-screen backdrop sheet), one
 * row per option with a checkmark on the active one, tap-to-select closes
 * it. Structurally a close copy of that component (same positioning/
 * portal/closing-mechanics code), swapping location+gear content for
 * program name + level — LocationVariantSwitcher itself isn't reused
 * directly because its option rendering is location-specific (gear chips,
 * a home/park/gym/street icon lookup) which doesn't apply to a program.
 *
 * canSwitch=false (single targetPrograms entry) renders a STATIC chip —
 * no chevron, no tap affordance, no panel — same as LocationVariantSwitcher
 * does for a single-option exercise.
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { getProgramIcon } from '@/features/content/programs';

const PILL_BORDER = '0.5px solid #E0E9FF';
const SECTION_FONT = { fontFamily: 'var(--font-simpler)' } as const;

export interface ProgramPathOption {
  programId: string;
  /** Resolved display name — falls back to the raw programId when unresolved (see useExerciseMasterData's programs memo). */
  label: string;
  /** This exercise's level within THIS program (targetPrograms[].level). */
  level: number;
  iconKey?: string;
  isActive: boolean;
}

interface ProgramPathSwitcherProps {
  /** The currently active option — chip label/icon source. Null while programs haven't resolved yet. */
  activeOption: ProgramPathOption | null;
  options: ProgramPathOption[];
  open: boolean;
  /** false → trigger is a static chip (no dropdown), e.g. a single-program exercise. */
  canSwitch?: boolean;
  onToggleOpen: () => void;
  onClose: () => void;
  onSelect: (opt: ProgramPathOption) => void;
}

export default function ProgramPathSwitcher({
  activeOption,
  options,
  open,
  canSwitch = false,
  onToggleOpen,
  onClose,
  onSelect,
}: ProgramPathSwitcherProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Same portalled-dropdown positioning technique as LocationVariantSwitcher —
  // viewport coords under the chip, measured when it opens, clamped on-screen.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const WIDTH = 220;
    setPos({
      top: rect.bottom + 8,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - WIDTH - 8)),
    });
    const close = () => onCloseRef.current();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  if (!activeOption) return null;

  return (
    <div ref={anchorRef} className="relative flex-shrink-0">
      {/* Active-path trigger chip */}
      <button
        type="button"
        onClick={canSwitch ? onToggleOpen : undefined}
        className={`inline-flex items-center gap-1.5 bg-white rounded-lg px-2.5 shadow-sm ${canSwitch ? 'active:scale-95 transition-transform cursor-pointer' : 'cursor-default'}`}
        style={{ border: PILL_BORDER, height: 30 }}
        aria-haspopup={canSwitch ? 'listbox' : undefined}
        aria-expanded={canSwitch ? open : undefined}
      >
        <span className="text-slate-500 flex-shrink-0 flex items-center">
          {getProgramIcon(activeOption.iconKey, 'w-3.5 h-3.5')}
        </span>
        <span className="text-xs font-semibold text-slate-700 whitespace-nowrap" style={SECTION_FONT}>
          {activeOption.label} · רמה {activeOption.level}
        </span>
        {canSwitch && (
          <ChevronDown
            size={14}
            className={`text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        )}
      </button>

      {open && mounted && pos && createPortal(
        <div className="fixed inset-0 z-[200]">
          {/* Click-away */}
          <button
            type="button"
            aria-label="סגור"
            onPointerDown={onClose}
            className="absolute inset-0 cursor-default"
          />
          <div
            role="listbox"
            dir="rtl"
            className="absolute min-w-[220px] bg-white rounded-2xl shadow-floating border border-slate-100 p-1.5"
            style={{ top: pos.top, left: pos.left }}
          >
            {options.map((opt) => (
              <button
                key={opt.programId}
                type="button"
                role="option"
                aria-selected={opt.isActive}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelect(opt);
                }}
                className={`w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                  opt.isActive
                    ? 'bg-cyan-50 text-cyan-700 font-bold'
                    : 'text-slate-700 hover:bg-slate-50 active:bg-slate-100'
                }`}
                style={SECTION_FONT}
              >
                <span className={`flex-shrink-0 flex items-center ${opt.isActive ? 'text-cyan-600' : 'text-slate-400'}`}>
                  {getProgramIcon(opt.iconKey, 'w-4 h-4')}
                </span>
                <span className={`flex-1 text-start text-xs font-semibold ${opt.isActive ? 'text-cyan-700' : 'text-slate-800'}`}>
                  {opt.label} · רמה {opt.level}
                </span>
                {opt.isActive && <Check size={14} className="flex-shrink-0 text-cyan-600" />}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
