'use client';

import { useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';

interface ImagePreviewProps {
  url: string;
}

export default function ImagePreview({ url }: ImagePreviewProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
      <div className="relative w-full aspect-video bg-gray-100">
        {!imageLoaded && !imageError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs text-gray-500">טוען תמונה...</p>
            </div>
          </div>
        )}
        {imageError ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <ImageIcon size={32} className="text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">לא ניתן לטעון את התמונה</p>
              <p className="text-xs text-gray-400 mt-1">ודא שהקישור תקין</p>
            </div>
          </div>
        ) : (
          <img
            src={url}
            alt="Preview"
            className={`w-full h-full object-cover ${imageLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
            onLoad={() => setImageLoaded(true)}
            onError={() => {
              setImageError(true);
              setImageLoaded(false);
            }}
          />
        )}
      </div>
    </div>
  );
}
