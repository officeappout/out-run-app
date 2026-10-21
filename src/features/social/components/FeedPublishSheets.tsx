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
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';
import type { CommunityKey, SocialT } from './social-t';

/** The label is the `social.publish.activity` select (community namespace), keyed by the same id. */
const ACTIVITY: Record<FeedActivity, { rgb: string; icon: string }> = {
  strength: { rgb: '0,186,247', icon: '/icons/programs/muscle.svg' },
  cardio: { rgb: '132,204,22', icon: '/icons/programs/Run.svg' },
  maintenance: { rgb: '139,92,246', icon: '/icons/programs/walking.svg' },
};

const AUDIENCE: Record<FeedPrefsAudience, { labelKey: CommunityKey; hintKey: CommunityKey; Icon: typeof Users }> = {
  partners: { labelKey: 'social.publish.audience.partners.label', hintKey: 'social.publish.audience.partners.hint', Icon: Users },
  public: { labelKey: 'social.publish.audience.public.label', hintKey: 'social.publish.audience.public.hint', Icon: Globe },
  private: { labelKey: 'social.publish.audience.private.label', hintKey: 'social.publish.audience.private.hint', Icon: Lock },
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

function summary(t: SocialT, w: ShareableWorkout): string {
  const parts = [t('social.publish.activity', { activity: w.activityCategory }), t('social.publish.summary.minutes', { n: String(w.durationMinutes) })];
  if (w.distanceKm != null) parts.push(t('social.publish.summary.km', { km: w.distanceKm.toFixed(1) }));
  return parts.join(' · ');
}

export function SharePromptCard({ workout, onShare }: { workout: ShareableWorkout; onShare: () => void }) {
  const t = useT(community);
  return (
    <div className="flex items-center gap-3 rounded-v2-card bg-white p-3 shadow-v2-ring" dir="rtl">
      <ActivityBadge activity={workout.activityCategory} size={44} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14.5px] font-black text-v2-ink">{workout.title || t('social.publish.fallbackTitle')}</div>
        <div className="whitespace-nowrap text-[12.5px] font-bold text-v2-muted">{summary(t, workout)}</div>
      </div>
      <Button size="sm" onClick={onShare}>
        {t('social.publish.prompt.share')}
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
  const t = useT(community);
  const shareImageButton = onShareImage ? (
    <button
      type="button"
      onClick={onShareImage}
      aria-label={t('social.publish.card.shareImage')}
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
            {status === 'published' ? t('social.publish.card.published') : t('social.publish.card.queued')}
          </div>
          <div className="truncate text-[12.5px] font-bold text-v2-muted">
            {status === 'published' ? summary(t, workout) : t('social.publish.card.queuedHint')}
          </div>
        </div>
        {onShareImage && (
          <button
            type="button"
            onClick={onShareImage}
            className="h-9 shrink-0 whitespace-nowrap rounded-full bg-white px-3.5 text-[13.5px] font-extrabold text-v2-deep shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            {t('social.publish.card.shareImage')}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-v2-card bg-white p-3 shadow-v2-card" dir="rtl">
      <ActivityBadge activity={workout.activityCategory} size={44} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-black text-v2-ink">{t('social.publish.card.ask')}</div>
        <div className="truncate text-[12.5px] font-bold text-v2-muted">{summary(t, workout)}</div>
      </div>
      <button
        type="button"
        onClick={onShare}
        className="h-9 shrink-0 whitespace-nowrap rounded-full bg-white px-4 text-[13.5px] font-extrabold text-v2-deep shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
      >
        {t('social.publish.card.share')}
      </button>
      {shareImageButton}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('social.publish.card.dismiss')}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-v2-surface text-v2-muted ring-1 ring-inset ring-v2-hairline transition-transform duration-150 ease-v2 active:scale-[0.97]"
      >
        <X size={16} strokeWidth={2.6} aria-hidden />
      </button>
    </div>
  );
}

export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const t = useT(community);
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {open && (
        <div className="kb-fit fixed inset-0 z-[120]" role="dialog" aria-modal="true" aria-label={title} dir="rtl">
          <motion.button
            type="button"
            aria-label={t('social.publish.sheet.close')}
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
                aria-label={t('social.publish.sheet.close')}
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
  const t = useT(community);
  return (
    <div className="mt-2 grid grid-cols-3 gap-2">
      {(Object.keys(AUDIENCE) as FeedPrefsAudience[]).map((a) => {
        const { labelKey, hintKey, Icon } = AUDIENCE[a];
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
            <span className="whitespace-nowrap text-[14px] font-black text-v2-ink">{t(labelKey)}</span>
            <span className="text-[11px] font-bold leading-snug text-v2-muted">{t(hintKey)}</span>
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
  const t = useT(community);
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
      showToast('error', t('social.publish.share.photoError'));
    }
  };
  const hasRoute = workout?.activityCategory === 'cardio' && !!routeShapeToSvg(workout.routeShape, 320, 150);

  return (
    <Sheet open={open && !!workout} title={t('social.publish.share.title')} onClose={onClose}>
      {workout && (
        <div>
          <div className="flex items-center gap-3 rounded-[20px] bg-v2-surface p-3">
            <ActivityBadge activity={workout.activityCategory} size={48} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15.5px] font-black text-v2-ink">{workout.title || t('social.publish.fallbackTitle')}</div>
              <div className="whitespace-nowrap text-[13px] font-bold text-v2-muted">
                {summary(t, workout)}
                {workout.parkName ? ` · ${workout.parkName}` : ''}
              </div>
            </div>
          </div>
          <label className="mt-3 block">
            <span className="sr-only">{t('social.publish.share.captionLabel')}</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 80))}
              placeholder={t('social.publish.share.captionPlaceholder')}
              className="h-12 w-full rounded-[16px] bg-white px-3 text-[14.5px] font-semibold text-v2-ink shadow-v2-ring outline-none placeholder:text-v2-muted"
            />
          </label>

          {allowPhoto && (
            photo ? (
              <div className="relative mt-3 overflow-hidden rounded-[18px] shadow-v2-ring">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.previewUrl} alt={t('social.publish.share.photoAlt')} className="block aspect-[4/3] w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  aria-label={t('social.publish.share.removePhoto')}
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
                {t('social.publish.share.addPhoto')}
              </button>
            )
          )}

          <div className="mt-4 text-[13px] font-extrabold text-v2-deep">{t('social.publish.share.audienceTitle')}</div>
          <AudiencePicker value={audience} onChange={setAudience} />
          {workout.parkName && (
            <Toggle label={t('social.publish.share.park.label')} hint={t('social.publish.share.park.hint')} on={showPark} onChange={setShowPark} />
          )}
          {hasRoute && (
            <>
              <Toggle
                label={t('social.publish.share.route.label')}
                hint={t('social.publish.share.route.hint')}
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
              {audience === 'private' ? t('social.publish.share.savePrivate') : t('social.publish.share.publish')}
            </Button>
            <Button size="lg" variant="ghost" disabled={busy} onClick={onSkip}>
              {t('social.publish.share.skip')}
            </Button>
          </div>
          <button type="button" onClick={onOpenPrivacy} className="mx-auto mt-3 flex items-center gap-1.5 text-[13px] font-extrabold text-v2-muted">
            <Settings2 size={14} strokeWidth={2.6} aria-hidden />
            {t('social.publish.share.autoPublish')}
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
  const t = useT(community);
  const [draft, setDraft] = useState<FeedPrefs>(prefs);
  useEffect(() => {
    if (open) setDraft(prefs);
  }, [open, prefs]);
  return (
    <Sheet open={open} title={t('social.publish.privacy.title')} onClose={onClose}>
      <p className="text-[14px] font-semibold leading-relaxed text-v2-ink-2">
        {t('social.publish.privacy.intro')}
      </p>
      <section className="mt-5 border-t border-v2-hairline pt-4">
        <h3 className="text-[13px] font-extrabold text-v2-deep">{t('social.publish.privacy.autoTitle')}</h3>
        {(Object.keys(ACTIVITY) as FeedActivity[]).map((a) => (
          <Toggle
            key={a}
            label={t('social.publish.activity', { activity: a })}
            icon={<ActivityBadge activity={a} size={30} />}
            on={draft.autoPublish[a]}
            onChange={(v) => setDraft((d) => ({ ...d, autoPublish: { ...d.autoPublish, [a]: v } }))}
          />
        ))}
      </section>
      <section className="mt-5 border-t border-v2-hairline pt-4">
        <h3 className="text-[13px] font-extrabold text-v2-deep">{t('social.publish.privacy.audienceTitle')}</h3>
        <AudiencePicker value={draft.audience} onChange={(audience) => setDraft((d) => ({ ...d, audience }))} />
      </section>
      <section className="mt-5 border-t border-v2-hairline pt-4">
        <h3 className="text-[13px] font-extrabold text-v2-deep">{t('social.publish.privacy.locationTitle')}</h3>
        <Toggle
          label={t('social.publish.privacy.park.label')}
          hint={t('social.publish.privacy.park.hint')}
          on={draft.showPark}
          onChange={(showPark) => setDraft((d) => ({ ...d, showPark }))}
        />
        <Toggle
          label={t('social.publish.privacy.route.label')}
          hint={t('social.publish.privacy.route.hint')}
          on={draft.showRoute}
          onChange={(showRoute) => setDraft((d) => ({ ...d, showRoute }))}
        />
      </section>
      <Button size="lg" block className="mt-5" disabled={busy} onClick={() => onSave(draft)}>
        {t('social.publish.privacy.save')}
      </Button>
    </Sheet>
  );
}
