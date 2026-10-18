'use client';

/**
 * "שיתוף לרשתות" (home v2): a story / square image of the workout, from 2–3
 * templates per activity, with or without a photo behind it — rendered on a
 * canvas on the device (share-image-render.ts) and handed to the OS share
 * sheet (or downloaded).
 */
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/v2';
import { useToast } from '@/components/ui/Toast';
import { Sheet } from './FeedPublishSheets';
import { pickFeedPhoto } from '../services/feed-photo';
import {
  SHARE_SIZES,
  SHARE_TEMPLATES,
  buildShareTemplateData,
  shareFileName,
  type ShareImageInput,
  type ShareSize,
} from '../services/share-image';
import { canvasToBlob, loadShareImage, renderShareImage, shareOrDownload } from '../services/share-image-render';

const chip = (on: boolean) =>
  `h-9 whitespace-nowrap rounded-full px-3.5 text-[13.5px] font-extrabold transition-transform duration-150 ease-v2 active:scale-[0.97] ${
    on ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40' : 'bg-white text-v2-ink-2 shadow-v2-ring'
  }`;

export default function ShareImageSheet({
  open,
  onClose,
  input,
  photoUrl,
}: {
  open: boolean;
  onClose: () => void;
  input: ShareImageInput | null;
  /** A photo to offer as the background (the post's, or one just picked). */
  photoUrl?: string | null;
}) {
  const { showToast } = useToast();
  const templates = input ? SHARE_TEMPLATES[input.kind] : [];
  const [templateId, setTemplateId] = useState<string>('');
  const [size, setSize] = useState<ShareSize>('story');
  const [ownPhoto, setOwnPhoto] = useState<string | null>(null);
  const [usePhoto, setUsePhoto] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoBlocked, setPhotoBlocked] = useState(false);
  const blobRef = useRef<Blob | null>(null);
  const logoRef = useRef<HTMLImageElement | null>(null);

  const bgUrl = ownPhoto ?? photoUrl ?? input?.photoUrl ?? null;
  // Callers build `input` inline — key the render on its content, not identity.
  const inputKey = input ? JSON.stringify(input) : '';
  const inputRef = useRef(input);
  inputRef.current = input;
  const tid = templateId || templates[0]?.id || '';

  useEffect(() => {
    if (!open) return;
    setTemplateId('');
    setSize('story');
    setUsePhoto(true);
    setPhotoBlocked(false);
  }, [open]);

  useEffect(() => () => { if (ownPhoto) URL.revokeObjectURL(ownPhoto); }, [ownPhoto]);

  useEffect(() => {
    const input = inputRef.current;
    if (!open || !input) return;
    let cancelled = false;
    let url: string | null = null;
    const run = async () => {
      if (!logoRef.current) logoRef.current = await loadShareImage('/assets/logo/logo-mark.png', false).catch(() => null);
      let photo: HTMLImageElement | null = null;
      if (usePhoto && bgUrl) {
        photo = await loadShareImage(bgUrl).catch(() => null);
        if (!photo && !cancelled) setPhotoBlocked(true);
      }
      const data = buildShareTemplateData(input, tid);
      let canvas: HTMLCanvasElement;
      let blob: Blob;
      try {
        canvas = await renderShareImage({ data, size, photo, logo: logoRef.current });
        blob = await canvasToBlob(canvas);
      } catch {
        // A cross-origin photo without CORS taints the canvas → draw without it.
        if (!photo) throw new Error('render failed');
        if (!cancelled) setPhotoBlocked(true);
        canvas = await renderShareImage({ data, size, photo: null, logo: logoRef.current });
        blob = await canvasToBlob(canvas);
      }
      if (cancelled) return;
      blobRef.current = blob;
      url = URL.createObjectURL(blob);
      setPreview(url);
    };
    run().catch((err) => console.warn('[ShareImageSheet] render failed:', err));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, inputKey, tid, size, usePhoto, bgUrl]);

  const handlePick = async () => {
    try {
      const picked = await pickFeedPhoto();
      if (!picked) return;
      setOwnPhoto(picked.previewUrl);
      setUsePhoto(true);
      setPhotoBlocked(false);
    } catch {
      showToast('error', 'לא הצלחנו לפתוח את התמונה');
    }
  };

  const handleShare = async () => {
    if (!input || !blobRef.current || busy) return;
    setBusy(true);
    try {
      const res = await shareOrDownload(blobRef.current, shareFileName(input.kind, size));
      if (res === 'downloaded') showToast('success', 'התמונה נשמרה');
      if (res !== 'cancelled') onClose();
    } catch {
      showToast('error', 'השיתוף לא הצליח');
    } finally {
      setBusy(false);
    }
  };

  const dims = SHARE_SIZES[size];
  return (
    <Sheet open={open && !!input} title="שיתוף לרשתות" onClose={onClose}>
      <div className="flex justify-center">
        <div
          className="relative overflow-hidden rounded-[20px] bg-v2-surface shadow-v2-ring"
          style={{ width: size === 'story' ? 200 : 260, aspectRatio: `${dims.width} / ${dims.height}` }}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="תצוגה מקדימה של התמונה לשיתוף" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center text-v2-muted">
              <Loader2 size={22} className="animate-spin" aria-hidden />
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 text-[13px] font-extrabold text-v2-deep">עיצוב</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {templates.map((t) => (
          <button key={t.id} type="button" aria-pressed={t.id === tid} onClick={() => setTemplateId(t.id)} className={chip(t.id === tid)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 text-[13px] font-extrabold text-v2-deep">גודל</div>
      <div className="mt-2 flex gap-2">
        {(Object.keys(SHARE_SIZES) as ShareSize[]).map((s) => (
          <button key={s} type="button" aria-pressed={s === size} onClick={() => setSize(s)} className={chip(s === size)}>
            {SHARE_SIZES[s].label}
          </button>
        ))}
      </div>

      <div className="mt-4 text-[13px] font-extrabold text-v2-deep">רקע</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {bgUrl && (
          <>
            <button type="button" aria-pressed={usePhoto} onClick={() => setUsePhoto(true)} className={chip(usePhoto)}>
              עם התמונה
            </button>
            <button type="button" aria-pressed={!usePhoto} onClick={() => setUsePhoto(false)} className={chip(!usePhoto)}>
              בלי תמונה
            </button>
          </>
        )}
        <button type="button" onClick={() => void handlePick()} className={`${chip(false)} inline-flex items-center gap-1.5`}>
          <ImagePlus size={15} strokeWidth={2.6} aria-hidden />
          {bgUrl ? 'תמונה אחרת' : 'הוספת תמונה'}
        </button>
      </div>
      {photoBlocked && usePhoto && (
        <p className="mt-2 text-[12px] font-bold text-v2-muted">את התמונה הזו לא הצלחנו לצרף. אפשר לבחור תמונה מהגלריה.</p>
      )}

      <Button size="lg" block className="mt-5" disabled={!preview || busy} onClick={() => void handleShare()}>
        <Share2 size={18} strokeWidth={2.6} aria-hidden />
        שיתוף
      </Button>
    </Sheet>
  );
}
