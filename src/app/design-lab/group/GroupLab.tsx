'use client';

import { useState } from 'react';
import { CalendarPlus, Flag, MapPin, Share2, UserPlus, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/v2';
import LabFrame from '../_shared/LabFrame';
import { AppIcon, FadeHero, Faces, GlassClose, ICON, Segmented, photo } from '../_app/parts';
import { GROUP } from '../home/fixtures';

type View = 'next' | 'week';

/**
 * Group page — the site's group screen (FanScreens GroupScreen) on the app's
 * fade-out hero: title, place, a free chip, the next-session box, one big
 * join button, who's coming, and the week's sessions.
 */
export default function GroupLab() {
  const [view, setView] = useState<View>('next');
  const [joined, setJoined] = useState(false);
  const [nudge, setNudge] = useState(true);
  const g = GROUP;
  const going = view === 'next' ? g.goingNext : g.goingWeek;
  return (
    <LabFrame
      panel={
        <div>
          <div className="mb-1 text-[22px] font-black tracking-v2-tight">Design lab · קבוצה</div>
          <p className="text-[14px] leading-relaxed text-v2-ink-2">
            המבנה של מסך הקבוצה מהאתר, עם הפייד־אאוט של האפליקציה. נתוני דמו בלבד.
          </p>
        </div>
      }
    >
      <div className="h-full overflow-y-auto overscroll-contain bg-white pb-36">
        <div className="relative">
          <FadeHero src={photo(g.photo)} height={280} position="50% 30%" />
          <div className="absolute end-4 top-[calc(env(safe-area-inset-top)+16px)]">
            <GlassClose href="/design-lab/home" />
          </div>
          <span className="v2-glass-chip absolute bottom-14 start-4 flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-extrabold text-white">
            <AppIcon src={ICON.walk} size={18} className="brightness-0 invert" />
            {g.kind}
          </span>
        </div>

        <div className="-mt-6 px-5">
          <h1 className="text-[26px] font-black leading-[1.08] !tracking-[-0.02em]">{g.name}</h1>
          <div className="mt-1.5 flex items-center gap-1 text-[14px] font-bold text-v2-muted">
            <MapPin size={15} strokeWidth={2.4} aria-hidden /> {g.where}
          </div>
          <span className="mt-2.5 inline-flex rounded-full bg-activity-steps/10 px-3 py-1 text-[12.5px] font-extrabold text-[#00865a]">
            {g.price}
          </span>

          {nudge && !joined && (
            <div className="relative mt-4 rounded-[20px] border border-v2-hairline-cool bg-gradient-to-br from-[#e8f9fe] to-[#e9fdfb] p-3.5">
              <button
                type="button"
                aria-label="סגירה"
                onClick={() => setNudge(false)}
                className="absolute -start-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-white shadow-v2-ring"
              >
                <X size={14} strokeWidth={2.6} />
              </button>
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-white text-v2-deep">
                  <Users size={19} strokeWidth={2.4} aria-hidden />
                </span>
                <span className="flex-1 text-[14px] font-bold leading-snug text-v2-ink-2">ההליכה הבאה מתחילה בעוד {g.next.inMinutes} דקות</span>
              </div>
            </div>
          )}

          <div className="mt-4 rounded-[20px] bg-v2-tint px-4 py-3">
            <div className="text-[13px] font-extrabold text-v2-deep">המפגש הבא</div>
            <div className="text-[17px] font-black">
              {g.next.label} · {g.next.when}
            </div>
          </div>

          <Button variant={joined ? 'ghost' : 'primary'} size="lg" block className="mt-3" onClick={() => setJoined((v) => !v)}>
            <UserPlus size={18} strokeWidth={2.6} aria-hidden />
            {joined ? 'נרשמת למפגש ✓' : 'הצטרפות למפגש'}
          </Button>

          <div className="mb-2 mt-6 flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-[17px] font-black">
              <Users size={18} strokeWidth={2.4} className="text-v2-deep" aria-hidden /> מי מגיע
            </span>
            <div className="w-[200px]">
              <Segmented
                id="group-view"
                options={[
                  { id: 'next' as const, label: 'המפגש הבא' },
                  { id: 'week' as const, label: 'השבוע' },
                ]}
                value={view}
                onChange={setView}
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-[20px] bg-v2-surface px-4 py-3 ring-1 ring-inset ring-v2-hairline">
            <Faces letters={going.letters} more={going.count - going.letters.length + (joined ? 1 : 0)} />
            <span className="text-end">
              <span className="block text-[16px] font-black">{going.count + (joined ? 1 : 0)} מגיעים</span>
              <span className="block text-[12.5px] font-bold text-v2-muted">{view === 'next' ? g.next.when : 'בכל המפגשים השבוע'}</span>
            </span>
          </div>

          <div className="mb-2 mt-6 text-[17px] font-black">המפגשים השבוע</div>
          <ul className="space-y-2">
            {g.sessions.map((s) => (
              <li key={s.day} className="flex items-center gap-3 rounded-[18px] bg-white px-4 py-3 shadow-v2-ring">
                <span className="w-14 text-[14px] font-black">{s.day}</span>
                <span className="flex-1 text-[14px] font-bold tabular-nums text-v2-ink-2">{s.time}</span>
                <span className="text-[13px] font-extrabold text-v2-muted">{s.going} מגיעים</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button variant="ghost">
              <Share2 size={16} strokeWidth={2.4} aria-hidden /> שיתוף
            </Button>
            <Button variant="ghost">
              <CalendarPlus size={16} strokeWidth={2.4} aria-hidden /> ליומן
            </Button>
          </div>
          <button type="button" className="mx-auto mt-5 flex items-center gap-1.5 text-[13px] font-bold text-v2-muted">
            <Flag size={14} strokeWidth={2.4} aria-hidden /> דיווח על תוכן לא ראוי
          </button>
        </div>
      </div>
    </LabFrame>
  );
}
