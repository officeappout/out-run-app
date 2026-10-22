'use client';

/**
 * The "שאל את OUT" button (sidebar on desktop, an icon in the phone top bar) + the ⌘K / Ctrl+K
 * shortcut. Rendered only when the drawer itself is (layout.tsx decides; the server re-checks).
 */
import { useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { useAdminAssistantStore } from './useAdminAssistantStore';

export function useAssistantShortcut(enabled: boolean) {
  const toggle = useAdminAssistantStore((s) => s.toggle);
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, toggle]);
}

export function AssistantLauncher({ variant }: { variant: 'sidebar' | 'icon' }) {
  const toggle = useAdminAssistantStore((s) => s.toggle);
  const open = useAdminAssistantStore((s) => s.open);
  if (variant === 'icon') {
    return (
      <button type="button" onClick={toggle} aria-label="שאל את OUT" aria-expanded={open} className="rounded-lg p-2 text-cyan-700 hover:bg-cyan-50">
        <Sparkles size={20} />
      </button>
    );
  }
  return (
    <div className="px-3 pt-3">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-xl border border-cyan-200 bg-cyan-50/70 px-3 py-2 text-[13px] font-medium text-cyan-800 hover:bg-cyan-100"
      >
        <span className="flex items-center gap-2">
          <Sparkles size={16} aria-hidden /> שאל את OUT
        </span>
        <kbd className="rounded border border-cyan-200 bg-white px-1.5 text-[11px] text-cyan-700" dir="ltr">
          ⌘K
        </kbd>
      </button>
    </div>
  );
}
