'use client';

import { sectionTitleClass } from './section-styles';

interface ParkPhotosSectionProps {
  v2: boolean;
  photos: string[];
  onOpenPhoto: (url: string) => void;
}

/** PHOTOS — park images + review snapshots (horizontal strip). */
export default function ParkPhotosSection({ v2, photos, onOpenPhoto }: ParkPhotosSectionProps) {
  return (
    <section className="mb-6">
      <h3 className={sectionTitleClass(v2)}>תמונות</h3>
      <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1 scrollbar-hide">
        {photos.map((url, i) => (
          <button
            key={i}
            onClick={() => onOpenPhoto(url)}
            className="flex-shrink-0 w-[140px] h-[100px] rounded-xl overflow-hidden bg-gray-100 dark:bg-slate-800 active:scale-95 transition-transform"
          >
            <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
          </button>
        ))}
      </div>
    </section>
  );
}
