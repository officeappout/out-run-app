'use client';

/**
 * /embed/map's replacement for every real session/workout start and every
 * write action that needs auth. Mounted once (see MapShell), driven by
 * useEmbedDownloadPromptStore — any embed code that would otherwise start a
 * session or hit a write it can't complete anonymously calls
 * useEmbedDownloadPromptStore.getState().open() instead.
 */

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useEmbedDownloadPromptStore } from '@/features/parks/core/store/useEmbedDownloadPromptStore';

// Same store links as src/app/challenge/[inviteCode]/done/page.tsx —
// update IOS_STORE_URL there too when the app is published on the App Store.
const ANDROID_STORE_URL = 'https://play.google.com/store/apps/details?id=co.il.appout.outrun';
const IOS_STORE_URL = 'https://outrun.co.il'; // TODO: replace with apps.apple.com/…/id[APP_ID]

export default function DownloadAppPrompt() {
  const isOpen = useEmbedDownloadPromptStore((s) => s.isOpen);
  const close = useEmbedDownloadPromptStore((s) => s.close);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad/.test(ua));
    setIsAndroid(/android/.test(ua));
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50"
      dir="rtl"
      onClick={close}
    >
      <div
        className="w-full max-w-sm bg-white rounded-t-3xl px-6 pt-5 pb-8"
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 0px))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end">
          <button onClick={close} className="p-1 text-gray-400 hover:text-gray-600" aria-label="סגור">
            <X size={20} />
          </button>
        </div>

        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🤘</div>
          <h2 className="text-lg font-bold text-gray-900 mb-1.5">
            כדי להתחיל אימון, תוריד את האפליקציה
          </h2>
          <p className="text-sm text-gray-500">
            כאן אפשר לבנות מסלול ולראות גינות באזור — האימון עצמו, ועוד הרבה יותר, מחכה לך באפליקציה
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {(isIOS || !isAndroid) && (
            <a
              href={IOS_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-12 rounded-xl border flex items-center justify-center gap-3 text-sm font-semibold no-underline"
              style={{ borderColor: '#e2e8f0', color: '#374151' }}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              הורדה מ-App Store
            </a>
          )}
          {(isAndroid || !isIOS) && (
            <a
              href={ANDROID_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-12 rounded-xl border flex items-center justify-center gap-3 text-sm font-semibold no-underline"
              style={{ borderColor: '#e2e8f0', color: '#374151' }}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
                <path fill="#3DDC84" d="M17.523 15.339L7.477 15.34l-2.477 4.16C5.323 19.94 6.03 20.5 6.87 20.5h10.26c.84 0 1.547-.56 1.87-1l-2.477-4.16ZM5.523 8.661l-2.046 3.5h17.046l-2.046-3.5H5.523ZM15.12 3.5 12 8.5 8.88 3.5H15.12Z" />
              </svg>
              הורדה מ-Google Play
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
