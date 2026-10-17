'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowUp,
  Bell,
  Flame,
  Globe,
  Home,
  Lock,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Send,
  Settings2,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { Button, EASE_V2 } from '@/components/ui/v2';
import LabFrame, { LabStates } from '../_shared/LabFrame';
import { AppIcon, BottomNav, Faces } from '../_app/parts';
import { BrandFlame } from '../_app/brand';
import {
  ACTIVITY,
  AUDIENCE,
  CHEERERS,
  COMMENTS,
  ME,
  POSTS,
  PROFILE,
  QUICK_REPLIES,
  type Activity,
  type Audience,
  type FeedFilter,
  type Person,
  type Post,
} from './fixtures';

type Screen = 'feed' | 'post' | 'profile' | 'share' | 'privacy';

const SCREENS: { id: Screen; label: string }[] = [
  { id: 'feed', label: 'פיד' },
  { id: 'post', label: 'פוסט' },
  { id: 'profile', label: 'פרופיל' },
  { id: 'share', label: 'שיתוף אימון' },
  { id: 'privacy', label: 'פרטיות' },
];

const FILTERS: { id: FeedFilter; label: string }[] = [
  { id: 'all', label: 'הכל' },
  { id: 'partners', label: 'שותפים' },
  { id: 'neighborhood', label: 'השכונה' },
  { id: 'groups', label: 'קבוצות' },
];

const AUDIENCE_ICON: Record<Audience, typeof Globe> = {
  partners: Users,
  neighborhood: Home,
  public: Globe,
  private: Lock,
};

export default function FeedLab() {
  const [screen, setScreen] = useState<Screen>('feed');
  const [filter, setFilter] = useState<FeedFilter>('all');

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('screen');
    if (SCREENS.some((x) => x.id === s)) setScreen(s as Screen);
  }, []);

  const base = screen === 'profile' ? 'profile' : 'feed';
  const sheet = screen === 'post' || screen === 'share' || screen === 'privacy' ? screen : null;
  const close = () => setScreen(base);

  return (
    <LabFrame
      panel={
        <div>
          <div className="mb-1 text-[22px] font-black tracking-v2-tight">Design lab · פיד</div>
          <p className="mb-6 text-[14px] leading-relaxed text-v2-ink-2">
            פיד הקהילה, כרטיס פוסט אחד לכל סוגי הפעילות, הפרופיל ומי רואה מה. נתוני דמו בלבד, בלי תמונות של אנשים.
          </p>
          <LabStates title="מסך" value={screen} options={SCREENS} onChange={setScreen} />
        </div>
      }
    >
      <div key={base} className="h-full overflow-y-auto overscroll-contain pb-32">
        {base === 'feed' ? (
          <FeedScreen filter={filter} onFilter={setFilter} onOpen={() => setScreen('post')} onShare={() => setScreen('share')} onProfile={() => setScreen('profile')} />
        ) : (
          <ProfileScreen onPrivacy={() => setScreen('privacy')} onBack={() => setScreen('feed')} />
        )}
      </div>
      <BottomNav active="friends" />
      <Sheet open={!!sheet} title={sheet === 'post' ? 'הפוסט של נועה' : sheet === 'share' ? 'לשתף את האימון?' : 'מי רואה מה'} onClose={close}>
        {sheet === 'post' && <PostDetail />}
        {sheet === 'share' && <ShareSheet onDone={close} onPrivacy={() => setScreen('privacy')} />}
        {sheet === 'privacy' && <PrivacySheet />}
      </Sheet>
    </LabFrame>
  );
}

/* ───────────────────────────── feed ───────────────────────────── */

