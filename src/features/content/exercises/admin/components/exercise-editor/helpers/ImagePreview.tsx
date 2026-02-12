'use client';

import { useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';

interface ImagePreviewProps {
  url: string;
  onRemove?: () => void;
}

export default function ImagePreview({ url, onRemove }: ImagePreviewProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  return (
    <div className="mt-2 flex items-center gap-3">
      <div className="relative w-[100px] h-[100px] rounded-lg overflow-hidden border-2 border-gray-200 bg-gray-100 flex-shrink-0">
        {!imageLoaded && !imageError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
        {imageError ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <ImageIcon size={24} className="text-gray-400" />
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
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="px-3 py-2 text-sm font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors border border-red-200"
        >
          הסר
        </button>
      )}
    </div>
  );
}
