'use client';

/**
 * Small previews for the share sheet's carousel, rendered one at a time
 * (light on CPU) at PREVIEW_PX wide and cached by template + format +
 * background. The photo is loaded once; a load / CORS failure marks it
 * unavailable instead of breaking the sheet.
 */
import { useEffect, useRef, useState } from 'react';
import { loadUsablePhoto, renderShareV2 } from '../../share-v2/render';
import type { ShareTemplateDef } from '../../share-v2/templates/template';
import type { ShareBackground, ShareFormat, ShareModel } from '../../share-v2/types';

export const PREVIEW_PX = 360;

export type PhotoState = { status: 'none' } | { status: 'loading' } | { status: 'ready'; img: HTMLImageElement } | { status: 'failed' };

export function previewKey(templateId: string, format: ShareFormat, bg: ShareBackground, photoUrl: string | null): string {
  return `${templateId}|${format}|${bg}|${bg === 'photo' ? photoUrl ?? '' : ''}`;
}

export function useSharePhoto(url: string | null): PhotoState {
  const [state, setState] = useState<PhotoState>({ status: url ? 'loading' : 'none' });
  useEffect(() => {
    if (!url) {
      setState({ status: 'none' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    loadUsablePhoto(url)
      .then((img) => !cancelled && setState({ status: 'ready', img }))
      .catch(() => !cancelled && setState({ status: 'failed' }));
    return () => {
      cancelled = true;
    };
  }, [url]);
  return state;
}

export function useSharePreviews(opts: {
  open: boolean;
  model: ShareModel | null;
  modelKey: string;
  templates: ShareTemplateDef[];
  format: ShareFormat;
  bgFor: (templateId: string) => ShareBackground;
  photo: PhotoState;
  photoUrl: string | null;
  /** Render this one first (the selected card). */
  priorityId: string;
}): Record<string, string> {
  const cache = useRef(new Map<string, string>());
  const [, bump] = useState(0);
  const { open, model, modelKey, templates, format, bgFor, photo, photoUrl, priorityId } = opts;

  // A new workout → drop the cache.
  useEffect(() => {
    const c = cache.current;
    return () => {
      c.forEach((u) => URL.revokeObjectURL(u));
      c.clear();
    };
  }, [modelKey]);

  const jobs = templates
    .map((t) => ({ id: t.id, bg: bgFor(t.id) }))
    .sort((a, b) => Number(b.id === priorityId) - Number(a.id === priorityId));
  const jobKey = jobs.map((j) => previewKey(j.id, format, j.bg, photoUrl)).join(',');
  const photoReady = photo.status === 'ready' || photo.status === 'failed' || photo.status === 'none';

  useEffect(() => {
    if (!open || !model || !photoReady) return;
    let cancelled = false;
    (async () => {
      for (const j of jobs) {
        const key = previewKey(j.id, format, j.bg, photoUrl);
        if (cancelled) return;
        if (cache.current.has(key)) continue;
        try {
          const canvas = await renderShareV2({
            model,
            templateId: j.id,
            format,
            background: j.bg,
            photo: photo.status === 'ready' ? photo.img : null,
            widthPx: PREVIEW_PX,
          });
          const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
          if (!blob || cancelled) return;
          cache.current.set(key, URL.createObjectURL(blob));
          bump((n) => n + 1);
        } catch (err) {
          console.warn('[share] preview failed:', err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // jobKey covers templates / format / backgrounds / photo url.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, modelKey, jobKey, photoReady]);

  const out: Record<string, string> = {};
  for (const j of jobs) {
    const u = cache.current.get(previewKey(j.id, format, j.bg, photoUrl));
    if (u) out[j.id] = u;
  }
  return out;
}
