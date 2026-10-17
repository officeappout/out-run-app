"use client";

import { useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
  useScroll,
  useTransform,
  type PanInfo,
} from "framer-motion";
import {
  ArrowDownCircle,
  ArrowRight,
  ChevronDown,
  Clock,
  Heart,
  Link2,
  Play,
  Share2,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { EASE_V2 } from "@/components/ui/v2";
import { AppIcon, Bolts, ICON, thumb } from "../_app/parts";
import { useCompact } from "../_app/density";
import {
  EXERCISES,
  PARKS,
  WORKOUT,
  type LabExercise,
  type WorkoutLocation,
} from "./fixtures";

/**
 * The workout page — today's WorkoutPreviewDrawer layout kept as is (the
 * owner likes it), refined with the glass language: glass controls over the
 * video, the hero shrinking into a glass sticky header, softer cards with
 * the v2 hairline/shadow, one accent, the gradient only on the CTA.
 */

const TRIO = [
  { id: "balanced", label: "מאוזן", minutes: 30, level: 2 as const },
  { id: "intense", label: "עצים ומהיר", minutes: 20, level: 3 as const },
  { id: "light", label: "אימון פארק קליל", minutes: 15, level: 1 as const },
];
const PLACES: { id: WorkoutLocation; label: string; gear: string[] }[] = [
  { id: "park", label: "פארק", gear: ["מתח", "מקבילים"] },
  { id: "home", label: "בית", gear: ["משקל גוף"] },
];
const MUSCLES = [
  { label: "חזה", icon: ICON.chest },
  { label: "גב", icon: ICON.back },
  { label: "כתפיים", icon: ICON.shoulders },
  { label: "יד אחורית", icon: ICON.triceps },
];

export default function WorkoutDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && <DrawerBody key="drawer" onClose={onClose} />}
    </AnimatePresence>
  );
}

