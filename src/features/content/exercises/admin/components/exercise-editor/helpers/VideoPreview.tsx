'use client';

import { useState, useEffect } from 'react';
import { Image as ImageIcon } from 'lucide-react';

interface VideoPreviewProps {
  url: string;
  onRemove?: () => void;
}

export default function VideoPreview({ url, onRemove }: VideoPreviewProps) {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoType, setVideoType] = useState<'youtube' | 'vimeo' | 'mp4' | 'unknown'>('unknown');

  useEffect(() => {
    // If this is a direct MP4 or Firebase Storage URL, use native video
    const isNativeVideo =
      url.endsWith('.mp4') ||
      url.includes('.mp4?') ||
      url.includes('firebasestorage.googleapis.com');

    if (isNativeVideo) {
      setVideoId(null);
      setVideoType('mp4');
      return;
    }

    // Extract YouTube video ID
    const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const youtubeMatch = url.match(youtubeRegex);
    
    if (youtubeMatch) {
      setVideoId(youtubeMatch[1]);
      setVideoType('youtube');
      return;
    }

    // Extract Vimeo video ID
    const vimeoRegex = /(?:vimeo\.com\/)(\d+)/;
    const vimeoMatch = url.match(vimeoRegex);
    
    if (vimeoMatch) {
      setVideoId(vimeoMatch[1]);
      setVideoType('vimeo');
      return;
    }

    setVideoId(null);
    setVideoType('unknown');
  }, [url]);

  // Native MP4 / Storage video - Show small preview with remove button
  if (videoType === 'mp4') {
    return (
      <div className="mt-2 flex items-center gap-3">
        <div className="relative w-[100px] h-[100px] rounded-lg overflow-hidden border-2 border-gray-200 dark:border-zinc-700 bg-black flex-shrink-0">
          <video
            src={url}
            className="w-full h-full object-cover"
            muted
            loop
            playsInline
            autoPlay
          />
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="px-3 py-2 text-sm font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-red-200 dark:border-red-800"
          >
            הסר
          </button>
        )}
      </div>
    );
  }

  if (!videoId || videoType === 'unknown') {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
        <p className="text-sm text-yellow-700">
          לא ניתן לזהות את הקישור. אנא ודא שהקישור הוא מ-YouTube או Vimeo.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
      <div className="aspect-video w-full">
        {videoType === 'youtube' ? (
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Video preview"
          />
        ) : (
          <iframe
            src={`https://player.vimeo.com/video/${videoId}`}
            className="w-full h-full"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            title="Video preview"
          />
        )}
      </div>
    </div>
  );
}
