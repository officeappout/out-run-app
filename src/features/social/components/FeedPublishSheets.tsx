'use client';

/**
 * The feed's opt-in publishing UI (design lab "share" + "privacy", approved
 * 17.10.2026), home v2 look:
 *   SharePromptCard  — "your workout from this morning · share"
 *   FeedShareSheet   — who sees it, the park on/off, publish / not this time
 *   FeedPrivacySheet — auto-publish per activity, default audience, park
 */
import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Globe, ImagePlus, Lock, Settings2, Share2, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/v2';
import { useToast } from '@/components/ui/Toast';
import type { FeedActivity, FeedPrefs, FeedPrefsAudience, ShareChoice } from '../services/feed-prefs';
import { routeShapeToSvg } from '../services/feed-route';
import type { FeedPostDetails } from '../services/feed-post-details';
import type { ShareExtras } from '../services/share-image';
import { pickFeedPhoto, type PickedPhoto } from '../services/feed-photo';
import RouteLine from './RouteLine';

const ACTIVITY: Record<FeedActivity, { label: string; rgb: string; icon: string }> = {
  strength: { label: 'כוח', rgb: '0,186,247', icon: '/icons/programs/muscle.svg' },
  cardio: { label: 'אירובי', rgb: '132,204,22', icon: '/icons/programs/Run.svg' },
  maintenance: { label: 'תחזוקה', rgb: '139,92,246', icon: '/icons/programs/walking.svg' },
};

const AUDIENCE: Record<FeedPrefsAudience, { label: string; hint: string; Icon: typeof Users }> = {
  partners: { label: 'שותפים', hint: 'מי שעוקב אחריך ואת/ה אחריו', Icon: Users },
  public: { label: 'כולם', hint: 'כל משתמשי OUT', Icon: Globe },
  private: { label: 'רק אני', hint: 'נשמר אצלך, לא מתפרסם', Icon: Lock },
};

export interface ShareableWorkout extends FeedPostDetails, ShareExtras {
  activityCategory: FeedActivity;
  durationMinutes: number;
  distanceKm?: number;
  /** Average pace, seconds per km (cardio) — for the share image. */
  paceSecPerKm?: number;
  title?: string;
  parkName?: string;
  /** Location-free route line (feed-route.ts), cardio only. */
  routeShape?: number[];
}

function ActivityBadge({ activity, size }: { activity: FeedActivity; size: number }) {
  const a = ACTIVITY[activity];
  return (
    <span className="grid shrink-0 place-items-center rounded-full" style={{ width: size, height: size, background: `rgba(${a.rgb},0.14)` }} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={a.icon} alt="" width={Math.round(size * 0.5)} height={Math.round(size * 0.5)} className="object-contain" />
    </span>
  );
}

function summary(w: ShareableWorkout): string {
  const parts = [ACTIVITY[w.activityCategory].label, `${w.durationMinutes} דק׳`];
  if (w.distanceKm != null) parts.push(`${w.distanceKm.toFixed(1)} ק״מ`);
  return parts.join(' · ');
}

export function SharePromptCard({ workout, onShare }: { workout: ShareableWorkout; onShare: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-v2-card bg-white p-3 shadow-v2-ring" dir="rtl">
      <ActivityBadge activity={workout.activityCategory} size={44} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14.5px] font-black text-v2-ink">{workout.title || 'האימון האחרון שלך'}</div>
        <div className="whitespace-nowrap text-[12.5px] font-bold text-v2-muted">{summary(workout)}</div>
      </div>
      <Button size="sm" onClick={onShare}>
        שיתוף
      </Button>
    </div>
  );
}

/**
 * The workout summary's share card (home v2): "לשתף את האימון בפיד?".
 * Secondary styling on purpose — the summary's own finish button is the
 * screen's one filled CTA. `status` swaps the ask for a quiet confirmation.
 */
