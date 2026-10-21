'use client';

import { forwardRef } from 'react';
import { Search, X } from 'lucide-react';
import { BRAND_BORDER_BG } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { library } from '@/messages/ns/library';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  /** Brand-gradient border while there is a query (Results board); soft cyan ring when empty. */
  active: boolean;
}

/** The one search input (real <input type="search">, 16px so iOS doesn't zoom). */
const SearchField = forwardRef<HTMLInputElement, Props>(function SearchField({ value, onChange, onSubmit, placeholder, active }, ref) {
  const t = useT(library);
  return (
    <form
      role="search"
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      className="flex h-[50px] items-center gap-2.5 rounded-2xl px-3.5"
      style={active
        ? { background: BRAND_BORDER_BG, border: '1.5px solid transparent', boxShadow: '0 4px 20px rgba(91,194,242,0.14)' }
        : { background: '#ffffff', border: '1.5px solid #e0f2fe', boxShadow: '0 4px 20px rgba(91,194,242,0.12)' }}
    >
      <Search size={20} strokeWidth={2.2} className="shrink-0 text-[#007399]" aria-hidden />
      <input
        ref={ref}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 80))}
        placeholder={placeholder}
        aria-label={t('search.field.label')}
        className="min-w-0 flex-1 border-0 bg-transparent text-[16px] text-[#171717] outline-none placeholder:text-[#9ca3af] [&::-webkit-search-cancel-button]:hidden"
        style={{ fontWeight: value ? 700 : 400, WebkitTextFillColor: '#171717' }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={t('search.field.clear')}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#f1f5f9] active:scale-95"
        >
          <X size={12} strokeWidth={2.5} className="text-[#6b7280]" aria-hidden />
        </button>
      )}
    </form>
  );
});

export default SearchField;