function FeedScreen({
  filter,
  onFilter,
  onOpen,
  onShare,
  onProfile,
}: {
  filter: FeedFilter;
  onFilter: (f: FeedFilter) => void;
  onOpen: () => void;
  onShare: () => void;
  onProfile: () => void;
}) {
  const reduce = useReducedMotion();
  const posts = POSTS.filter((p) => {
    if (filter === 'all') return true;
    if (filter === 'groups') return p.kind === 'session' || (p.kind === 'workout' && !!p.group);
    if (filter === 'neighborhood') return p.kind === 'league' || ('audience' in p && p.audience === 'neighborhood') || ('who' in p && p.who.place === ME.place);
    return 'audience' in p && p.audience === 'partners';
  });

  return (
    <>
      <header className="px-4 pb-3 pt-[calc(env(safe-area-inset-top)+18px)]">
        <div className="flex items-center justify-between">
          <h1 className="text-[30px] font-black leading-none !tracking-[-0.03em]">קהילה</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="התראות"
              className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
            >
              <Bell size={18} strokeWidth={2.4} />
            </button>
            <button
              type="button"
              onClick={onProfile}
              aria-label="הפרופיל שלי"
              className="transition-transform duration-150 ease-v2 active:scale-[0.97]"
            >
              <Avatar p={ME} size={40} />
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 rounded-full bg-white p-1 shadow-v2-ring">
          <span className="grid h-10 place-items-center rounded-full bg-v2-ink text-[14px] font-extrabold text-white">פיד</span>
          <Link href="/design-lab/leagues" className="grid h-10 place-items-center rounded-full text-[14px] font-extrabold text-v2-ink-2">
            ליגות
          </Link>
        </div>
      </header>

      <div className="sticky top-0 z-[2] bg-v2-surface/95 pb-3 pt-1 backdrop-blur-sm">
        <div className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]" role="tablist" aria-label="סינון הפיד">
          {FILTERS.map((f) => {
            const on = f.id === filter;
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onFilter(f.id)}
                className={`relative h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-[13.5px] font-extrabold transition-transform duration-150 ease-v2 active:scale-[0.97] ${
                  on ? 'text-white' : 'bg-white text-v2-ink-2 shadow-v2-ring'
                }`}
              >
                {on && (
                  <motion.span
                    layoutId="lab-feed-filter"
                    className="absolute inset-0 rounded-full bg-v2-ink"
                    transition={{ duration: reduce ? 0 : 0.28, ease: EASE_V2 }}
                  />
                )}
                <span className="relative">{f.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 px-4">
        <SharePrompt onShare={onShare} />
        <AnimatePresence mode="popLayout" initial={false}>
          {posts.map((p) => (
            <motion.div
              key={p.id}
              layout={!reduce}
              initial={{ opacity: 0, transform: 'translateY(6px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24, ease: EASE_V2 }}
            >
              <PostCard post={p} onOpen={onOpen} />
            </motion.div>
          ))}
        </AnimatePresence>
        {posts.length === 0 && (
          <p className="py-10 text-center text-[14px] font-bold text-v2-muted">אין כאן עדיין פוסטים</p>
        )}
      </div>
    </>
  );
}

/** Your last workout, not shared yet — publishing is a choice, not automatic. */
function SharePrompt({ onShare }: { onShare: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-v2-card bg-white p-3 shadow-v2-ring">
      <ActivityBadge activity="strength" size={44} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14.5px] font-black">האימון שלך מהבוקר</div>
        <div className="whitespace-nowrap text-[12.5px] font-bold text-v2-muted">כוח · 35 דק׳ · 70 נק׳</div>
      </div>
      <Button size="sm" onClick={onShare}>
        שיתוף
      </Button>
    </div>
  );
}

/* ───────────────────────────── post card ───────────────────────────── */

function PostCard({ post, onOpen }: { post: Post; onOpen: () => void }) {
  if (post.kind === 'league') return <LeagueMoment post={post} />;
  if (post.kind === 'session') return <SessionCard post={post} />;

  return (
    <article className="overflow-hidden rounded-v2-card bg-white shadow-v2-ring">
      <PostHead who={post.who} ago={post.ago} audience={post.audience} />

      {post.kind === 'streak' ? (
        <div className="mx-3 mb-3 flex items-center gap-3 rounded-[20px] bg-v2-surface p-3">
          <BrandFlame size={56} />
          <div>
            <div className="text-[26px] font-black leading-none !tracking-[-0.03em]">{post.days} ימים</div>
            <div className="mt-1 whitespace-nowrap text-[13.5px] font-bold text-v2-ink-2">ברצף, בלי לפספס אף יום</div>
          </div>
        </div>
      ) : (
        <button type="button" onClick={onOpen} className="block w-full text-start">
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2">
              <ActivityPill activity={post.kind === 'run' ? 'cardio' : post.activity} />
              {post.kind === 'run' && post.pr && (
                <span className="inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full bg-[#fef3c7] px-2 text-[12px] font-extrabold text-[#92400e]">
                  <Trophy size={12} strokeWidth={2.6} aria-hidden />
                  {post.pr}
                </span>
              )}
            </div>
            <h3 className="mt-2 text-[17px] font-black leading-snug">{post.title}</h3>
          </div>

          {post.kind === 'run' && <RouteMap route={post.route} />}

          <div className="grid grid-cols-3 gap-2 px-4 py-3">
            {post.kind === 'run' ? (
              <>
                <Stat value={post.km.toFixed(1)} unit="ק״מ" />
                <Stat value={post.pace} unit="דק׳/ק״מ" />
                <Stat value={String(post.minutes)} unit="דק׳" />
              </>
            ) : (
              <>
                <Stat value={String(post.minutes)} unit="דק׳" />
                <Stat value={String(post.points)} unit="נקודות" />
                <Stat value={post.park ? post.park.replace('פארק ', '') : (post.group ?? '—')} unit={post.park ? 'פארק' : 'קבוצה'} small />
              </>
            )}
          </div>

          {post.kind === 'workout' && post.muscles && (
            <div className="flex flex-wrap gap-1.5 px-4 pb-3">
              {post.muscles.map((m) => (
                <span key={m} className="whitespace-nowrap rounded-full bg-v2-surface px-2.5 py-1 text-[12px] font-extrabold text-v2-ink-2 ring-1 ring-inset ring-v2-hairline">
                  {m}
                </span>
              ))}
            </div>
          )}
        </button>
      )}

      <PostActions cheers={post.cheers} comments={post.comments} cheered={'cheered' in post ? !!post.cheered : false} onComments={onOpen} />
    </article>
  );
}

function PostHead({ who, ago, audience }: { who: Person; ago: string; audience: Audience }) {
  const A = AUDIENCE_ICON[audience];
  return (
    <div className="flex items-center gap-2.5 px-4 pb-2 pt-3.5">
      <Avatar p={who} size={40} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-black">{who.name}</div>
        <div className="flex items-center gap-1 whitespace-nowrap text-[12.5px] font-bold text-v2-muted">
          {who.place} · {ago} ·
          <A size={12} strokeWidth={2.6} aria-label={AUDIENCE[audience].label} />
        </div>
      </div>
      <button type="button" aria-label="אפשרויות" className="grid h-9 w-9 place-items-center rounded-full text-v2-muted">
        <MoreHorizontal size={18} strokeWidth={2.4} />
      </button>
    </div>
  );
}

/** Cheer (one tap, no counter race in the UI) + comments + who cheered. */
function PostActions({ cheers, comments, cheered, onComments }: { cheers: number; comments: number; cheered: boolean; onComments: () => void }) {
  const [on, setOn] = useState(cheered);
  const reduce = useReducedMotion();
  const n = cheers + (on && !cheered ? 1 : 0) - (!on && cheered ? 1 : 0);
  return (
    <div className="flex items-center gap-1 border-t border-v2-hairline px-2 py-1.5">
      <button
        type="button"
        aria-pressed={on}
        onClick={() => setOn((v) => !v)}
        className={`flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13.5px] font-extrabold transition-[transform,background-color,color] duration-150 ease-v2 active:scale-[0.96] ${
          on ? 'bg-[#fff1e6] text-[#ea580c]' : 'text-v2-ink-2'
        }`}
      >
        <motion.span
          key={String(on)}
          initial={reduce || !on ? false : { transform: 'scale(0.6)' }}
          animate={{ transform: 'scale(1)' }}
          transition={{ type: 'spring', duration: 0.4, bounce: 0.35 }}
          className="inline-flex"
        >
          <Flame size={18} strokeWidth={2.4} fill={on ? 'currentColor' : 'none'} aria-hidden />
        </motion.span>
        {on ? 'עודדת' : 'עידוד'} · {n}
      </button>
      <button
        type="button"
        onClick={onComments}
        className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13.5px] font-extrabold text-v2-ink-2 transition-transform duration-150 ease-v2 active:scale-[0.96]"
      >
        <MessageCircle size={18} strokeWidth={2.4} aria-hidden />
        {comments > 0 ? `${comments} תגובות` : 'תגובה'}
      </button>
      <span className="ms-auto pe-2">
        <MiniFaces people={CHEERERS.slice(0, 3)} />
      </span>
    </div>
  );
}

function LeagueMoment({ post }: { post: Extract<Post, { kind: 'league' }> }) {
  return (
    <Link
      href="/design-lab/leagues?tab=neighborhoods"
      className="flex items-center gap-3 rounded-v2-card bg-v2-tint p-4 ring-1 ring-inset ring-v2-accent/30 transition-transform duration-150 ease-v2 active:scale-[0.98]"
    >
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-[20px] font-black text-v2-deep shadow-v2-ring">
        {post.rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 whitespace-nowrap text-[15px] font-black">
          {post.scope} במקום {post.rank}
          <span className="inline-flex items-center text-[12.5px] font-extrabold text-[#16a34a]">
            <ArrowUp size={13} strokeWidth={3} aria-hidden />
            {post.prev - post.rank}
          </span>
        </div>
        <div className="mt-0.5 text-[13px] font-bold leading-snug text-v2-ink-2">{post.note}</div>
      </div>
      <Trophy size={20} strokeWidth={2.4} className="shrink-0 text-v2-deep" aria-hidden />
    </Link>
  );
}

function SessionCard({ post }: { post: Extract<Post, { kind: 'session' }> }) {
  return (
    <article className="rounded-v2-card bg-white p-4 shadow-v2-ring">
      <div className="flex items-center gap-2 whitespace-nowrap text-[12.5px] font-bold text-v2-muted">
        <Users size={13} strokeWidth={2.6} aria-hidden />
        {post.group} · {post.ago}
      </div>
      <h3 className="mt-1.5 text-[17px] font-black leading-snug">
        {post.people.length + post.more} מתאמנים יצאו יחד לאימון של {post.minutes} דק׳
      </h3>
      <div className="mt-3 flex items-center justify-between">
        <Faces letters={post.people} more={post.more} />
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-extrabold text-v2-ink-2">
          <MapPin size={14} strokeWidth={2.6} aria-hidden />
          {post.park}
        </span>
      </div>
    </article>
  );
}

/* ───────────────────────────── post detail ───────────────────────────── */

function PostDetail() {
  const run = POSTS.find((p) => p.kind === 'run') as Extract<Post, { kind: 'run' }>;
  const [text, setText] = useState('');
  return (
    <div>
      <div className="-mx-4 overflow-hidden">
        <PostHead who={run.who} ago={run.ago} audience={run.audience} />
        <RouteMap route={run.route} tall />
        <div className="grid grid-cols-3 gap-2 px-4 py-3">
          <Stat value={run.km.toFixed(1)} unit="ק״מ" />
          <Stat value={run.pace} unit="דק׳/ק״מ" />
          <Stat value={String(run.minutes)} unit="דק׳" />
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between rounded-[18px] bg-v2-surface px-3 py-2.5">
        <span className="flex items-center gap-2 whitespace-nowrap text-[13.5px] font-extrabold">
          <Flame size={16} strokeWidth={2.6} className="text-[#ea580c]" aria-hidden />
          {run.cheers} עידודים
        </span>
        <MiniFaces people={CHEERERS} />
      </div>

      <ul className="mt-4 space-y-3">
        {COMMENTS.map((c, i) => (
          <li key={i} className="flex gap-2.5">
            <Avatar p={c.who} size={32} />
            <div className="min-w-0 flex-1">
              <div className="inline-block max-w-full rounded-[18px] rounded-ss-[6px] bg-v2-surface px-3 py-2">
                <div className="text-[12.5px] font-black">{c.who.name}</div>
                <div className="text-[14px] font-semibold leading-snug">{c.text}</div>
              </div>
              <div className="mt-0.5 ps-3 text-[11.5px] font-bold text-v2-muted">{c.ago}</div>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {QUICK_REPLIES.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => setText(q)}
            className="h-8 shrink-0 whitespace-nowrap rounded-full bg-white px-3 text-[13px] font-extrabold text-v2-ink-2 shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            {q}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Avatar p={ME} size={36} />
        <label className="flex h-11 flex-1 items-center rounded-full bg-v2-surface px-4 ring-1 ring-inset ring-v2-hairline">
          <span className="sr-only">תגובה</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="כתבו תגובה…"
            className="w-full bg-transparent text-[14.5px] font-semibold outline-none placeholder:text-v2-muted"
          />
        </label>
        <button
          type="button"
          aria-label="שליחה"
          disabled={!text}
          className="grid h-11 w-11 place-items-center rounded-full bg-v2-ink text-white transition-[transform,opacity] duration-150 ease-v2 active:scale-[0.96] disabled:opacity-30"
        >
          <Send size={17} strokeWidth={2.4} className="-scale-x-100" />
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────────── share ───────────────────────────── */

function ShareSheet({ onDone, onPrivacy }: { onDone: () => void; onPrivacy: () => void }) {
  const [aud, setAud] = useState<Audience>('partners');
  const [showPark, setShowPark] = useState(true);
  return (
    <div>
      <div className="flex items-center gap-3 rounded-[20px] bg-v2-surface p-3">
        <ActivityBadge activity="strength" size={48} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15.5px] font-black">כוח עליון · מתח ומקבילים</div>
          <div className="whitespace-nowrap text-[13px] font-bold text-v2-muted">35 דק׳ · 70 נקודות · פארק רמות</div>
        </div>
      </div>

      <label className="mt-3 block">
        <span className="sr-only">כמה מילים על האימון</span>
        <textarea
          rows={2}
          placeholder="כמה מילים על האימון (לא חובה)"
          className="w-full resize-none rounded-[18px] bg-white p-3 text-[14.5px] font-semibold shadow-v2-ring outline-none placeholder:text-v2-muted"
        />
      </label>

      <div className="mt-4 text-[13px] font-extrabold text-v2-deep">מי יראה</div>
      <AudiencePicker value={aud} onChange={setAud} />

      <Toggle label="להראות באיזה פארק" hint="בלי מפה ובלי כתובת, רק שם הפארק" on={showPark} onChange={setShowPark} />

      <div className="mt-5 grid grid-cols-[1fr_auto] gap-2">
        <Button size="lg" onClick={onDone}>
          {aud === 'private' ? 'שמירה אצלי' : 'פרסום'}
        </Button>
        <Button size="lg" variant="ghost" onClick={onDone}>
          לא הפעם
        </Button>
      </div>
      <button type="button" onClick={onPrivacy} className="mx-auto mt-3 flex items-center gap-1.5 text-[13px] font-extrabold text-v2-muted">
        <Settings2 size={14} strokeWidth={2.6} aria-hidden />
        לפרסם אוטומטית בפעם הבאה?
      </button>
    </div>
  );
}

/* ───────────────────────────── privacy ───────────────────────────── */

function PrivacySheet() {
  const [auto, setAuto] = useState<Record<Activity, boolean>>({ strength: false, cardio: false, maintenance: false });
  const [aud, setAud] = useState<Audience>('partners');
  const [comments, setComments] = useState<'partners' | 'everyone' | 'none'>('partners');
  const [route, setRoute] = useState(false);
  return (
    <div>
      <p className="text-[14px] font-semibold leading-relaxed text-v2-ink-2">
        שום דבר לא מתפרסם בלי שבחרת. האימונים נספרים בליגות גם אם לא פרסמת אותם.
      </p>

      <Section title="פרסום אוטומטי אחרי אימון">
        {(Object.keys(ACTIVITY) as Activity[]).map((a) => (
          <Toggle
            key={a}
            label={ACTIVITY[a].label}
            icon={<ActivityBadge activity={a} size={30} />}
            on={auto[a]}
            onChange={(v) => setAuto((s) => ({ ...s, [a]: v }))}
          />
        ))}
      </Section>

      <Section title="מי רואה את הפוסטים שלי">
        <AudiencePicker value={aud} onChange={setAud} />
      </Section>

      <Section title="מי יכול להגיב">
        <div className="grid grid-cols-3 rounded-full bg-v2-surface p-1 ring-1 ring-inset ring-v2-hairline">
          {(
            [
              ['partners', 'שותפים'],
              ['everyone', 'כל מי שרואה'],
              ['none', 'אף אחד'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={comments === id}
              onClick={() => setComments(id)}
              className={`h-9 whitespace-nowrap rounded-full text-[13px] font-extrabold transition-colors duration-200 ${
                comments === id ? 'bg-white text-v2-ink shadow-v2-ring' : 'text-v2-ink-2'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="מיקום">
        <Toggle label="מסלול ריצה על המפה" hint="כבוי: רואים רק מרחק וקצב. ה-200 מ׳ הראשונים והאחרונים מוסתרים תמיד" on={route} onChange={setRoute} />
      </Section>
    </div>
  );
}

/* ───────────────────────────── profile ───────────────────────────── */

function ProfileScreen({ onPrivacy, onBack }: { onPrivacy: () => void; onBack: () => void }) {
  const [tab, setTab] = useState<'posts' | 'records'>('posts');
  const me = PROFILE.me;
  return (
    <>
      <header className="flex items-center justify-between px-4 pb-2 pt-[calc(env(safe-area-inset-top)+14px)]">
        <button
          type="button"
          onClick={onBack}
          aria-label="חזרה"
          className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          <X size={18} strokeWidth={2.4} />
        </button>
        <button
          type="button"
          onClick={onPrivacy}
          className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-4 text-[13.5px] font-extrabold shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          <Lock size={15} strokeWidth={2.6} aria-hidden />
          פרטיות
        </button>
      </header>

      <section className="flex flex-col items-center px-4 pt-2 text-center">
        <Avatar p={me} size={88} />
        <h1 className="mt-3 text-[26px] font-black leading-none !tracking-[-0.03em]">{me.name}</h1>
        <div className="mt-1.5 flex items-center gap-1 whitespace-nowrap text-[13.5px] font-bold text-v2-muted">
          <MapPin size={13} strokeWidth={2.6} aria-hidden />
          {me.place} · {me.bio}
        </div>
        <div className="mt-3 flex gap-5 whitespace-nowrap text-[13.5px] font-bold text-v2-ink-2">
          <span>
            <b className="font-black text-v2-ink">{me.partners}</b> שותפים
          </span>
          <span>
            <b className="font-black text-v2-ink">{me.following}</b> עוקב/ת
          </span>
        </div>
      </section>

      <div className="mx-4 mt-5 grid grid-cols-3 divide-x divide-x-reverse divide-v2-hairline rounded-v2-card bg-white py-3 shadow-v2-ring">
        {PROFILE.stats.map((s) => (
          <div key={s.label} className="text-center">
            <div className="whitespace-nowrap text-[20px] font-black leading-none !tracking-[-0.02em]">{s.value}</div>
            <div className="mt-1 whitespace-nowrap text-[12px] font-bold text-v2-muted">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="mx-4 mt-5 grid grid-cols-2 rounded-full bg-white p-1 shadow-v2-ring">
        {(
          [
            ['posts', 'פוסטים'],
            ['records', 'שיאים'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            className={`h-10 rounded-full text-[14px] font-extrabold transition-colors duration-200 ${tab === id ? 'bg-v2-ink text-white' : 'text-v2-ink-2'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'posts' ? (
        <div className="mx-4 mt-3 grid grid-cols-3 gap-2">
          {PROFILE.tiles.map((t, i) => {
            const a = ACTIVITY[t.activity];
            return (
              <div
                key={i}
                className="relative flex aspect-square flex-col justify-between rounded-[18px] p-2.5"
                style={{ background: `linear-gradient(160deg, rgba(${a.rgb},0.16), rgba(${a.rgb},0.05))` }}
              >
                <div className="flex items-center justify-between">
                  <AppIcon src={a.icon} size={20} />
                  {i === 3 && <Lock size={12} strokeWidth={2.8} className="text-v2-muted" aria-label="רק אני" />}
                </div>
                <div>
                  <div className="whitespace-nowrap text-[20px] font-black leading-none !tracking-[-0.02em]">
                    {t.value}
                    <span className="ms-0.5 text-[11px] font-extrabold text-v2-ink-2">{t.unit}</span>
                  </div>
                  <div className="mt-1 text-[11px] font-bold text-v2-muted">{t.day}</div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <ul className="mx-4 mt-3 space-y-2">
          {PROFILE.highlights.map((h) => (
            <li key={h.label} className="flex items-center gap-3 rounded-[20px] bg-white p-3 shadow-v2-ring">
              <ActivityBadge activity={h.activity} size={40} />
              <span className="flex-1 whitespace-nowrap text-[14.5px] font-extrabold">{h.label}</span>
              <span className="whitespace-nowrap text-[18px] font-black !tracking-[-0.02em]">{h.value}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ───────────────────────────── bits ───────────────────────────── */

function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[10]" role="dialog" aria-modal="true" aria-label={title}>
          <motion.button
            type="button"
            aria-label="סגירה"
            className="absolute inset-0 bg-[#0e1419]/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            key={title}
            className="absolute inset-x-0 bottom-0 max-h-[90%] overflow-y-auto rounded-t-[28px] bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2.5 shadow-v2-sheet"
            initial={reduce ? { opacity: 0 } : { transform: 'translateY(100%)' }}
            animate={reduce ? { opacity: 1 } : { transform: 'translateY(0%)' }}
            exit={reduce ? { opacity: 0 } : { transform: 'translateY(100%)' }}
            transition={{ duration: 0.42, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="mb-3 flex justify-center">
              <span className="h-1.5 w-10 rounded-full bg-v2-pill-border" />
            </div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[22px] font-black !tracking-[-0.02em]">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="סגירה"
                className="grid h-9 w-9 place-items-center rounded-full bg-v2-surface ring-1 ring-inset ring-v2-hairline"
              >
                <X size={17} strokeWidth={2.6} />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function AudiencePicker({ value, onChange }: { value: Audience; onChange: (a: Audience) => void }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      {(Object.keys(AUDIENCE) as Audience[]).map((a) => {
        const Icon = AUDIENCE_ICON[a];
        const on = a === value;
        return (
          <button
            key={a}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(a)}
            className={`flex items-start gap-2 rounded-[18px] p-3 text-start transition-[transform,box-shadow] duration-150 ease-v2 active:scale-[0.98] ${
              on ? 'bg-v2-tint ring-2 ring-v2-accent' : 'bg-white shadow-v2-ring'
            }`}
          >
            <Icon size={17} strokeWidth={2.6} className={`mt-0.5 shrink-0 ${on ? 'text-v2-deep' : 'text-v2-ink-2'}`} aria-hidden />
            <span className="min-w-0">
              <span className="block whitespace-nowrap text-[14px] font-black">{AUDIENCE[a].label}</span>
              <span className="mt-0.5 block text-[11.5px] font-bold leading-snug text-v2-muted">{AUDIENCE[a].hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ label, hint, icon, on, onChange }: { label: string; hint?: string; icon?: ReactNode; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="mt-2 flex w-full items-center gap-3 py-2 text-start">
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-extrabold">{label}</span>
        {hint && <span className="mt-0.5 block text-[12px] font-bold leading-snug text-v2-muted">{hint}</span>}
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${on ? 'bg-v2-ink' : 'bg-v2-pill-border'}`}>
        <span
          className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-[inset-inline-start] duration-200 ease-v2"
          style={{ insetInlineStart: on ? 'calc(100% - 26px)' : '2px' }}
        />
      </span>
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 border-t border-v2-hairline pt-4">
      <h3 className="text-[13px] font-extrabold text-v2-deep">{title}</h3>
      {children}
    </section>
  );
}

function Avatar({ p, size }: { p: Person; size: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-black text-v2-ink ring-2 ring-white"
      style={{ width: size, height: size, background: p.tint, fontSize: size * 0.4 }}
      aria-hidden
    >
      {p.initial}
    </span>
  );
}

function MiniFaces({ people }: { people: Person[] }) {
  return (
    <span className="flex -space-x-1.5 space-x-reverse" aria-label={`עודדו: ${people.map((p) => p.name).join(', ')}`}>
      {people.map((p, i) => (
        <span
          key={i}
          className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-black ring-2 ring-white"
          style={{ background: p.tint }}
          aria-hidden
        >
          {p.initial}
        </span>
      ))}
    </span>
  );
}

function ActivityPill({ activity }: { activity: Activity }) {
  const a = ACTIVITY[activity];
  return (
    <span
      className="inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[12px] font-extrabold"
      style={{ background: `rgba(${a.rgb},0.14)`, color: a.hex }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: a.hex }} />
      {a.label}
    </span>
  );
}

function ActivityBadge({ activity, size }: { activity: Activity; size: number }) {
  const a = ACTIVITY[activity];
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full"
      style={{ width: size, height: size, background: `rgba(${a.rgb},0.14)` }}
      aria-hidden
    >
      <AppIcon src={a.icon} size={Math.round(size * 0.5)} />
    </span>
  );
}

function Stat({ value, unit, small = false }: { value: string; unit: string; small?: boolean }) {
  return (
    <div className="min-w-0">
      <div className={`truncate font-black leading-none !tracking-[-0.02em] ${small ? 'text-[15px]' : 'text-[20px]'}`}>{value}</div>
      <div className="mt-1 whitespace-nowrap text-[11.5px] font-bold text-v2-muted">{unit}</div>
    </div>
  );
}

/** A drawn route on a quiet map — no tiles, no token, no exact start/end. */
function RouteMap({ route, tall = false }: { route: [number, number][]; tall?: boolean }) {
  const d = route.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
  const hex = ACTIVITY.cardio.hex;
  return (
    <div className={`relative mx-3 overflow-hidden rounded-[20px] bg-[#eef5f0] ${tall ? 'h-48' : 'h-36'}`}>
      <svg viewBox="0 0 206 106" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-label="מסלול הריצה">
        <path d="M-10 20 C40 30 80 6 130 14 S200 8 220 18" fill="none" stroke="#fff" strokeWidth="5" />
        <path d="M-10 96 C50 86 100 100 150 92 S200 96 220 90" fill="none" stroke="#fff" strokeWidth="5" />
        <path d="M60 -10 C64 40 54 70 66 120" fill="none" stroke="#fff" strokeWidth="4" />
        <path d="M150 -10 C140 30 158 70 146 120" fill="none" stroke="#fff" strokeWidth="4" />
        <ellipse cx="100" cy="58" rx="46" ry="22" fill="#d7ead9" />
        <path d={d} fill="none" stroke="#fff" strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" />
        <path d={d} fill="none" stroke={hex} strokeWidth="3.4" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <span className="absolute bottom-2 start-2 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-extrabold text-v2-ink-2 shadow-v2-ring">
        <MapPin size={11} strokeWidth={2.8} aria-hidden />
        פארק נחל עשן
      </span>
    </div>
  );
}
