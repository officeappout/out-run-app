'use client';

/**
 * ForceUpdateGate — full-screen "update to continue" for native builds below
 * `app_config/app_version` minBuild. Mounted once in NativeBootstrap.
 *
 * Web: renders nothing, reads nothing. Native: checks on launch and on every
 * resume (so flipping the switch in the panel reaches open apps too). Fails
 * open — any error leaves the app usable.
 */
import { useEffect, useState } from 'react';
import { needsForceUpdate } from '../app-version.logic';
import { loadAppVersionConfig } from '../app-version.service';
import type { AppVersionConfig } from '../app-version.types';

type Block = { config: AppVersionConfig; platform: 'ios' | 'android' };

function nativePlatform(): string | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
  };
  return w.Capacitor?.isNativePlatform?.() ? w.Capacitor.getPlatform?.() ?? null : null;
}

export default function ForceUpdateGate() {
  const [block, setBlock] = useState<Block | null>(null);

  useEffect(() => {
    const platform = nativePlatform();
    if (platform !== 'ios' && platform !== 'android') return;

    let cancelled = false;
    let removeListener: (() => void) | undefined;

    const check = async () => {
      try {
        const { App } = await import('@capacitor/app');
        const [info, config] = await Promise.all([App.getInfo(), loadAppVersionConfig()]);
        if (cancelled) return;
        setBlock(needsForceUpdate(platform, info.build, config) ? { config, platform } : null);
      } catch {
        /* fail open */
      }
    };

    void check();
    void import('@capacitor/app')
      .then(({ App }) =>
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) void check();
        }),
      )
      .then((handle) => {
        if (cancelled) void handle.remove();
        else removeListener = () => void handle.remove();
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, []);

  if (!block) return null;
  const { config, platform } = block;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="force-update-title"
      dir="rtl"
      className="fixed inset-0 z-[2147483647] flex flex-col items-center justify-center gap-5 bg-white px-8 text-center"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-cyan-50">
        <div className="h-10 w-10 rounded-full border-[6px] border-[#00ADEF]" />
      </div>
      <h1 id="force-update-title" className="text-2xl font-black text-slate-900">
        {config.title}
      </h1>
      <p className="max-w-sm text-base leading-relaxed text-slate-600">{config.message}</p>
      <a
        href={config[platform].storeUrl}
        className="mt-2 w-full max-w-xs rounded-2xl bg-[#00ADEF] px-6 py-4 text-lg font-bold text-white active:scale-[0.98]"
      >
        {config.buttonLabel}
      </a>
    </div>
  );
}
