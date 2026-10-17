'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ChevronDown, Home, Settings2, Sparkles, Trees } from 'lucide-react';
import { Button, EASE_V2 } from '@/components/ui/v2';
import { AppIcon, Bolts, ICON } from '../_app/parts';

/**
 * The workout builder ("בנה אימון משלך" — today's WorkoutBuilderSheet) in the
 * glass language: the same sections in the same order, softer surfaces, one
 * accent, the brand gradient only on the selected state and the CTA.
 */

const DURATIONS = [15, 30, 45, 60];
const DURATION_LINE: Record<number, string> = {
  15: 'קצר וחד. מושלם להפסקה',
  30: 'קלאסי. הזמן שעובד לרוב',
  45: 'מספיק זמן לעבוד על הכל',
  60: 'למי שאוהב להשקיע בעצמו',
};
const PROGRAMS = [
  { id: 'auto', label: 'אוטו', sub: 'מומלץ', icon: null },
  { id: 'full', label: 'גוף מלא', sub: 'רמה 4', icon: ICON.strength },
  { id: 'flag', label: 'דגל אנושי', sub: 'רמה 6', icon: ICON.strength },
  { id: 'legs', label: 'רגליים', sub: 'רמה 3', icon: ICON.strength },
];
const PRIMARY = ['חזה', 'גב', 'כתפיים', 'רגליים', 'בטן'];
const SECONDARY = ['יד קדמית', 'יד אחורית', 'ישבן', 'שוקיים'];
const INTENSITY: { id: 1 | 2 | 3; label: string }[] = [
  { id: 1, label: 'קליל' },
  { id: 2, label: 'מאוזן' },
  { id: 3, label: 'עצים' },
];