// Hooks live here so useScroll's container ref is mounted when it's read.
function DrawerBody({ onClose }: { onClose: () => void }) {
  const reduce = useReducedMotion();
  const c = useCompact();
  const drag = useDragControls();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll({ container: scrollRef });
  const heroScale = useTransform(scrollY, [0, 200], [1, reduce ? 1 : 0.86]);
  const heroOpacity = useTransform(scrollY, [0, 200], [1, 0.3]);
  const headerOpacity = useTransform(scrollY, [60, 120], [0, 1]);

  const [trio, setTrio] = useState(TRIO[0].id);
  const [place, setPlace] = useState<WorkoutLocation>("park");
  const [placeOpen, setPlaceOpen] = useState(false);
  const [warmupOpen, setWarmupOpen] = useState(true);
  const [warmupOn, setWarmupOn] = useState(true);
  const [liked, setLiked] = useState(false);
  const [share, setShare] = useState(true);
  const [muted, setMuted] = useState(true);
  const t = TRIO.find((x) => x.id === trio)!;
  const plan = EXERCISES[place];
  const p = PLACES.find((x) => x.id === place)!;

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[10]"
      role="dialog"
      aria-modal="true"
      aria-label="פרטי האימון"
    >
      <motion.button
        type="button"
        aria-label="סגירה"
        className="absolute inset-0 bg-[#0e1419]/40 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="absolute inset-x-0 bottom-0 flex h-[95%] flex-col overflow-hidden rounded-t-[32px] bg-white shadow-v2-sheet"
        initial={reduce ? { opacity: 0 } : { y: "100%" }}
        animate={reduce ? { opacity: 1 } : { y: 0 }}
        exit={reduce ? { opacity: 0 } : { y: "100%" }}
        transition={{ duration: 0.42, ease: [0.32, 0.72, 0, 1] }}
        drag={reduce ? false : "y"}
        dragControls={drag}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.04, bottom: 0.7 }}
        onDragEnd={onDragEnd}
      >
        {/* drag handle */}
        <div
          className="absolute inset-x-0 top-0 z-[6] flex cursor-grab touch-none justify-center pt-2.5"
          onPointerDown={(e) => drag.start(e)}
        >
          <span className="h-1.5 w-10 rounded-full bg-white/80 shadow-v2-ring" />
        </div>

        {/* collapsed glass header */}
        <motion.div
          style={{ opacity: headerOpacity }}
          className="v2-glass-bar pointer-events-none absolute inset-x-0 top-0 z-[5] flex items-center gap-3 px-4 pb-2.5 pt-6"
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full bg-white/80 shadow-v2-ring"
          >
            <ArrowRight size={18} strokeWidth={2.4} />
          </button>
          <span className="line-clamp-2 flex-1 text-center text-[16px] font-black leading-tight">
            {WORKOUT.title}
          </span>
          <span className="w-10" />
        </motion.div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overscroll-contain pb-48"
        >
          {/* hero */}
          <motion.div
            style={{ scale: heroScale, opacity: heroOpacity }}
            className="relative h-[320px] origin-top"
          >
            <img
              src={WORKOUT.photo}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-[60%_30%]"
              style={{
                WebkitMaskImage:
                  "linear-gradient(to top, transparent 13%, rgba(0,0,0,.4) 42%, #000 85%)",
                maskImage:
                  "linear-gradient(to top, transparent 13%, rgba(0,0,0,.4) 42%, #000 85%)",
              }}
            />
            <span className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/25 to-transparent" />
            <button
              type="button"
              onClick={onClose}
              aria-label="סגירה"
              className="v2-glass-chip absolute end-4 top-6 grid h-10 w-10 place-items-center rounded-full text-white transition-transform duration-150 ease-v2 active:scale-[0.97]"
            >
              <X size={19} strokeWidth={2.6} />
            </button>
          </motion.div>

          <div className="relative -mt-14 px-4">
            {/* title */}
            <h1 className={`flex items-center gap-2 ${c ? "text-[20px]" : "text-[22px]"} font-black leading-tight !tracking-[-0.02em]`}>
              <AppIcon
                src="/icons/programs/full_body.svg"
                size={22}
                className="brightness-0"
              />
              {WORKOUT.title}
            </h1>

            {/* intensity (trio) */}
            <div
              className="mt-3 grid grid-cols-3 gap-1 rounded-full bg-white/80 p-1 shadow-v2-ring backdrop-blur"
              role="radiogroup"
              aria-label="עצימות"
            >
              {TRIO.map((o) => {
                const on = o.id === trio;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setTrio(o.id)}
                    className={`relative flex ${c ? "h-[46px]" : "h-[52px]"} flex-col items-center justify-center gap-0.5 rounded-full`}
                  >
                    {on && (
                      <motion.span
                        layoutId="lab-trio"
                        className="absolute inset-0 rounded-full bg-v2-tint ring-1 ring-inset ring-v2-accent/40"
                        transition={{
                          duration: reduce ? 0 : 0.3,
                          ease: EASE_V2,
                        }}
                      />
                    )}
                    <span className="relative">
                      <Bolts level={o.level} size={12} />
                    </span>
                    <span
                      className={`relative truncate px-1 text-[11.5px] font-extrabold tabular-nums ${on ? "text-v2-deep" : "text-v2-muted"}`}
                    >
                      {o.label} · {o.minutes}׳
                    </span>
                  </button>
                );
              })}
            </div>

            {/* location */}
            <div className="relative mt-4 flex items-center gap-2">
              <span className="text-[13px] font-bold text-v2-muted">
                איפה מתאמנים?
              </span>
              <button
                type="button"
                onClick={() => setPlaceOpen((v) => !v)}
                aria-expanded={placeOpen}
                className="flex h-10 items-center gap-2 rounded-full bg-white pe-3 ps-3.5 text-[14px] font-extrabold shadow-v2-ring"
              >
                <AppIcon
                  src={place === "park" ? ICON.pullBar : ICON.bench}
                  size={18}
                />
                {p.label}
                <ChevronDown
                  size={15}
                  strokeWidth={2.6}
                  className="text-v2-muted"
                  aria-hidden
                />
              </button>
              <AnimatePresence>
                {placeOpen && (
                  <motion.ul
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.18, ease: EASE_V2 }}
                    className="v2-glass-card absolute start-24 top-12 z-[3] w-[220px] origin-top rounded-[18px] p-1.5"
                  >
                    {PLACES.map((o) => (
                      <li key={o.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setPlace(o.id);
                            setPlaceOpen(false);
                          }}
                          className={`w-full rounded-[14px] px-3 py-2 text-start ${o.id === place ? "bg-v2-tint" : ""}`}
                        >
                          <span className="block text-[14px] font-extrabold">
                            {o.label}
                          </span>
                          <span className="block text-[12px] font-bold text-v2-muted">
                            {o.gear.join(" · ")}
                          </span>
                        </button>
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>

            {/* meta row */}
            <div className="mt-4 flex items-center gap-2">
              <span className="flex h-10 items-center gap-1.5 rounded-[14px] bg-white px-3 text-[13px] font-extrabold shadow-v2-ring">
                <Bolts level={t.level} size={13} />{" "}
                {t.level === 1 ? "קל" : t.level === 2 ? "בינוני" : "מאתגר"}
              </span>
              <span className="flex h-10 items-center gap-1.5 rounded-[14px] bg-white px-3 text-[13px] font-extrabold tabular-nums shadow-v2-ring">
                <Clock
                  size={14}
                  strokeWidth={2.4}
                  className="text-v2-muted"
                  aria-hidden
                />{" "}
                {t.minutes} דק׳
              </span>
              <span className="flex-1" />
              <IconBtn
                label="שתף"
                icon={<Share2 size={18} strokeWidth={2.3} />}
              />
              <IconBtn
                label="מועדפים"
                pressed={liked}
                onClick={() => setLiked((v) => !v)}
                icon={
                  <Heart
                    size={18}
                    strokeWidth={2.3}
                    className={liked ? "fill-[#e5484d] text-[#e5484d]" : ""}
                  />
                }
              />
              <IconBtn
                label="הורדה לאופליין"
                icon={<ArrowDownCircle size={18} strokeWidth={2.3} />}
              />
            </div>

            <p className="mt-4 text-[14px] leading-relaxed text-v2-ink-2">
              לילה קשה? בגלל התחלה טובה התאמתי לך אימון מאתגר, עם דגש על דחיפה
              ומשיכה.
            </p>

            {/* equipment + muscles */}
            <h3 className="mb-2 mt-5 text-[16px] font-black">ציוד</h3>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
              {(place === "park"
                ? [
                    { l: "מתקן מתח", i: ICON.pullBar },
                    { l: "מקבילים", i: ICON.bars },
                  ]
                : [{ l: "משקל גוף", i: ICON.strength }]
              ).map((g) => (
                <span
                  key={g.l}
                  className="flex h-11 shrink-0 items-center gap-2 rounded-[14px] bg-white pe-3.5 ps-2.5 text-[13.5px] font-extrabold shadow-v2-ring"
                >
                  <AppIcon src={g.i} size={24} /> {g.l}
                </span>
              ))}
            </div>
            <h3 className="mb-2 mt-5 text-[16px] font-black">שרירים</h3>
            <div className="flex flex-wrap gap-2">
              {MUSCLES.map((m) => (
                <span
                  key={m.label}
                  className="flex h-10 items-center gap-1.5 rounded-full bg-v2-surface pe-3 ps-1.5 text-[13px] font-extrabold ring-1 ring-inset ring-v2-hairline"
                >
                  <AppIcon src={m.icon} size={28} /> {m.label}
                </span>
              ))}
            </div>

            {/* sections */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={place}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: EASE_V2 }}
              >
                {/* warmup */}
                <div className="mt-6 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setWarmupOpen((v) => !v)}
                    aria-expanded={warmupOpen}
                    className="flex items-center gap-2"
                  >
                    <span
                      className={`text-[17px] font-black ${warmupOn ? "" : "text-v2-muted line-through"}`}
                    >
                      חימום
                    </span>
                    <span className="text-[13px] font-bold text-v2-muted">
                      ({plan.warmup.length} תרגילים)
                    </span>
                    <motion.span
                      animate={{ rotate: warmupOpen ? 180 : 0 }}
                      transition={{ duration: 0.25, ease: EASE_V2 }}
                      className="text-v2-muted"
                    >
                      <ChevronDown size={17} strokeWidth={2.6} aria-hidden />
                    </motion.span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWarmupOn((v) => !v)}
                    aria-pressed={warmupOn}
                    className={`h-8 rounded-full px-3.5 text-[12.5px] font-extrabold transition-colors duration-150 ${
                      warmupOn
                        ? "bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/50"
                        : "bg-v2-surface text-v2-muted line-through ring-1 ring-inset ring-v2-hairline"
                    }`}
                  >
                    {warmupOn ? "פעיל" : "דלג"}
                  </button>
                </div>
                <AnimatePresence initial={false}>
                  {warmupOpen && (
                    <motion.ol
                      initial={
                        reduce ? { opacity: 0 } : { height: 0, opacity: 0 }
                      }
                      animate={
                        reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }
                      }
                      exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: EASE_V2 }}
                      className={`space-y-2 overflow-hidden pt-2 ${warmupOn ? "" : "opacity-50"}`}
                    >
                      {plan.warmup.map((e) => (
                        <ExerciseCard key={e.name} ex={e} />
                      ))}
                    </motion.ol>
                  )}
                </AnimatePresence>

                <Group
                  title="סט רגיל"
                  rounds="3x סבבים"
                  items={plan.main.slice(0, 3)}
                />
                <Group
                  title="סופר סט"
                  rounds="3x סבבים"
                  items={plan.main.slice(3)}
                  superset
                />
                <Group title="מתיחות" rounds="1x סבבים" items={plan.cooldown} />
              </motion.div>
            </AnimatePresence>

            {/* parks */}
            {place === "park" && (
              <>
                <h3 className="mb-3 mt-7 text-[17px] font-black">
                  איפה כדאי להתאמן?
                </h3>
                <div className="-mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                  {PARKS.map((pk, i) => (
                    <div
                      key={pk.name}
                      className="w-[200px] shrink-0 snap-start overflow-hidden rounded-[20px] bg-white shadow-v2-card"
                    >
                      <img
                        src={thumb(
                          [
                            "a5367716-ecd2-4764-ab32-409506623fe7",
                            "704d0e9a-a2ea-4e29-b8ed-b4dcef8c6384",
                            "912c9beb-a881-4593-980b-38189b5db773",
                          ][i],
                        )}
                        alt=""
                        className="h-[96px] w-full object-cover"
                        loading="lazy"
                      />
                      <div className="p-3">
                        <div className="truncate text-[14.5px] font-extrabold">
                          {pk.name}
                        </div>
                        <div className="text-[12.5px] font-bold text-v2-muted">
                          {4 + i * 6} דקות הליכה ממך
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* footer */}
        <div className="v2-glass-bar absolute inset-x-0 bottom-0 z-[5] px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3">
          {place === "park" && (
            <div className="mb-2 text-center text-[13px] font-extrabold text-v2-deep">
              3 אנשים מתאמנים כוח קרוב אליך
            </div>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={share}
            onClick={() => setShare((v) => !v)}
            className="mb-3 flex w-full items-center gap-3 text-start"
          >
            <Users
              size={19}
              strokeWidth={2.4}
              className="shrink-0 text-v2-deep"
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-extrabold">
                שתף שאני יוצא לאימון
              </span>
              <span className="block truncate text-[12px] font-bold text-v2-muted">
                תופיע לאחרים שמחפשים שותף
              </span>
            </span>
            <span
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${share ? "bg-v2-cta" : "bg-v2-pill-border"}`}
            >
              <span
                className="absolute top-1 h-5 w-5 rounded-full bg-white shadow-v2-ring transition-[inset-inline-start] duration-200 ease-v2"
                style={{ insetInlineStart: share ? 24 : 4 }}
              />
            </span>
          </button>
          <div className="flex items-center gap-2">
            <button
              className={`flex ${c ? "h-12" : "h-[52px]"} flex-1 items-center justify-center gap-2 rounded-full bg-v2-cta text-[17px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97]`}
              type="button"
            >
              <Play
                size={18}
                strokeWidth={2.6}
                className="fill-current"
                aria-hidden
              />
              התחלת אימון
            </button>
            <button
              type="button"
              onClick={() => setMuted((v) => !v)}
              aria-label={muted ? "הפעל שמע" : "השתק סרטונים"}
              className={`grid ${c ? "h-12 w-12" : "h-[52px] w-[52px]"} shrink-0 place-items-center rounded-full ring-1 ring-inset ${muted ? "bg-white text-v2-muted ring-v2-pill-border" : "bg-v2-tint text-v2-deep ring-v2-accent/40"}`}
            >
              {muted ? (
                <VolumeX size={20} strokeWidth={2.3} />
              ) : (
                <Volume2 size={20} strokeWidth={2.3} />
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function IconBtn({
  label,
  icon,
  onClick,
  pressed,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className="grid h-10 w-10 place-items-center rounded-full bg-white text-v2-ink-2 shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
    >
      {icon}
    </button>
  );
}

/** "3 סטים × 8–10" → "8–10 חזרות" (sets live in the group header). */
function volume(d: string): string {
  const m = d.match(/^\d+ סטים × (.+)$/);
  return m ? `${m[1]} חזרות` : d;
}

function ExerciseCard({ ex }: { ex: LabExercise }) {
  return (
    <li className="flex h-[72px] items-center gap-3 overflow-hidden rounded-[16px] bg-white shadow-v2-ring">
      <img
        src={thumb(ex.video)}
        alt=""
        className="h-[72px] w-[72px] shrink-0 object-cover"
        loading="lazy"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-extrabold">
          {ex.name}
        </span>
        <span className="block text-[13px] font-bold tabular-nums text-v2-muted">
          {volume(ex.detail)}
        </span>
      </span>
      <button
        type="button"
        aria-label={`החלפת ${ex.name}`}
        className="me-3 grid h-9 w-9 shrink-0 place-items-center rounded-full transition-transform duration-150 ease-v2 active:scale-[0.97]"
      >
        <AppIcon src="/assets/icons/ui/swap.svg" size={20} />
      </button>
    </li>
  );
}

function Group({
  title,
  rounds,
  items,
  superset = false,
}: {
  title: string;
  rounds: string;
  items: LabExercise[];
  superset?: boolean;
}) {
  if (!items.length) return null;
  return (
    <div className="mt-6">
      <div className="mb-2 flex items-baseline justify-between">
        <span
          className={`flex items-center gap-1.5 text-[17px] font-black ${superset ? "text-v2-deep" : ""}`}
        >
          {superset && <Link2 size={16} strokeWidth={2.6} aria-hidden />}
          {title}
        </span>
        <span className="text-[13px] font-bold tabular-nums text-v2-muted">
          {rounds}
        </span>
      </div>
      <ol
        className={`space-y-2 ${superset ? "border-s-[3px] border-v2-accent/70 ps-2.5" : ""}`}
      >
        {items.map((e) => (
          <ExerciseCard key={e.name} ex={e} />
        ))}
      </ol>
    </div>
  );
}
