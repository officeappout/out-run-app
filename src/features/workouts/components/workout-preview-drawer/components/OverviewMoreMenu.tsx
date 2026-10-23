'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowDownCircle, Heart, Loader2, MoreHorizontal, Share2, Tv } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { wide } from '@/messages/ns/wide';
import type { WorkoutActions } from '../types';

/**
 * Workout overview: ONE ⋯ button replacing the share / favourite / download icons
 * (enable_overview_more_menu_v1, canvas W-17 variant B). Same handlers as the icons — passed in as-is.
 * The "show on a big screen" row only exists when `onBigScreen` is given (enable_tv_mode_v1 on).
 */
export interface OverviewMoreMenuProps {
  actions: Pick<
    WorkoutActions,
    'isFav' | 'isFavToggling' | 'isFavDownloading' | 'isFavDownloaded' | 'downloadProgress' | 'isSharing' | 'onToggleFavorite' | 'onShare' | 'onDownload'
  >;
  onBigScreen?: () => void;
}

const ROW =
  'flex min-h-[44px] w-full items-start gap-2 rounded-xl px-3 py-2.5 text-start transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:opacity-50 disabled:hover:bg-transparent';

export default function OverviewMoreMenu({ actions, onBigScreen }: OverviewMoreMenuProps) {
  const t = useT(wide);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const items = useCallback(
    () => Array.from(wrap.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []),
    [],
  );

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }, []);

  useEffect(() => {
    if (open) items()[0]?.focus();
  }, [open, items]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key === 'Tab') {
      setOpen(false);
      return;
    }
    const list = items();
    if (!list.length) return;
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = (at + 1) % list.length;
    else if (e.key === 'ArrowUp') next = (at - 1 + list.length) % list.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    if (next >= 0) {
      e.preventDefault();
      list[next].focus();
    }
  };

  const run = (fn: () => void) => () => {
    close(true);
    fn();
  };

  const percent = new Intl.NumberFormat('he-IL', { style: 'percent' }).format(
    Math.min(100, Math.max(0, actions.downloadProgress)) / 100,
  );
  const downloadHint = actions.isFavDownloading
    ? t('menu.download.busy', { percent })
    : actions.isFavDownloaded
      ? t('menu.download.done')
      : t('menu.download.hint');

  return (
    <div ref={wrap} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-label={t('pair.menu.aria')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-11 items-center justify-center rounded-full active:scale-90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-[0_0_0_1px_rgba(14,27,42,0.08)]">
          <MoreHorizontal size={20} strokeWidth={1.8} className="text-gray-500" aria-hidden="true" />
        </span>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t('pair.menu.aria')}
          onKeyDown={onMenuKey}
          className="absolute end-0 top-full z-20 mt-2 min-w-[220px] rounded-2xl border border-slate-100 bg-white p-1.5 shadow-floating"
        >
          <button
            type="button"
            role="menuitem"
            disabled={actions.isFavToggling || actions.isFavDownloading || actions.isFavDownloaded}
            onClick={run(actions.onDownload)}
            className={ROW}
          >
            {actions.isFavDownloading ? (
              <Loader2 size={18} className="mt-0.5 flex-shrink-0 animate-spin text-slate-400" aria-hidden="true" />
            ) : (
              <ArrowDownCircle size={18} className={`mt-0.5 flex-shrink-0 ${actions.isFavDownloaded ? 'text-emerald-500' : 'text-slate-400'}`} aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold leading-snug text-slate-800">{t('menu.download')}</span>
              <span className="block text-[11px] font-medium leading-snug text-slate-500">{downloadHint}</span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={actions.isFavToggling}
            onClick={run(actions.onToggleFavorite)}
            className={ROW}
          >
            {actions.isFavToggling ? (
              <Loader2 size={18} className="mt-0.5 flex-shrink-0 animate-spin text-slate-400" aria-hidden="true" />
            ) : (
              <Heart size={18} className={`mt-0.5 flex-shrink-0 ${actions.isFav ? 'fill-red-500 text-red-500' : 'text-slate-400'}`} aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold leading-snug text-slate-800">{t('menu.fav')}</span>
              <span className="block text-[11px] font-medium leading-snug text-slate-500">
                {actions.isFav ? t('menu.fav.on') : t('menu.fav.hint')}
              </span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={actions.isSharing}
            onClick={run(actions.onShare)}
            className={ROW}
          >
            {actions.isSharing ? (
              <Loader2 size={18} className="mt-0.5 flex-shrink-0 animate-spin text-slate-400" aria-hidden="true" />
            ) : (
              <Share2 size={18} className="mt-0.5 flex-shrink-0 text-slate-400" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold leading-snug text-slate-800">{t('menu.share')}</span>
              <span className="block text-[11px] font-medium leading-snug text-slate-500">
                {actions.isSharing ? t('menu.share.busy') : t('menu.share.hint')}
              </span>
            </span>
          </button>
          {onBigScreen && (
            <>
              <div role="separator" className="mx-2 my-1 h-px bg-slate-100" />
              <button type="button" role="menuitem" onClick={run(onBigScreen)} className={`${ROW} bg-cyan-50 hover:bg-cyan-50`}>
                <Tv size={18} className="mt-0.5 flex-shrink-0 text-cyan-700" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold leading-snug text-cyan-700">{t('pair.menu.item')}</span>
                  <span className="block text-[11px] font-medium leading-snug text-slate-500">{t('pair.menu.hint')}</span>
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
