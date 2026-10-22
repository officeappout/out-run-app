'use client';

/** The ONE calm line after the running plan changed week (enable_week_builder_v1) — dismissible, no numbers of missed runs. */
import { X } from 'lucide-react';

export default function RunCatchUpNotice({ text, onDismiss }: { text: string | null; onDismiss: () => void }) {
  if (!text) return null;
  return (
    <div dir="rtl" className="flex items-center gap-3 rounded-[18px] bg-white px-4 py-3 font-simpler text-v2-ink shadow-v2-card">
      <span className="min-w-0 flex-1 text-[14px] font-extrabold">{text}</span>
      <button type="button" onClick={onDismiss} aria-label="סגירה" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-v2-muted">
        <X size={16} strokeWidth={2.4} aria-hidden />
      </button>
    </div>
  );
}
