'use client';

import { useEffect } from 'react';
import { RefreshCw, MapPin } from 'lucide-react';

export default function MapError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[map-error]', error.message, '\nstack:', error.stack, '\ndigest:', error.digest);
  }, [error]);

  return (
    <div
      dir="rtl"
      className="fixed inset-0 flex flex-col items-center justify-center bg-[#f3f4f6] gap-4 p-6"
    >
      <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center">
        <MapPin className="w-7 h-7 text-gray-400" />
      </div>
      <p className="text-[15px] font-bold text-gray-800">המפה נתקלה בבעיה</p>
      <p className="text-[13px] text-gray-500 text-center max-w-xs leading-relaxed">
        לרוב זה נפתר לאחר טעינה מחדש. הנתונים שלך נשמרו.
      </p>
      <button
        onClick={reset}
        className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gray-900 text-white text-[14px] font-bold active:scale-95 transition-transform"
      >
        <RefreshCw className="w-4 h-4" />
        נסה שוב
      </button>
    </div>
  );
}
