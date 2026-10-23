/**
 * Keyboard map for the wide player (a Bluetooth keyboard, or a TV remote in a
 * browser). Pure. Space = primary (done / pause), → = next, ← = back,
 * Esc = minimize.
 */

export type WideIntent = 'primary' | 'next' | 'back' | 'minimize';

export interface WideKeyInfo {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  /** The event target, reduced to what matters. */
  target?: { tag?: string; role?: string | null; editable?: boolean } | null;
}

const NATIVE_ACTIVATORS = new Set(['button', 'a', 'summary']);
const TEXT_FIELDS = new Set(['input', 'textarea', 'select']);

/** null = leave the key alone (typing in a field, a modifier combo, or a focused button that Space / Enter already clicks). */
export function wideIntentForKey(e: WideKeyInfo): WideIntent | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const tag = (e.target?.tag ?? '').toLowerCase();
  if (e.target?.editable || TEXT_FIELDS.has(tag)) return null;
  switch (e.key) {
    case ' ':
    case 'Spacebar': {
      // A focused button is activated natively by Space — don't fire it twice.
      if (NATIVE_ACTIVATORS.has(tag) || e.target?.role === 'button') return null;
      return 'primary';
    }
    case 'ArrowRight':
      return 'next';
    case 'ArrowLeft':
      return 'back';
    case 'Escape':
      return 'minimize';
    default:
      return null;
  }
}
