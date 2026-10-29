'use client';

/**
 * Small language pill for the very first screen (top-end corner). Renders nothing
 * unless enable_i18n is on and at least one non-Hebrew locale is allowed
 * (useLanguageSetting: same options and same setUserLocale as the Settings row),
 * so with the flags off the host screen is unchanged.
 * Two languages: one tap switches to the other. More: a tiny menu.
 */
import React, { useState } from 'react';
import { Globe } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { useLanguageSetting } from '@/hooks/useLanguageSetting';
import { common } from '@/messages/ns/common';
import type { LanguageOption } from '@/lib/i18n/language-setting';
import type { Locale } from '@/lib/i18n/locales';

/** The one language a single tap switches to (two-language case), else null (menu). */
export function singleTarget(options: LanguageOption[], locale: Locale): Locale | null {
  const others = options.filter((o) => o.value !== locale);
  return others.length === 1 ? others[0].value : null;
}

export function LanguageSwitchButton() {
  const t = useT(common);
  const { options, locale, choose } = useLanguageSetting();
  const [open, setOpen] = useState(false);
  if (options.length < 2) return null;

  const others = options.filter((o) => o.value !== locale);
  const single = others.length === 1;
  const current = options.find((o) => o.value === locale) ?? options[0];
  const label = single ? others[0].name : current.name;

  return (
    <div
      className="fixed end-3 z-30"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
    >
      <button
        type="button"
        aria-label={t('language.switch.aria')}
        aria-haspopup={single ? undefined : 'menu'}
        aria-expanded={single ? undefined : open}
        onClick={() => (single ? void choose(others[0].value) : setOpen((v) => !v))}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-full bg-white/80 px-3 text-sm font-bold text-v2-ink shadow-sm backdrop-blur"
      >
        <Globe size={16} aria-hidden="true" />
        <span>{label}</span>
      </button>
      {!single && open && (
        <ul
          role="menu"
          aria-label={t('language.switch.menu')}
          className="absolute end-0 mt-1 min-w-[140px] overflow-hidden rounded-2xl bg-white shadow-lg"
        >
          {options.map((o) => (
            <li key={o.value} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={o.value === locale}
                lang={o.value}
                onClick={() => { setOpen(false); void choose(o.value); }}
                className="flex min-h-[44px] w-full items-center px-4 text-start text-sm font-semibold text-v2-ink"
              >
                {o.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
