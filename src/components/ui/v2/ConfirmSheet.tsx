'use client';

/**
 * ConfirmSheet (v2) — a short action sheet on the shared <Sheet>: title, an
 * optional line of context, then a stack of full-width pill actions.
 *
 *   <ConfirmSheet
 *     open={!!pending}
 *     onClose={cancel}
 *     title="מחיקת אימון?"
 *     description="האימון יוסר מהלוח השבועי"
 *     actions={[
 *       { label: 'מחק', tone: 'danger', onClick: confirm },
 *       { label: 'ביטול', tone: 'ghost', onClick: cancel },
 *     ]}
 *     zIndex={SHEET_Z.agendaDeletePanel}
 *     backdropZIndex={SHEET_Z.agendaDelete}
 *   />
 *
 * Tones: `cta` — the screen's one gradient CTA · `danger` — a destructive
 * filled pill (v2 down red) · `secondary` — white pill with the ring shadow ·
 * `ghost` — a quiet text action (cancel). Labels never wrap.
 */

import type { ReactNode } from 'react';
import Sheet from './Sheet';
import Button from './Button';
import { SHEET_Z, type SheetZIndex } from './tokens';

export type ConfirmActionTone = 'cta' | 'danger' | 'secondary' | 'ghost';

export interface ConfirmSheetAction {
  label: ReactNode;
  onClick: () => void;
  /** Default 'secondary'. */
  tone?: ConfirmActionTone;
  disabled?: boolean;
}

export interface ConfirmSheetProps {
  open: boolean;
  /** Backdrop tap / Escape. */
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  actions: ConfirmSheetAction[];
  /** Panel z-index (documented budget value). Default SHEET_Z.overlay. */
  zIndex?: SheetZIndex;
  /** Backdrop z-index (documented budget value). Default zIndex − 1. */
  backdropZIndex?: SheetZIndex;
  /** Portal to document.body (default) or render in place. */
  portal?: boolean;
  /** Bottom padding expression. Default the Sheet's safe-area padding. */
  safeArea?: string | false;
}

const PILL = 'h-12 w-full whitespace-nowrap rounded-full text-[16px] font-extrabold transition-transform duration-150 ease-v2 active:scale-[0.97] disabled:opacity-50';

export const CONFIRM_ACTION_CLASS: Record<Exclude<ConfirmActionTone, 'cta'>, string> = {
  danger: `${PILL} bg-v2-down text-white`,
  secondary: `${PILL} bg-white text-v2-ink shadow-v2-ring`,
  ghost: 'h-11 w-full whitespace-nowrap rounded-full text-[15px] font-extrabold text-v2-muted transition-transform duration-150 ease-v2 active:scale-[0.97]',
};

export default function ConfirmSheet({
  open,
  onClose,
  title,
  description,
  actions,
  zIndex = SHEET_Z.overlay,
  backdropZIndex,
  portal = true,
  safeArea,
}: ConfirmSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      zIndex={zIndex}
      backdropZIndex={backdropZIndex}
      portal={portal}
      keyboardAware={false}
      closeOnEscape
      scroll="none"
      {...(safeArea !== undefined ? { safeArea } : {})}
      frameClassName="mx-auto max-w-md"
      header={
        <div className="px-5 pb-1 pt-2" data-v2-confirm-sheet>
          <h2 className="text-[22px] font-black !tracking-[-0.02em] text-v2-ink">{title}</h2>
          {description != null && (
            <p className="mt-1 text-[14px] font-bold text-v2-muted">{description}</p>
          )}
        </div>
      }
      ariaLabel={typeof title === 'string' ? title : undefined}
    >
      <div className="flex flex-col gap-2.5 px-5 pt-4">
        {actions.map((a, i) =>
          a.tone === 'cta' ? (
            <Button key={i} variant="cta" block disabled={a.disabled} onClick={a.onClick}>
              {a.label}
            </Button>
          ) : (
            <button
              key={i}
              type="button"
              disabled={a.disabled}
              onClick={a.onClick}
              className={CONFIRM_ACTION_CLASS[a.tone ?? 'secondary']}
            >
              {a.label}
            </button>
          ),
        )}
      </div>
    </Sheet>
  );
}