export function SummaryShareCard({
  workout,
  status,
  onShare,
  onDismiss,
  onShareImage,
}: {
  workout: ShareableWorkout;
  status: 'ask' | 'published' | 'queued';
  onShare: () => void;
  onDismiss: () => void;
  /** Home v2: "שיתוף לרשתות" — the story / square image sheet. */
  onShareImage?: () => void;
}) {
  const shareImageButton = onShareImage ? (
    <button
      type="button"
      onClick={onShareImage}
      aria-label="שיתוף לרשתות"
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-v2-deep shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
    >
      <Share2 size={16} strokeWidth={2.6} aria-hidden />
    </button>
  ) : null;
  if (status !== 'ask') {
    return (
      <div className="flex items-center gap-3 rounded-v2-card bg-white p-3 shadow-v2-card" dir="rtl" aria-live="polite">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-v2-tint text-v2-deep" aria-hidden>
          <Check size={20} strokeWidth={2.8} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-black text-v2-ink">
            {status === 'published' ? 'האימון פורסם בפיד' : 'האימון יפורסם בפיד'}
          </div>
          <div className="truncate text-[12.5px] font-bold text-v2-muted">
            {status === 'published' ? summary(workout) : 'ברגע שתסיים/י את הסיכום'}
          </div>
        </div>
        {onShareImage && (
          <button
            type="button"
            onClick={onShareImage}
            className="h-9 shrink-0 whitespace-nowrap rounded-full bg-white px-3.5 text-[13.5px] font-extrabold text-v2-deep shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            שיתוף לרשתות
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-v2-card bg-white p-3 shadow-v2-card" dir="rtl">
      <ActivityBadge activity={workout.activityCategory} size={44} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-black text-v2-ink">לשתף את האימון בפיד?</div>
        <div className="truncate text-[12.5px] font-bold text-v2-muted">{summary(workout)}</div>
      </div>
      <button
        type="button"
        onClick={onShare}
        className="h-9 shrink-0 whitespace-nowrap rounded-full bg-white px-4 text-[13.5px] font-extrabold text-v2-deep shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
      >
        שיתוף
      </button>
      {shareImageButton}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="לא הפעם"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-v2-surface text-v2-muted ring-1 ring-inset ring-v2-hairline transition-transform duration-150 ease-v2 active:scale-[0.97]"
      >
        <X size={16} strokeWidth={2.6} aria-hidden />
      </button>
    </div>
  );
}

export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {open && (
        <div className="kb-fit fixed inset-0 z-[120]" role="dialog" aria-modal="true" aria-label={title} dir="rtl">
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
            className="absolute inset-x-0 bottom-0 mx-auto max-h-[90%] max-w-md overflow-y-auto rounded-t-[28px] bg-white px-4 pb-[calc(var(--kb-safe-bottom)+20px)] pt-2.5 shadow-v2-sheet"
            initial={reduce ? { opacity: 0 } : { transform: 'translateY(100%)' }}
            animate={reduce ? { opacity: 1 } : { transform: 'translateY(0%)' }}
            exit={reduce ? { opacity: 0 } : { transform: 'translateY(100%)' }}
            transition={{ duration: 0.42, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="mb-3 flex justify-center">
              <span className="h-1.5 w-10 rounded-full bg-v2-pill-border" />
            </div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[22px] font-black !tracking-[-0.02em] text-v2-ink">{title}</h2>
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

function AudiencePicker({ value, onChange }: { value: FeedPrefsAudience; onChange: (a: FeedPrefsAudience) => void }) {
  return (
    <div className="mt-2 grid grid-cols-3 gap-2">
      {(Object.keys(AUDIENCE) as FeedPrefsAudience[]).map((a) => {
        const { label, hint, Icon } = AUDIENCE[a];
        const on = a === value;
        return (
          <button
            key={a}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(a)}
            className={`flex flex-col items-start gap-1 rounded-[18px] p-3 text-start transition-[transform,box-shadow] duration-150 ease-v2 active:scale-[0.98] ${
              on ? 'bg-v2-tint ring-2 ring-v2-accent' : 'bg-white shadow-v2-ring'
            }`}
          >
            <Icon size={17} strokeWidth={2.6} className={on ? 'text-v2-deep' : 'text-v2-ink-2'} aria-hidden />
            <span className="whitespace-nowrap text-[14px] font-black text-v2-ink">{label}</span>
            <span className="text-[11px] font-bold leading-snug text-v2-muted">{hint}</span>
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
        <span className="block text-[14.5px] font-extrabold text-v2-ink">{label}</span>
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

export function FeedShareSheet({
  open,
  workout,
  defaults,
  busy,
  onPublish,
  onSkip,
  onClose,
  onOpenPrivacy,
  allowPhoto = false,
}: {
  open: boolean;
  workout: ShareableWorkout | null;
  defaults: FeedPrefs;
  busy?: boolean;
  onPublish: (choice: ShareChoice) => void;
  onSkip: () => void;
  onClose: () => void;
  onOpenPrivacy: () => void;
  /** Home v2: offer "הוספת תמונה" (one photo on the post). */
  allowPhoto?: boolean;
}) {
  const { showToast } = useToast();
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [audience, setAudience] = useState<FeedPrefsAudience>(defaults.audience);
  const [showPark, setShowPark] = useState(defaults.showPark);
  const [showRoute, setShowRoute] = useState(defaults.showRoute);
  const [title, setTitle] = useState('');
  useEffect(() => {
    if (!open) return;
    setAudience(defaults.audience);
    setShowPark(defaults.showPark);
    setShowRoute(defaults.showRoute);
    setTitle(workout?.title ?? '');
    setPhoto(null);
  }, [open, defaults.audience, defaults.showPark, defaults.showRoute, workout?.title]);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.previewUrl); }, [photo]);
  const handlePickPhoto = async () => {
    try {
      const picked = await pickFeedPhoto();
      if (picked) setPhoto(picked);
    } catch {
      showToast('error', 'לא הצלחנו לפתוח את התמונה');
    }
  };
  const hasRoute = workout?.activityCategory === 'cardio' && !!routeShapeToSvg(workout.routeShape, 320, 150);

  return (
    <Sheet open={open && !!workout} title="לשתף את האימון?" onClose={onClose}>
      {workout && (
        <div>
          <div className="flex items-center gap-3 rounded-[20px] bg-v2-surface p-3">
            <ActivityBadge activity={workout.activityCategory} size={48} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15.5px] font-black text-v2-ink">{workout.title || 'האימון האחרון שלך'}</div>
              <div className="whitespace-nowrap text-[13px] font-bold text-v2-muted">
                {summary(workout)}
                {workout.parkName ? ` · ${workout.parkName}` : ''}
              </div>
            </div>
          </div>
          <label className="mt-3 block">
            <span className="sr-only">כמה מילים על האימון</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 80))}
              placeholder="כמה מילים על האימון (לא חובה)"
              className="h-12 w-full rounded-[16px] bg-white px-3 text-[14.5px] font-semibold text-v2-ink shadow-v2-ring outline-none placeholder:text-v2-muted"
            />
          </label>

          {allowPhoto && (
            photo ? (
              <div className="relative mt-3 overflow-hidden rounded-[18px] shadow-v2-ring">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.previewUrl} alt="התמונה שתצורף לפוסט" className="block aspect-[4/3] w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  aria-label="הסרת התמונה"
                  className="absolute end-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-v2-ink shadow-v2-ring"
                >
                  <X size={16} strokeWidth={2.6} aria-hidden />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void handlePickPhoto()}
                className="mt-3 flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-[16px] bg-white text-[14px] font-extrabold text-v2-deep shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.98]"
              >
                <ImagePlus size={17} strokeWidth={2.6} aria-hidden />
                הוספת תמונה
              </button>
            )
          )}

          <div className="mt-4 text-[13px] font-extrabold text-v2-deep">מי יראה</div>
          <AudiencePicker value={audience} onChange={setAudience} />
          {workout.parkName && (
            <Toggle label="להראות באיזה פארק" hint="בלי מפה ובלי כתובת, רק שם הפארק" on={showPark} onChange={setShowPark} />
          )}
          {hasRoute && (
            <>
              <Toggle
                label="להראות את קו המסלול"
                hint="רק צורת הקו, בלי מפה. 200 המטרים הראשונים והאחרונים לא מוצגים"
                on={showRoute}
                onChange={setShowRoute}
              />
              {showRoute && <RouteLine shape={workout.routeShape} className="mt-1" />}
            </>
          )}

          <div className="mt-5 grid grid-cols-[1fr_auto] gap-2">
            <Button size="lg" disabled={busy} onClick={() =>
                onPublish({
                  audience,
                  showPark,
                  showRoute: hasRoute && showRoute,
                  title: title.trim() || undefined,
                  ...(allowPhoto && photo ? { photo: photo.blob } : {}),
                })
              }>
              {audience === 'private' ? 'שמירה אצלי' : 'פרסום'}
            </Button>
            <Button size="lg" variant="ghost" disabled={busy} onClick={onSkip}>
              לא הפעם
            </Button>
          </div>
          <button type="button" onClick={onOpenPrivacy} className="mx-auto mt-3 flex items-center gap-1.5 text-[13px] font-extrabold text-v2-muted">
            <Settings2 size={14} strokeWidth={2.6} aria-hidden />
            לפרסם אוטומטית בפעם הבאה?
          </button>
        </div>
      )}
    </Sheet>
  );
}

export function FeedPrivacySheet({
  open,
  prefs,
  busy,
  onSave,
  onClose,
}: {
  open: boolean;
  prefs: FeedPrefs;
  busy?: boolean;
  onSave: (next: FeedPrefs) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<FeedPrefs>(prefs);
  useEffect(() => {
    if (open) setDraft(prefs);
  }, [open, prefs]);
  return (
    <Sheet open={open} title="מי רואה מה" onClose={onClose}>
      <p className="text-[14px] font-semibold leading-relaxed text-v2-ink-2">
        שום דבר לא מתפרסם בלי שבחרת. האימונים נספרים בליגות גם אם לא פרסמת אותם.
      </p>
      <section className="mt-5 border-t border-v2-hairline pt-4">
        <h3 className="text-[13px] font-extrabold text-v2-deep">פרסום אוטומטי אחרי אימון</h3>
        {(Object.keys(ACTIVITY) as FeedActivity[]).map((a) => (
          <Toggle
            key={a}
            label={ACTIVITY[a].label}
            icon={<ActivityBadge activity={a} size={30} />}
            on={draft.autoPublish[a]}
            onChange={(v) => setDraft((d) => ({ ...d, autoPublish: { ...d.autoPublish, [a]: v } }))}
          />
        ))}
      </section>
      <section className="mt-5 border-t border-v2-hairline pt-4">
        <h3 className="text-[13px] font-extrabold text-v2-deep">מי רואה את הפוסטים שלי</h3>
        <AudiencePicker value={draft.audience} onChange={(audience) => setDraft((d) => ({ ...d, audience }))} />
      </section>
      <section className="mt-5 border-t border-v2-hairline pt-4">
        <h3 className="text-[13px] font-extrabold text-v2-deep">מיקום</h3>
        <Toggle
          label="שם הפארק על הפוסט"
          hint="בלי מפה ובלי כתובת"
          on={draft.showPark}
          onChange={(showPark) => setDraft((d) => ({ ...d, showPark }))}
        />
        <Toggle
          label="קו המסלול על פוסט אירובי"
          hint="רק צורת הקו, בלי מפה. בלי 200 המטרים הראשונים והאחרונים"
          on={draft.showRoute}
          onChange={(showRoute) => setDraft((d) => ({ ...d, showRoute }))}
        />
      </section>
      <Button size="lg" block className="mt-5" disabled={busy} onClick={() => onSave(draft)}>
        שמירה
      </Button>
    </Sheet>
  );
}
