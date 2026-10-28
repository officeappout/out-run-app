'use client';

interface HeEnTextFieldProps {
  label: string;
  he: string;
  /** English value; '' = none (the doc then stays a plain Hebrew string). */
  en: string;
  onChange: (next: { he: string; en: string }) => void;
  multiline?: boolean;
  rows?: number;
  placeholderHe?: string;
  placeholderEn?: string;
  inputClassName?: string;
}

const BASE = 'w-full border border-gray-300 rounded-xl px-4 py-2.5';

/**
 * Admin HE / EN pair for a text that is stored as a plain Hebrew string until English is entered
 * (programs, levels). Same layout idea as the exercise editor's name field: Hebrew RTL, English LTR.
 * Pair with foldLocalizedFieldsForWrite (programs/core/localized-fields) on save.
 */
export function HeEnTextField({ label, he, en, onChange, multiline, rows = 2, placeholderHe, placeholderEn, inputClassName = BASE }: HeEnTextFieldProps) {
  const field = (value: string, slot: 'he' | 'en', placeholder?: string) => {
    const common = {
      value,
      placeholder,
      dir: slot === 'he' ? ('rtl' as const) : ('ltr' as const),
      className: `${inputClassName} ${slot === 'he' ? 'text-right' : 'text-left'}`,
      'aria-label': `${label} (${slot.toUpperCase()})`,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        onChange({ he: slot === 'he' ? e.target.value : he, en: slot === 'en' ? e.target.value : en }),
    };
    return multiline ? <textarea rows={rows} {...common} /> : <input type="text" {...common} />;
  };
  return (
    <div>
      <label className="block text-sm font-bold text-gray-700 mb-1">{label}</label>
      <div className="space-y-2">
        <div className="flex items-start gap-2"><span className="mt-3 w-6 shrink-0 text-xs font-bold text-gray-400">HE</span><div className="flex-1">{field(he, 'he', placeholderHe)}</div></div>
        <div className="flex items-start gap-2"><span className="mt-3 w-6 shrink-0 text-xs font-bold text-gray-400">EN</span><div className="flex-1">{field(en, 'en', placeholderEn ?? 'English (optional)')}</div></div>
      </div>
    </div>
  );
}

