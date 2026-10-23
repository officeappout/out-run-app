/**
 * View model of a shared-workout link (enable_shared_workout_preview_v1, canvas G6-01 / G6-02). Pure.
 *
 * One link, two variants: a plain SHARE ("X שיתפה איתך אימון שאהבה" + save / start) and an INVITE
 * (the doc carries an `invite` block: time, place, who is coming + a single join CTA). The variant,
 * the sender and the invite block are all read from the shared doc; every field is optional, so
 * older shares simply render as a share without a sender line.
 */
import type { GeneratedWorkout } from '../logic/WorkoutGenerator';
import type { SharedSenderGender, SharedWorkoutDoc } from './share.service';

export type SharedVariant = 'share' | 'invite';

type DocLike = Pick<SharedWorkoutDoc, 'creatorName' | 'creatorGender' | 'invite'>;

/** Invite when the doc carries a usable start time; everything else is a share. */
export function sharedVariant(doc: DocLike | null | undefined): SharedVariant {
  const at = doc?.invite?.startsAtMs;
  return typeof at === 'number' && Number.isFinite(at) ? 'invite' : 'share';
}

export interface SenderView {
  name: string;
  gender: SharedSenderGender;
}

export function senderOf(doc: DocLike | null | undefined): SenderView | null {
  const name = (doc?.creatorName ?? '').trim().split(/\s+/)[0];
  if (!name) return null;
  const g = doc?.creatorGender;
  return { name, gender: g === 'male' || g === 'female' ? g : 'other' };
}

export interface AvatarView {
  initial: string;
  photoURL: string | null;
}

export interface InviteView {
  startsAtMs: number;
  placeName: string | null;
  avatars: AvatarView[];
  goingCount: number;
  joinPath: string | null;
}

const MAX_AVATARS = 3;

export function inviteView(doc: DocLike | null | undefined): InviteView | null {
  if (sharedVariant(doc) !== 'invite' || !doc?.invite) return null;
  const inv = doc.invite;
  const going = Array.isArray(inv.going) ? inv.going.filter((g) => g && typeof g.name === 'string' && g.name.trim()) : [];
  const goingCount = Math.max(typeof inv.goingCount === 'number' ? inv.goingCount : 0, going.length);
  const path = typeof inv.joinPath === 'string' && inv.joinPath.startsWith('/') ? inv.joinPath : null; // same-origin only
  return {
    startsAtMs: inv.startsAtMs,
    placeName: inv.placeName?.trim() || null,
    avatars: going.slice(0, MAX_AVATARS).map((g) => ({ initial: Array.from(g.name.trim())[0] ?? '', photoURL: g.photoURL ?? null })),
    goingCount,
    joinPath: path,
  };
}

/** 'today' / 'tomorrow' relative to `nowMs` (local calendar days), else 'date'. */
export function inviteDayKind(startsAtMs: number, nowMs: number): 'today' | 'tomorrow' | 'date' {
  const dayStart = (ms: number) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  const diff = Math.round((dayStart(startsAtMs) - dayStart(nowMs)) / 86_400_000);
  return diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : 'date';
}

// ── media ──────────────────────────────────────────────────────────────────

export interface CatalogMedia {
  imageUrl?: string;
  videoUrl?: string;
}

type Mutable = { method?: { media?: Record<string, unknown> } };

/** Fills the thumbnail / video of every exercise that has none, from the catalog media (by exercise id). */
export function applyCatalogMedia(plan: GeneratedWorkout, mediaById: Readonly<Record<string, CatalogMedia>>): GeneratedWorkout {
  const exercises = plan.exercises.map((we) => {
    const m = mediaById[(we.exercise as { id: string }).id];
    if (!m) return we;
    const method = (we.method ?? {}) as unknown as Mutable['method'] & Record<string, unknown>;
    const media = { ...(method?.media ?? {}) } as Record<string, unknown>;
    if (!media.imageUrl && m.imageUrl) media.imageUrl = m.imageUrl;
    if (!media.mainVideoUrl && !media.videoUrl && m.videoUrl) { media.mainVideoUrl = m.videoUrl; media.videoUrl = m.videoUrl; }
    return { ...we, method: { ...method, media } as unknown as typeof we.method };
  });
  return { ...plan, exercises };
}

/** Ids of the exercises that still lack a thumbnail (what the catalog lookup has to fill). */
export function idsMissingImage(plan: GeneratedWorkout): string[] {
  return plan.exercises
    .filter((we) => !((we.method as { media?: { imageUrl?: string } } | undefined)?.media?.imageUrl))
    .map((we) => (we.exercise as { id: string }).id);
}

/** The page hero: the first main-block exercise with media (video preferred), else any exercise with media. */
export function heroMediaOf(plan: GeneratedWorkout): { imageUrl?: string; videoUrl?: string } {
  const media = (we: GeneratedWorkout['exercises'][number]) =>
    (we.method as { media?: { imageUrl?: string; mainVideoUrl?: string; videoUrl?: string } } | undefined)?.media;
  const main = plan.exercises.filter((we) => we.exerciseRole !== 'warmup' && we.exerciseRole !== 'cooldown');
  for (const we of [...main, ...plan.exercises]) {
    const m = media(we);
    if (m?.imageUrl || m?.mainVideoUrl || m?.videoUrl) {
      return { imageUrl: m.imageUrl, videoUrl: m.mainVideoUrl ?? m.videoUrl };
    }
  }
  return {};
}
