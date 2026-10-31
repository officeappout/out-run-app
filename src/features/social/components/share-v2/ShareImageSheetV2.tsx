'use client';

/**
 * "שיתוף לרשתות" v2 (enable_home_v2, boards SH-4a–c): template carousel with
 * live previews, story / square, background tiles, one gradient "שיתוף" and
 * a secondary "שמירה לגלריה". The full 1080 image is drawn only on tap.
 */
import { useEffect, useMemo, useState } from 'react';
import { Download, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/v2';
import { useToast } from '@/components/ui/Toast';
import { Sheet } from '../FeedPublishSheets';
import { pickFeedPhoto } from '../../services/feed-photo';
import { saveImageToGallery } from '../../services/save-to-gallery';
import { shareFileName, type ShareImageInput } from '../../services/share-image';
import { canvasToBlob, shareOrDownload } from '../../services/share-image-render';
import { buildShareModel } from '../../share-v2/model';
import { useWorkoutPostV1 } from '../../post-card/useWorkoutPostV1';
import { renderShareV2 } from '../../share-v2/render';
import { defaultTemplateId, templateById, templatesFor } from '../../share-v2/templates/registry';
import type { ShareBackground, ShareFormat, ShareInk } from '../../share-v2/types';
import ShareBackgroundTiles from './ShareBackgroundTiles';
import ShareFormatControl from './ShareFormatControl';
import ShareStickerInkTiles from './ShareStickerInkTiles';
import ShareTemplateCarousel from './ShareTemplateCarousel';
import ShareToRow, { type ShareTarget } from './ShareToRow';
import { copyImageToClipboard } from '../../services/copy-image';
import { useSharePhoto, useSharePreviews } from './useSharePreviews';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';
import type { SocialT } from '../social-t';

function subtitle(t: SocialT, input: ShareImageInput): string {
  const min = t('social.share.subtitle.minutes', { n: String(Math.round(input.durationMinutes)) });
  if (input.kind === 'cardio')
    return [t('social.share.subtitle.run'), input.distanceKm ? t('social.share.subtitle.km', { km: input.distanceKm.toFixed(1) }) : null, min]
      .filter(Boolean)
      .join(' · ');
  return [t('social.share.subtitle.strength'), input.programName || input.title, min].filter(Boolean).join(' · ');
}

function fileName(kind: ShareImageInput['kind'], format: ShareFormat): string {
  return format === 'sticker' ? shareFileName(kind, 'square').replace('-square-', '-sticker-') : shareFileName(kind, format);
}

export default function ShareImageSheetV2({
  open,
  onClose,
  input,
  photoUrl: photoProp,
}: {
  open: boolean;
  onClose: () => void;
  input: ShareImageInput | null;
  photoUrl?: string | null;
}) {
  const t = useT(community);
  const { showToast } = useToast();
  // enable_workout_post_v1 (boards PostShare / PostStickers): the post family (walk / combined, new
  // stickers, sticker logo at the bottom) and the "place tag" switch (off = no park name on the image).
  const postV1 = useWorkoutPostV1();
  const [showPlace, setShowPlace] = useState(true);
  const hasPlace = postV1 && !!input?.parkName;
  const shown = input && hasPlace && !showPlace ? { ...input, parkName: undefined } : input;
  const inputKey = shown ? `${JSON.stringify(shown)}|${postV1 ? 1 : 0}` : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const model = useMemo(() => (shown ? buildShareModel(shown, { postV1 }) : null), [inputKey]);
  const kind = input?.kind ?? 'strength';
  const [ownPhoto, setOwnPhoto] = useState<string | null>(null);
  const photoUrl = ownPhoto ?? photoProp ?? input?.photoUrl ?? null;
  const photo = useSharePhoto(open ? photoUrl : null);
  const hasPhoto = !!photoUrl && photo.status !== 'failed';

  const [format, setFormat] = useState<ShareFormat>('story');
  const [templateId, setTemplateId] = useState('');
  const [bgPick, setBgPick] = useState<Record<string, ShareBackground>>({});
  const [ink, setInk] = useState<ShareInk>('white');
  const [busy, setBusy] = useState<'share' | 'save' | null>(null);

  useEffect(() => {
    if (!open) return;
    setFormat('story');
    setTemplateId('');
    setBgPick({});
    setInk('white');
    setShowPlace(true);
  }, [open]);
  useEffect(() => () => { if (ownPhoto) URL.revokeObjectURL(ownPhoto); }, [ownPhoto]);

  const templates = templatesFor(kind, format, model);
  const tid = templates.some((def) => def.id === templateId) ? templateId : defaultTemplateId(kind, hasPhoto, format);
  const sticker = format === 'sticker';
  const bgFor = (id: string): ShareBackground => {
    const want = bgPick[id] ?? templateById(kind, id).naturalBackground(hasPhoto);
    return want === 'photo' && photo.status !== 'ready' ? 'brand' : want;
  };
  const previews = useSharePreviews({ open, model, modelKey: inputKey, templates, format, bgFor, photo, photoUrl, priorityId: tid, ink });

  const handlePick = async () => {
    try {
      const picked = await pickFeedPhoto();
      if (!picked) return;
      setOwnPhoto(picked.previewUrl);
      setBgPick((m) => ({ ...m, [tid]: 'photo' }));
    } catch {
      showToast('error', t('social.share.toast.photoError'));
    }
  };

  const fullImage = async (): Promise<Blob> => {
    if (!model) throw new Error('no model');
    const canvas = await renderShareV2({
      model,
      templateId: tid,
      format,
      background: bgFor(tid),
      photo: photo.status === 'ready' ? photo.img : null,
      ink,
    });
    // PNG keeps the sticker's transparency.
    return canvasToBlob(canvas);
  };

  const handleShare = async () => {
    if (!input || busy) return;
    setBusy('share');
    try {
      const res = await shareOrDownload(await fullImage(), fileName(input.kind, format));
      if (res === 'downloaded') showToast('success', t('social.share.toast.saved'));
      if (res !== 'cancelled') onClose();
    } catch {
      showToast('error', t('social.share.toast.shareFailed'));
    } finally {
      setBusy(null);
    }
  };

  const handleSave = async () => {
    if (!input || busy) return;
    setBusy('save');
    try {
      // Photos (native app with the plugin) → share sheet (older builds) → download (web).
      const res = await saveImageToGallery(await fullImage(), fileName(input.kind, format));
      if (res === 'saved' || res === 'downloaded') showToast('success', t('social.share.toast.saved'));
      if (res === 'denied') showToast('error', t('social.share.toast.denied'));
    } catch {
      showToast('error', t('social.share.toast.saveFailed'));
    } finally {
      setBusy(null);
    }
  };

  // "שיתוף אל" (enable_workout_post_v1): Instagram story = the story image through the share sheet.
  const [storyPending, setStoryPending] = useState(false);
  useEffect(() => {
    if (!storyPending || format !== 'story') return;
    setStoryPending(false);
    void handleShare();
  }, [storyPending, format]); // eslint-disable-line react-hooks/exhaustive-deps
  const handleCopy = async () => {
    if (!input || busy) return;
    setBusy('save');
    try {
      const ok = await copyImageToClipboard(await fullImage());
      showToast(ok ? 'success' : 'error', t(ok ? 'social.share.toast.copied' : 'social.share.toast.copyFailed'));
    } finally {
      setBusy(null);
    }
  };
  const handleTarget = (target: ShareTarget) => {
    if (target === 'download') void handleSave();
    else if (target === 'copy') void handleCopy();
    else if (target === 'more') void handleShare();
    else if (format === 'story') void handleShare();
    else { setFormat('story'); setStoryPending(true); }
  };

  const tpl = templateById(kind, tid);
  return (
    <Sheet open={open && !!input} title={t('social.share.title')} onClose={onClose}>
      {input && <p className="-mt-3 mb-1 truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted">{subtitle(t, input)}</p>}

      <ShareTemplateCarousel templates={templates} selectedId={tid} previews={previews} format={format} onSelect={setTemplateId} />

      <div className="mt-3">
        <ShareFormatControl value={format} onChange={setFormat} />
      </div>

      <div className="mt-3.5 text-[13px] font-extrabold text-v2-deep">{sticker ? t('social.share.stickerInkTitle') : t('social.share.backgroundTitle')}</div>
      <div className="mt-1.5">
        {sticker ? (
          <ShareStickerInkTiles value={ink} onChange={setInk} />
        ) : (
          <ShareBackgroundTiles
            value={bgFor(tid)}
            kind={kind}
            brand={tpl.brand}
            photoUrl={photoUrl}
            photo={photo}
            onChange={(bg) => setBgPick((m) => ({ ...m, [tid]: bg }))}
            onPickPhoto={() => void handlePick()}
          />
        )}
      </div>

      {hasPlace && (
        <button
          type="button"
          role="switch"
          aria-checked={showPlace}
          onClick={() => setShowPlace((v) => !v)}
          className="mt-3.5 flex w-full items-center gap-3 rounded-[16px] bg-white px-3.5 py-3 text-start shadow-v2-ring"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-extrabold text-v2-ink">{t('social.share.placeTag')}</span>
            <span className="block truncate text-[12px] font-bold text-v2-muted">{input?.parkName}</span>
          </span>
          <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-150 ${showPlace ? 'bg-v2-accent' : 'bg-slate-300'}`} aria-hidden>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[inset-inline-start] duration-150 ${showPlace ? 'start-[18px]' : 'start-0.5'}`} />
          </span>
        </button>
      )}

      <Button variant="cta" block className="mt-5" disabled={!model || !!busy} onClick={() => void handleShare()}>
        <Share2 size={18} strokeWidth={2.6} aria-hidden />
        {t('social.share.share')}
      </Button>
{postV1 ? (
        <ShareToRow disabled={!model || !!busy} onPick={handleTarget} />
      ) : (
            <button
        type="button"
        disabled={!model || !!busy}
        onClick={() => void handleSave()}
        className="mt-2 flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-white text-[14.5px] font-extrabold text-v2-ink shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97] disabled:opacity-60"
      >
        <Download size={17} strokeWidth={2.4} className="text-v2-ink-2" aria-hidden />
        {t('social.share.saveToGallery')}
      </button>
      )}
    </Sheet>
  );
}
