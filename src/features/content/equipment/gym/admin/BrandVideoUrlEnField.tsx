'use client';

import type { ReactNode } from 'react';
import { Video } from 'lucide-react';

/**
 * Optional English video for one brand (brands[].videoUrlEn). Played only for English users while
 * enable_video_locale is on; left empty, everyone keeps the Hebrew videoUrl.
 */
export default function BrandVideoUrlEnField({
  value,
  onChange,
  preview,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  preview?: ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-bold text-gray-700 mb-2">
        <Video size={16} className="inline mr-2" />
        Video URL (English) <span className="font-normal text-gray-400">(אופציונלי)</span>
      </label>
      <input
        type="url"
        dir="ltr"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-2 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
        placeholder="https://player.mediadelivery.net/play/640043/..."
      />
      {value && preview && <div className="mt-3">{preview}</div>}
    </div>
  );
}