export default function BuilderSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduce = useReducedMotion();
  const [place, setPlace] = useState<'out' | 'home'>('out');
  const [minutes, setMinutes] = useState(30);
  const [program, setProgram] = useState('auto');
  const [areasOpen, setAreasOpen] = useState(false);
  const [areas, setAreas] = useState<string[]>([]);
  const [intensity, setIntensity] = useState<1 | 2 | 3>(2);
  const toggleArea = (a: string) => setAreas((x) => (x.includes(a) ? x.filter((y) => y !== a) : [...x, a]));
  const chosen = PROGRAMS.find((p) => p.id === program)!;

  const pill = (on: boolean) =>
    `transition-[transform,background-color,box-shadow] duration-150 ease-v2 active:scale-[0.97] ${
      on ? 'bg-v2-cta text-v2-on-cta shadow-v2-cta' : 'bg-white/80 text-v2-ink-2 shadow-v2-ring'
    }`;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[10] flex flex-col bg-v2-surface"
          role="dialog"
          aria-modal="true"
          aria-label="בנה אימון משלך"
          initial={reduce ? { opacity: 0 } : { y: '100%' }}
          animate={reduce ? { opacity: 1 } : { y: 0 }}
          exit={reduce ? { opacity: 0 } : { y: '100%' }}
          transition={{ duration: 0.42, ease: [0.32, 0.72, 0, 1] }}
        >
          {/* soft brand wash behind the glass */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[260px] bg-gradient-to-b from-[#d9f6fd] via-[#eefcfb] to-transparent" />

          <header className="v2-glass-bar relative z-[2] flex items-center gap-3 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+14px)]">
            <button
              type="button"
              onClick={onClose}
              aria-label="חזרה"
              className="grid h-11 w-11 place-items-center rounded-full bg-white/80 shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
            >
              <ArrowRight size={19} strokeWidth={2.4} />
            </button>
            <div>
              <div className="text-[19px] font-black leading-tight">בנה אימון משלך</div>
              <div className="text-[12.5px] font-bold text-v2-muted">מותאם אישית לפי הבחירות שלך</div>
            </div>
          </header>

          <div className="relative flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 pb-36 pt-4">
            <div className="flex items-start gap-3 rounded-[18px] bg-white/70 p-3 shadow-v2-ring">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-v2-tint text-v2-deep">
                <Sparkles size={17} strokeWidth={2.4} aria-hidden />
              </span>
              <span className="text-[13.5px] font-bold leading-snug text-v2-ink-2">
                <b className="block font-black text-v2-ink">מילאנו עבורכם הגדרות מומלצות</b>
                תוכנית, משך, עצימות ואזורי אימון. אפשר לשנות כל דבר למטה.
              </span>
            </div>

            <Section title="מיקום וציוד">
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { id: 'out' as const, label: 'בחוץ', sub: 'פארק / מגרש', icon: Trees },
                  { id: 'home' as const, label: 'בבית', sub: 'אימון ביתי', icon: Home },
                ].map(({ id, label, sub, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPlace(id)}
                    aria-pressed={place === id}
                    className={`flex items-center gap-3 rounded-[20px] p-3 text-start transition-[transform,box-shadow] duration-150 ease-v2 active:scale-[0.98] ${
                      place === id ? 'bg-white shadow-v2-card ring-2 ring-v2-accent' : 'bg-white/70 shadow-v2-ring'
                    }`}
                  >
                    <span className={`grid h-11 w-11 place-items-center rounded-[14px] ${place === id ? 'bg-v2-cta text-v2-on-cta' : 'bg-v2-tint text-v2-deep'}`}>
                      <Icon size={20} strokeWidth={2.4} aria-hidden />
                    </span>
                    <span>
                      <span className="block text-[16px] font-black">{label}</span>
                      <span className="block text-[12.5px] font-bold text-v2-muted">{sub}</span>
                    </span>
                  </button>
                ))}
              </div>
              <button type="button" className="mt-2 flex items-center gap-1.5 text-[13px] font-extrabold text-v2-deep">
                <Settings2 size={14} strokeWidth={2.6} aria-hidden />
                עריכת הציוד שיש לי
              </button>
            </Section>

            <Section title="משך זמן">
              <div className="grid grid-cols-5 gap-2">
                {DURATIONS.map((d) => (
                  <button key={d} type="button" onClick={() => setMinutes(d)} aria-pressed={minutes === d} className={`flex h-[58px] flex-col items-center justify-center rounded-[16px] ${pill(minutes === d)}`}>
                    <span className="text-[19px] font-black leading-none tabular-nums">{d}</span>
                    <span className="mt-0.5 text-[11px] font-bold opacity-75">דק׳</span>
                  </button>
                ))}
                <button type="button" className={`h-[58px] rounded-[16px] text-[14px] font-extrabold ${pill(false)}`}>
                  אחר
                </button>
              </div>
              <p className="mt-2 text-[13px] font-bold text-v2-deep">{DURATION_LINE[minutes]}</p>
            </Section>

            <Section title="תוכנית">
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                {PROGRAMS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProgram(p.id)}
                    aria-pressed={program === p.id}
                    className={`flex h-12 shrink-0 items-center gap-2 rounded-full pe-4 ps-3 ${pill(program === p.id)}`}
                  >
                    {p.icon ? (
                      <AppIcon src={p.icon} size={20} className={program === p.id ? '' : 'opacity-80'} />
                    ) : (
                      <Sparkles size={17} strokeWidth={2.4} aria-hidden />
                    )}
                    <span className="text-start leading-tight">
                      <span className="block text-[14px] font-extrabold">{p.label}</span>
                      <span className="block text-[11px] font-bold opacity-75">{p.sub}</span>
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[13px] font-bold text-v2-ink-2">
                יאומן לפי <b className="font-black text-v2-ink">{chosen.id === 'auto' ? 'גוף מלא' : chosen.label}</b> — הותאם אוטומטית לשרירים שבחרת.
              </p>
            </Section>

            <Section title="אזור אימון" hint="ריק = כל הגוף">
              <button
                type="button"
                onClick={() => setAreasOpen((v) => !v)}
                aria-expanded={areasOpen}
                className="flex h-12 w-full items-center justify-between rounded-[16px] bg-white/80 px-4 text-[14.5px] font-extrabold shadow-v2-ring"
              >
                {areas.length ? `${areas.length} אזורים נבחרו` : 'כל הגוף (לחץ לסינון)'}
                <motion.span animate={{ rotate: areasOpen ? 180 : 0 }} transition={{ duration: 0.25, ease: EASE_V2 }}>
                  <ChevronDown size={18} strokeWidth={2.6} aria-hidden />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {areasOpen && (
                  <motion.div
                    initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                    animate={reduce ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                    exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: EASE_V2 }}
                    className="overflow-hidden"
                  >
                    {[
                      ['שרירים ראשיים', PRIMARY],
                      ['שרירים משניים', SECONDARY],
                    ].map(([t, list]) => (
                      <div key={t as string} className="mt-3">
                        <div className="mb-1.5 text-[12.5px] font-extrabold text-v2-muted">{t as string}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {(list as string[]).map((a) => (
                            <button key={a} type="button" onClick={() => toggleArea(a)} aria-pressed={areas.includes(a)} className={`h-9 rounded-full px-4 text-[13px] font-extrabold ${pill(areas.includes(a))}`}>
                              {a}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </Section>

            <Section title="עוצמה">
              <div className="grid grid-cols-3 gap-2">
                {INTENSITY.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => setIntensity(it.id)}
                    aria-pressed={intensity === it.id}
                    className={`flex h-[66px] flex-col items-center justify-center gap-1 rounded-[18px] transition-[transform,box-shadow] duration-150 ease-v2 active:scale-[0.97] ${
                      intensity === it.id ? 'bg-white shadow-v2-card ring-2 ring-v2-accent' : 'bg-white/70 shadow-v2-ring'
                    }`}
                  >
                    <Bolts level={it.id} size={16} />
                    <span className={`text-[14px] font-extrabold ${intensity === it.id ? 'text-v2-deep' : 'text-v2-ink-2'}`}>{it.label}</span>
                  </button>
                ))}
              </div>
              {minutes <= 15 && intensity === 3 && (
                <p className="mt-2 text-[13px] font-bold text-v2-deep">אימון קצר + עצימות גבוהה → בלאסט אוטומטי</p>
              )}
            </Section>
          </div>

          <div className="v2-glass-bar absolute inset-x-0 bottom-0 z-[2] px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
            <Button variant="primary" size="lg" block onClick={onClose}>
              <Sparkles size={18} strokeWidth={2.6} aria-hidden />
              צור אימון · {minutes} דק׳
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2.5 flex items-baseline gap-2">
        <h3 className="text-[17px] font-black">{title}</h3>
        {hint && <span className="text-[12.5px] font-bold text-v2-muted">{hint}</span>}
      </div>
      {children}
    </section>
  );
}
