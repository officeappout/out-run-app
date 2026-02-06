'use client';

/**
 * MediaLibraryModal
 * Modal component for browsing and selecting media assets
 * Allows uploading new assets and selecting existing ones
 */

import React, { useState, useEffect } from 'react';
import { X, Search, Upload, Image as ImageIcon, Video, Loader2, Check, Plus } from 'lucide-react';
import { MediaAsset, uploadMediaAsset, getAllMediaAssets, getMediaAssetsByType, searchMediaAssets } from '../services/media-assets.service';
import { motion, AnimatePresence } from 'framer-motion';

interface MediaLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (asset: MediaAsset) => void;
  assetType?: 'image' | 'video' | 'all'; // Filter by type
  title?: string;
}

export default function MediaLibraryModal({
  isOpen,
  onClose,
  onSelect,
  assetType = 'all',
  title = 'ספריית מדיה',
}: MediaLibraryModalProps) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [filteredAssets, setFilteredAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load assets on mount
  useEffect(() => {
    if (isOpen) {
      loadAssets();
    }
  }, [isOpen, assetType]);

  // Filter assets by search term
  useEffect(() => {
    if (searchTerm.trim()) {
      handleSearch(searchTerm);
    } else {
      setFilteredAssets(assets);
    }
  }, [searchTerm, assets]);

  const loadAssets = async () => {
    try {
      setLoading(true);
      let loadedAssets: MediaAsset[];
      
      if (assetType === 'all') {
        loadedAssets = await getAllMediaAssets();
      } else {
        loadedAssets = await getMediaAssetsByType(assetType);
      }
      
      setAssets(loadedAssets);
      setFilteredAssets(loadedAssets);
    } catch (error: any) {
      console.error('Error loading assets:', error);
      alert(`שגיאה בטעינת הנכסים: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (term: string) => {
    try {
      const results = await searchMediaAssets(term);
      setFilteredAssets(results);
    } catch (error: any) {
      console.error('Error searching assets:', error);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      // Auto-fill name from filename if empty
      if (!uploadFileName) {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        setUploadFileName(nameWithoutExt);
      }
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadFileName.trim()) {
      alert('נא לבחור קובץ ולהזין שם');
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(0);
      
      // Simulate progress (Firebase doesn't provide real-time progress for uploadBytes)
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      const newAsset = await uploadMediaAsset({
        name: uploadFileName.trim(),
        file: uploadFile,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      // Add to assets list
      setAssets((prev) => [newAsset, ...prev]);
      setFilteredAssets((prev) => [newAsset, ...prev]);

      // Show success message
      setSuccessMessage('הקובץ הועלה בהצלחה!');
      setTimeout(() => {
        setSuccessMessage(null);
        setShowUploadForm(false);
        setUploadFile(null);
        setUploadFileName('');
        setUploadProgress(0);
      }, 2000);
    } catch (error: any) {
      console.error('Error uploading file:', error);
      alert(`שגיאה בהעלאת הקובץ: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleSelect = (asset: MediaAsset) => {
    onSelect(asset);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
          dir="rtl"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-800">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white" style={{ fontFamily: 'var(--font-simpler)' }}>
              {title}
            </h2>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowUploadForm(!showUploadForm);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl font-bold transition-colors"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                <Plus size={18} />
                העלה קובץ חדש
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onClose();
                }}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
              >
                <X size={20} className="text-gray-700 dark:text-gray-300" />
              </button>
            </div>
          </div>

          {/* Upload Form */}
          {showUploadForm && (
            <div className="p-6 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-800">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2" style={{ fontFamily: 'var(--font-simpler)' }}>
                    שם הקובץ
                  </label>
                  <input
                    type="text"
                    value={uploadFileName}
                    onChange={(e) => setUploadFileName(e.target.value)}
                    placeholder="לדוגמה: תרגיל שכיבות סמיכה"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-white dark:bg-slate-900"
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2" style={{ fontFamily: 'var(--font-simpler)' }}>
                    בחר קובץ (תמונה או וידאו)
                  </label>
                  <input
                    type="file"
                    accept={assetType === 'image' ? 'image/*' : assetType === 'video' ? 'video/mp4,video/quicktime,video/x-m4v' : 'image/*,video/mp4,video/quicktime,video/x-m4v'}
                    onChange={handleFileSelect}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-white dark:bg-slate-900"
                  />
                  {uploadFile && (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-gray-500" style={{ fontFamily: 'var(--font-simpler)' }}>
                        נבחר: {uploadFile.name} ({(uploadFile.size / 1024 / 1024).toFixed(2)} MB)
                      </p>
                      {uploadFile.name.toLowerCase().endsWith('.mov') && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold" style={{ fontFamily: 'var(--font-simpler)' }}>
                          ⚠️ הערה: קבצי .mov גדולים ועלולים לקחת זמן רב יותר לטעינה למשתמשים. מומלץ להמיר ל-MP4.
                        </p>
                      )}
                      {uploadFile.size > 50 * 1024 * 1024 && (
                        <p className="text-xs text-amber-600 dark:text-amber-400" style={{ fontFamily: 'var(--font-simpler)' }}>
                          ⚠️ הקובץ גדול (מעל 50MB) ועלול לקחת זמן רב יותר להעלאה.
                        </p>
                      )}
                    </div>
                  )}
                </div>
                {uploading && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Loader2 size={16} className="animate-spin" />
                      <span style={{ fontFamily: 'var(--font-simpler)' }}>מעלה קובץ... {uploadProgress}%</span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan-500 transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
                {successMessage && (
                  <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <Check size={16} />
                    <span style={{ fontFamily: 'var(--font-simpler)' }}>{successMessage}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleUpload();
                  }}
                  disabled={uploading || !uploadFile || !uploadFileName.trim()}
                  className="w-full px-4 py-3 bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-colors"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  {uploading ? 'מעלה...' : 'העלה קובץ'}
                </button>
              </div>
            </div>
          )}

          {/* Search Bar */}
          <div className="p-4 border-b border-gray-200 dark:border-slate-800">
            <div className="relative">
              <Search size={20} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="חפש לפי שם..."
                className="w-full pr-10 pl-4 py-2 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-white dark:bg-slate-900"
                style={{ fontFamily: 'var(--font-simpler)' }}
              />
            </div>
          </div>

          {/* Assets Grid */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={32} className="animate-spin text-cyan-500" />
              </div>
            ) : filteredAssets.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 dark:text-gray-400" style={{ fontFamily: 'var(--font-simpler)' }}>
                  {searchTerm ? 'לא נמצאו נכסים' : 'אין נכסים עדיין. העלה קובץ חדש כדי להתחיל.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredAssets.map((asset) => (
                  <motion.div
                    key={asset.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={() => handleSelect(asset)}
                    className="relative group cursor-pointer bg-gray-100 dark:bg-slate-800 rounded-xl overflow-hidden hover:ring-2 hover:ring-cyan-500 transition-all"
                  >
                    {asset.type === 'image' ? (
                      <div className="aspect-square relative">
                        <img
                          src={asset.url}
                          alt={asset.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                          <ImageIcon size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    ) : (
                      <div className="aspect-square relative bg-gray-200 dark:bg-slate-700 flex items-center justify-center">
                        <Video size={48} className="text-gray-400 dark:text-gray-500" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                          <Video size={32} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    )}
                    <div className="p-3">
                      <p className="text-xs font-bold text-gray-900 dark:text-white truncate" style={{ fontFamily: 'var(--font-simpler)' }}>
                        {asset.name}
                      </p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1" style={{ fontFamily: 'var(--font-simpler)' }}>
                        {asset.type === 'image' ? 'תמונה' : 'וידאו'}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
