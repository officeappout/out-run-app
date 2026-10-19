'use client';

/**
 * Background as 64px tiles (SH-4): your photo · OUT colours · clean ·
 * another photo. Without a photo the "add a photo" tile comes first with a
 * hint (SH-4c); a photo that can't be drawn (CORS) is marked unavailable.
 */
import type { ReactNode } from 'react';
import { Check, ImagePlus } from 'lucide-react';
import type { BrandStyle, ShareBackground, ShareKind } from '../../share-v2/types';
import type { PhotoState } from './useSharePreviews';

const BRAND_SWATCH: Record<BrandStyle, string> = {
  cyan: 'linear-gradient(160deg,#00baf7,#0cf2e3)',
  navy: 'radial-gradient(120% 90% at 50% 38%, #0d3446 0%, #0a1820 60%, #070e13 100%)',
  night: 'linear-gradient(170deg,#061620 0%,#0a2634 55%,#0c3a44 100%)',
};

function Tile({ on, label, onClick, disabled, children }: { on: boolean; label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className="flex min-w-0 flex-1 flex-col items-center gap-1.5 transition-transform duration-150 ease-v2 active:scale-[0.97] disabled:active:scale-100"
    >
      <span
        className={`relative block h-16 w-16 rounded-[16px] ${on ? 'shadow-[0_0_0_2.5px_#00baf7,0_6px_14px_-8px_rgba(0,186,247,0.7)]' : 'shadow-[0_0_0_1px_rgba(14,27,42,0.1)]'}`}
      >
        {children}
        {on && (
          <span className="absolute -left-1.5 -top-1.5 grid h-[22px] w-[22px] place-items-center rounded-full bg-[#00baf7] shadow-[0_0_0_2.5px_#fff]">
            <Check size={13} strokeWidth={3.2} className="text-white" aria-hidden />
          </span>
        )}
      </span>
      <span className={`whitespace-nowrap text-[12.5px] ${on ? 'font-black text-v2-deep' : 'font-extrabold text-v2-ink-2'}`}>{label}</span>
    </button>
  );
}

export default function ShareBackgroundTiles({
  value,
  kind,
  brand,
  photoUrl,
  photo,
  onChange,
  onPickPhoto,
}: {
  value: ShareBackground;
  kind: ShareKind;
  brand: BrandStyle;
  photoUrl: string | null;
  photo: PhotoState;
  onChange: (bg: ShareBackground) => void;
  onPickPhoto: () => void;
}) {
  const failed = photo.status === 'failed';
  const pick = (
    <Tile key="pick" on={false} label={photoUrl ? 'תמונה אחרת' : 'הוספת תמונה'} onClick={onPickPhoto}>
      <span className="absolute inset-0 grid place-items-center rounded-[16px] bg-v2-surface text-v2-deep shadow-[inset_0_0_0_1.5px_#b9d3e0]">
        <ImagePlus size={22} strokeWidth={2.4} aria-hidden />
      </span>
    </Tile>
  );
  return (
    <div>
      <div className="flex gap-2 pt-1">
        {!photoUrl && pick}
        {photoUrl && (
          <Tile on={value === 'photo' && !failed} label={failed ? 'לא זמינה' : 'התמונה שלך'} onClick={() => onChange('photo')} disabled={failed}>
            <span
              className={`absolute inset-0 rounded-[16px] bg-cover ${failed ? 'opacity-40 grayscale' : ''}`}
              style={{ backgroundImage: `url("${photoUrl}")`, backgroundPosition: 'center 20%' }}
            />
          </Tile>
        )}
        <Tile on={value === 'brand'} label={kind === 'cardio' && brand === 'night' ? 'לילה' : 'צבעי OUT'} onClick={() => onChange('brand')}>
          <span className="absolute inset-0 rounded-[16px]" style={{ background: BRAND_SWATCH[brand] }} />
        </Tile>
        <Tile on={value === 'plain'} label="נקי" onClick={() => onChange('plain')}>
          <span className="absolute inset-0 rounded-[16px] bg-v2-surface shadow-[inset_0_0_0_1px_#e6edf2]" />
        </Tile>
        {photoUrl && pick}
      </div>
      {!photoUrl && <p className="mt-2 text-[12.5px] font-bold text-v2-muted">אפשר להוסיף תמונה מהאימון — הנתונים יופיעו עליה.</p>}
      {failed && <p className="mt-2 text-[12.5px] font-bold text-v2-muted">את התמונה הזו לא הצלחנו לצרף. אפשר לבחור תמונה מהגלריה.</p>}
    </div>
  );
}
