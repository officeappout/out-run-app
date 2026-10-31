'use client';
/**
 * "עריכה" for the author's own workout post (enable_workout_post_v1, boards PostFeed /
 * PostPhotoFeed): the caption and one photo (add, replace, remove). v2 Sheet; saves through
 * saveFeedPostEdit.
 */
import React, { useEffect, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { Button, Sheet } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';
import { pickFeedPhoto } from '../../services/feed-photo';
import { MAX_CAPTION } from '../../services/feed-post-details';
import { saveFeedPostEdit, type FeedPostEditResult, type PhotoEdit } from '../../services/feed-edit';

interface Props {
  open: boolean;
  postId: string;
  uid: string;
  caption?: string;
  photoUrl?: string;
  photoPath?: string;
  onClose: () => void;
  onSaved: (r: FeedPostEditResult & { photoRemoved: boolean }) => void;
}

export default function EditPostSheet({ open, postId, uid, caption, photoUrl, photoPath, onClose, onSaved }: Props) {
  const t = useT(community);
  const [text, setText] = useState(caption ?? '');
  const [photo, setPhoto] = useState<PhotoEdit>({ kind: 'keep' });
  const [preview, setPreview] = useState<string | null>(photoUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => () => { if (photo.kind === 'replace' && preview) URL.revokeObjectURL(preview); }, [photo, preview]);

  const pick = async () => {
    const picked = await pickFeedPhoto().catch(() => null);
    if (!picked) return;
    setPhoto({ kind: 'replace', blob: picked.blob });
    setPreview(picked.previewUrl);
  };
  const save = async () => {
    setSaving(true);
    setFailed(false);
    try {
      const r = await saveFeedPostEdit(postId, uid, { photoPath }, { caption: text, photo });
      onSaved({ ...r, photoRemoved: photo.kind === 'remove' });
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('social.post.edit.title')}>
      <div className="flex flex-col gap-3 px-4 pb-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-extrabold text-v2-ink-2">{t('social.post.edit.caption')}</span>
          <textarea
            value={text}
            maxLength={MAX_CAPTION}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={t('social.post.edit.captionPlaceholder')}
            className="w-full resize-none rounded-v2-tile bg-v2-surface p-3 text-[15px] font-semibold text-v2-ink ring-1 ring-inset ring-v2-hairline focus:outline-none focus:ring-2 focus:ring-v2-accent"
          />
        </label>
        {preview ? (
          <div className="relative overflow-hidden rounded-v2-tile">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="" className="aspect-square w-full object-cover" />
            <div className="absolute bottom-2 start-2 end-2 flex gap-2">
              <Button variant="ghost" size="sm" onClick={pick}><Camera size={15} aria-hidden /> {t('social.post.edit.replacePhoto')}</Button>
              <Button variant="ghost" size="sm" onClick={() => { setPhoto({ kind: 'remove' }); setPreview(null); }}>
                <Trash2 size={15} aria-hidden /> {t('social.post.edit.removePhoto')}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" block onClick={pick}><Camera size={16} aria-hidden /> {t('social.post.edit.addPhoto')}</Button>
        )}
        {failed && <p role="alert" className="text-[13px] font-bold text-red-600">{t('social.post.edit.failed')}</p>}
        <Button variant="cta" block disabled={saving} onClick={save}>{t('social.post.edit.save')}</Button>
      </div>
    </Sheet>
  );
}
