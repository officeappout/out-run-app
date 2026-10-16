'use client';

import { useState } from 'react';
import { Droplets, Lamp, MapPin, Navigation, Pencil, Play, Sofa, Sun, Users } from 'lucide-react';
import { Button } from '@/components/ui/v2';
import LabFrame from '../_shared/LabFrame';
import { FadeHero, Faces, GlassClose, Segmented, photo, thumb } from '../_app/parts';
import { PARK } from '../home/fixtures';

type When = 'today' | 'tomorrow' | 'week';
const WHEN: { id: When; label: string }[] = [
  { id: 'today', label: 'היום' },
  { id: 'tomorrow', label: 'מחר' },
  { id: 'week', label: 'השבוע' },
];
const AMENITY_ICON = [Sun, Droplets, Sofa, Lamp];

/** Park page — the white fade-out hero, who's training here, amenities, facilities. */
export default function ParkLab() {
  const [when, setWhen] = useState<When>('today');
  const [going, setGoing] = useState(false);
  const list = PARK.training[when];
  return (
    <LabFrame
      panel={
        <div>
          <div className="mb-1 text-[22px] font-black tracking-v2-tight">Design lab · פארק</div>
          <p className="text-[14px] leading-relaxed text-v2-ink-2">
            הפייד־אאוט נשאר. מי מתאמן כאן עם &quot;אני מגיע&quot;, מתקנים עם תמונות, כפתור אימון מתאים לגינה. נתוני דמו בלבד.
          </p>
        </div>
      }
    >
      <div className="h-full overflow-y-auto overscroll-contain bg-white pb-32">
        <div className="relative">
          <FadeHero src={photo(PARK.photo)} height={300} />
          <div className="absolute end-4 top-[calc(env(safe-area-inset-top)+16px)]">
            <GlassClose href="/design-lab/home" />
          </div>
        </div>
        <div className="-mt-10 px-5">
          <span className="relative inline-flex rounded-full bg-v2-cta px-3 py-1 text-[12.5px] font-extrabold text-v2-on-cta shadow-v2-cta">
            גינת כושר
          </span>
          <h1 className="mt-2 text-[26px] font-black leading-[1.08] !tracking-[-0.02em]">{PARK.name}</h1>
          <div className="mt-1.5 flex items-center gap-3 text-[13.5px] font-bold text-v2-muted">
            <span className="flex items-center gap-1">
              <Navigation size={14} strokeWidth={2.4} aria-hidden /> {PARK.distance}
            </span>
            <span className="flex items-center gap-1">
              <MapPin size={14} strokeWidth={2.4} aria-hidden /> {PARK.city}
            </span>
          </div>

          <div className="mb-2 mt-6 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[17px] font-black">
              <Users size={18} strokeWidth={2.4} className="text-v2-deep" aria-hidden /> מתאמנים כאן
            </span>
          </div>
          <Segmented id="park-when" options={WHEN} value={when} onChange={setWhen} />
          <div className="mt-3 rounded-[20px] bg-v2-surface p-3 ring-1 ring-inset ring-v2-hairline">
            <ul className="space-y-2">
              {list.map((t) => (
                <li key={t.time + t.who} className="flex items-center gap-3">
                  <span className="w-14 shrink-0 text-[13px] font-extrabold tabular-nums text-v2-muted">{t.time}</span>
                  <Faces letters={[t.who[0]]} />
                  <span className="text-[14.5px] font-extrabold">
                    {t.who} · <span className="font-bold text-v2-ink-2">{t.what}</span>
                  </span>
                </li>
              ))}
            </ul>
            <Button variant={going ? 'dark' : 'primary'} block className="mt-3" onClick={() => setGoing((v) => !v)}>
              {going ? 'נרשמת: היום 18:00 ✓' : 'אני מגיע…'}
            </Button>
          </div>

          <div className="mb-2 mt-6 text-[17px] font-black">פירוט על הפארק</div>
          <div className="flex flex-wrap gap-2">
            {PARK.amenities.map((a, i) => {
              const Icon = AMENITY_ICON[i];
              return (
                <span key={a} className="flex h-10 items-center gap-1.5 rounded-full bg-white px-3.5 text-[13.5px] font-extrabold shadow-v2-ring">
                  <Icon size={16} strokeWidth={2.4} className="text-v2-deep" aria-hidden />
                  {a}
                </span>
              );
            })}
          </div>

          <div className="mb-2 mt-6 flex items-baseline justify-between">
            <span className="text-[17px] font-black">מתקנים</span>
            <span className="text-[13px] font-bold text-v2-muted">{PARK.facilities.length} מתקנים</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {PARK.facilities.map((f) => (
              <div key={f.name} className="overflow-hidden rounded-[20px] bg-white shadow-v2-card">
                <img src={thumb(f.video)} alt="" className="h-[96px] w-full object-cover" loading="lazy" />
                <div className="px-3 py-2 text-[14px] font-extrabold">{f.name}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-[5] flex gap-2 border-t border-v2-hairline bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3">
        <Button variant="primary" size="lg" block className="flex-1">
          <Play size={18} strokeWidth={2.6} className="fill-current" aria-hidden />
          אימון שמתאים לגינה הזו
        </Button>
        <button type="button" aria-label="עריכת פרטי הפארק" className="grid h-14 w-14 shrink-0 place-items-center rounded-full ring-1 ring-inset ring-v2-pill-border">
          <Pencil size={18} strokeWidth={2.4} />
        </button>
        <button type="button" aria-label="ניווט לפארק" className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-v2-deep ring-1 ring-inset ring-v2-pill-border">
          <Navigation size={18} strokeWidth={2.4} />
        </button>
      </div>
    </LabFrame>
  );
}
