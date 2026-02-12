'use client';

/**
 * MediaLibraryModal
 * Modal component for browsing and selecting media assets
 * Allows uploading new assets and selecting existing ones
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Search, Upload, Image as ImageIcon, Video, Loader2, Check, Plus, Play, Trash2, MapPin, Home, Building2, Trees, ChevronDown, Tag, AlertTriangle } from 'lucide-react';
import { MediaAsset, MediaAssetLocation, MEDIA_LOCATION_LABELS, uploadMediaAsset, getAllMediaAssets, getMediaAssetsByType, searchMediaAssets, parseLocationFromFilename, deleteMediaAsset, bulkDeleteMediaAssets } from '../services/media-assets.service';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Upload Queue Item
 * Represents a file pending upload with its individual metadata
 */
interface UploadQueueItem {
  id: string;
  file: File;
  name: string;
  location: MediaAssetLocation | undefined;
  tags: string[];
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
  previewUrl?: string;
}

/**
 * VideoThumbnail component
 * Shows video thumbnail using the #t=0.1 trick for reliable first frame display
 */
function VideoThumbnail({ 
  asset, 
  className = '' 
}: { 
  asset: MediaAsset; 
  className?: string;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Priority: thumbnailUrl > posterUrl > video with #t=0.1 trick
  const thumbnailSrc = asset.thumbnailUrl || asset.posterUrl;
  
  // Build video URL with time fragment for first frame
  const videoUrlWithTime = `${asset.url}#t=0.1`;

  // If we have a dedicated thumbnail URL, show it as an image
  if (thumbnailSrc) {
    return (
      <div className={`relative ${className}`}>
        {/* Loading placeholder */}
        {isLoading && (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center animate-pulse">
            <Video size={24} className="text-slate-400" />
          </div>
        )}
        <img
          src={thumbnailSrc}
          alt={asset.name}
          className="w-full h-full object-cover"
          loading="lazy"
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
        />
        {/* Play icon overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-10 h-10 bg-black/50 rounded-full flex items-center justify-center backdrop-blur-sm">
            <Play size={20} className="text-white ml-0.5" fill="white" />
          </div>
        </div>
      </div>
    );
  }

  // Fallback: Use video element with #t=0.1 trick to show first frame
  return (
    <div className={`relative ${className}`}>
      {/* Loading placeholder - shown while video loads */}
      {isLoading && (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center z-10">
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={20} className="animate-spin text-slate-400" />
            <span className="text-[9px] text-slate-400">טוען תצוגה מקדימה...</span>
          </div>
        </div>
      )}
      
      {/* Video element with #t=0.1 for first frame */}
      <video
        src={videoUrlWithTime}
        preload="metadata"
        muted
        playsInline
        className="w-full h-full object-cover"
        onLoadedData={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
      />
      
      {/* Play icon overlay */}
      {!isLoading && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-10 h-10 bg-black/50 rounded-full flex items-center justify-center backdrop-blur-sm">
            <Play size={20} className="text-white ml-0.5" fill="white" />
          </div>
        </div>
      )}

      {/* Error fallback with stylized placeholder */}
      {hasError && (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-700 to-slate-800 flex flex-col items-center justify-center">
          <Video size={28} className="text-slate-400 mb-1" />
          <span className="text-[9px] text-slate-400 text-center px-2 truncate max-w-full">
            {asset.name}
          </span>
        </div>
      )}
    </div>
  );
}

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
  
  // Bulk Upload Queue State
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [globalLocation, setGlobalLocation] = useState<MediaAssetLocation | ''>('');
  const [newTagInput, setNewTagInput] = useState<Record<string, string>>({});
  
  // Delete Confirmation State
  const [assetToDelete, setAssetToDelete] = useState<MediaAsset | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  
  // Bulk Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  
  // Generate unique ID for queue items
  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Load assets on mount
  useEffect(() => {
    if (isOpen) {
      loadAssets();
    }
  }, [isOpen, assetType]);

  // Filter assets by search term (enhanced: searches name, tags, and location)
  useEffect(() => {
    if (searchTerm.trim()) {
      const lowerTerm = searchTerm.toLowerCase();
      const filtered = assets.filter((asset) => {
        // Search by name
        if (asset.name.toLowerCase().includes(lowerTerm)) return true;
        // Search by tags
        if (asset.tags?.some((tag) => tag.toLowerCase().includes(lowerTerm))) return true;
        // Search by location
        if (asset.location) {
          const locationLabel = MEDIA_LOCATION_LABELS[asset.location]?.toLowerCase() || '';
          if (asset.location.toLowerCase().includes(lowerTerm) || locationLabel.includes(lowerTerm)) return true;
        }
        return false;
      });
      setFilteredAssets(filtered);
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
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    // Check if multiple files selected
    if (files.length > 1) {
      // Switch to bulk mode
      setIsBulkMode(true);
      setShowUploadForm(true);
      
      // Add all files to queue
      const newQueueItems: UploadQueueItem[] = Array.from(files).map((file) => {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        const detectedLocation = parseLocationFromFilename(file.name);
        
        return {
          id: generateId(),
          file,
          name: nameWithoutExt,
          location: detectedLocation,
          tags: [],
          status: 'pending',
          progress: 0,
          previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
        };
      });
      
      setUploadQueue((prev) => [...prev, ...newQueueItems]);
    } else {
      // Single file - legacy behavior
      const file = files[0];
      setUploadFile(file);
      setIsBulkMode(false);
      // Auto-fill name from filename if empty
      if (!uploadFileName) {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        setUploadFileName(nameWithoutExt);
      }
    }
    
    // Reset input so same files can be selected again
    e.target.value = '';
  };
  
  // Add files to bulk queue
  const handleBulkFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIsBulkMode(true);
    setShowUploadForm(true);
    
    const newQueueItems: UploadQueueItem[] = Array.from(files).map((file) => {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      const detectedLocation = parseLocationFromFilename(file.name);
      
      return {
        id: generateId(),
        file,
        name: nameWithoutExt,
        location: detectedLocation,
        tags: [],
        status: 'pending',
        progress: 0,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      };
    });
    
    setUploadQueue((prev) => [...prev, ...newQueueItems]);
    e.target.value = '';
  };
  
  // Update queue item
  const updateQueueItem = (id: string, updates: Partial<UploadQueueItem>) => {
    setUploadQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };
  
  // Remove item from queue
  const removeFromQueue = (id: string) => {
    setUploadQueue((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item?.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
      return prev.filter((i) => i.id !== id);
    });
  };
  
  // Apply global location to all empty items
  const applyGlobalLocation = () => {
    if (!globalLocation) return;
    setUploadQueue((prev) =>
      prev.map((item) =>
        item.location === undefined ? { ...item, location: globalLocation as MediaAssetLocation } : item
      )
    );
  };
  
  // Add tag to queue item
  const addTagToItem = (id: string, tag: string) => {
    if (!tag.trim()) return;
    setUploadQueue((prev) =>
      prev.map((item) =>
        item.id === id && !item.tags.includes(tag.trim())
          ? { ...item, tags: [...item.tags, tag.trim()] }
          : item
      )
    );
    setNewTagInput((prev) => ({ ...prev, [id]: '' }));
  };
  
  // Remove tag from queue item
  const removeTagFromItem = (id: string, tag: string) => {
    setUploadQueue((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, tags: item.tags.filter((t) => t !== tag) } : item
      )
    );
  };
  
  // Upload all items in queue
  const handleBulkUpload = async () => {
    const pendingItems = uploadQueue.filter((item) => item.status === 'pending');
    if (pendingItems.length === 0) return;
    
    setUploading(true);
    
    for (const item of pendingItems) {
      try {
        updateQueueItem(item.id, { status: 'uploading', progress: 10 });
        
        // Simulate progress updates
        const progressInterval = setInterval(() => {
          updateQueueItem(item.id, { 
            progress: Math.min((uploadQueue.find(i => i.id === item.id)?.progress || 0) + 15, 90)
          });
        }, 200);
        
        const newAsset = await uploadMediaAsset({
          name: item.name.trim(),
          file: item.file,
          location: item.location,
          tags: item.tags,
        });
        
        clearInterval(progressInterval);
        updateQueueItem(item.id, { status: 'success', progress: 100 });
        
        // Add to assets list
        setAssets((prev) => [newAsset, ...prev]);
        setFilteredAssets((prev) => [newAsset, ...prev]);
      } catch (error: any) {
        updateQueueItem(item.id, { status: 'error', error: error.message });
      }
    }
    
    setUploading(false);
    
    // Clear successful items after a delay
    setTimeout(() => {
      setUploadQueue((prev) => prev.filter((item) => item.status !== 'success'));
      if (uploadQueue.every((item) => item.status === 'success')) {
        setShowUploadForm(false);
        setIsBulkMode(false);
      }
    }, 2000);
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
  
  // Delete confirmation handler
  const handleDeleteClick = (e: React.MouseEvent, asset: MediaAsset) => {
    e.stopPropagation(); // Prevent triggering the select handler
    setAssetToDelete(asset);
    setDeleteError(null);
  };
  
  // Confirm delete handler
  const handleConfirmDelete = async () => {
    if (!assetToDelete) return;
    
    setIsDeleting(true);
    setDeleteError(null);
    
    try {
      // Extract storage path from URL
      // Firebase Storage URLs contain the path after '/o/' and before '?'
      let storagePath: string | undefined;
      try {
        const url = new URL(assetToDelete.url);
        const pathMatch = url.pathname.match(/\/o\/(.+?)(\?|$)/);
        if (pathMatch && pathMatch[1]) {
          storagePath = decodeURIComponent(pathMatch[1]);
        }
      } catch {
        console.warn('Could not parse storage path from URL');
      }
      
      // Delete from both Firestore and Storage
      await deleteMediaAsset(assetToDelete.id, storagePath);
      
      // Update local state immediately
      setAssets((prev) => prev.filter((a) => a.id !== assetToDelete.id));
      setFilteredAssets((prev) => prev.filter((a) => a.id !== assetToDelete.id));
      
      // Close the confirmation modal
      setAssetToDelete(null);
    } catch (error: any) {
      console.error('Error deleting asset:', error);
      setDeleteError(error.message || 'שגיאה במחיקת הקובץ');
    } finally {
      setIsDeleting(false);
    }
  };
  
  // Cancel delete handler
  const handleCancelDelete = () => {
    setAssetToDelete(null);
    setDeleteError(null);
  };

  // ── Bulk Selection Helpers ─────────────────────────────────────
  const toggleSelect = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredAssets.map((a) => a.id)));
  }, [filteredAssets]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBulkDeleteClick = useCallback(() => {
    if (selectedIds.size === 0) return;
    setBulkDeleteError(null);
    setShowBulkDeleteConfirm(true);
  }, [selectedIds]);

  const handleConfirmBulkDelete = useCallback(async () => {
    const toDelete = assets.filter((a) => selectedIds.has(a.id));
    if (toDelete.length === 0) return;

    setIsBulkDeleting(true);
    setBulkDeleteError(null);

    try {
      const result = await bulkDeleteMediaAssets(toDelete);

      // Remove deleted items from local state
      const deletedSet = new Set(toDelete.map((a) => a.id));
      setAssets((prev) => prev.filter((a) => !deletedSet.has(a.id)));
      setFilteredAssets((prev) => prev.filter((a) => !deletedSet.has(a.id)));
      setSelectedIds(new Set());
      setShowBulkDeleteConfirm(false);

      if (result.failed > 0) {
        setBulkDeleteError(`${result.deleted} נמחקו בהצלחה, ${result.failed} נכשלו`);
      }
    } catch (error: any) {
      setBulkDeleteError(error.message || 'שגיאה במחיקה מרובה');
    } finally {
      setIsBulkDeleting(false);
    }
  }, [selectedIds, assets]);

  const handleCancelBulkDelete = useCallback(() => {
    setShowBulkDeleteConfirm(false);
    setBulkDeleteError(null);
  }, []);

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
            <div className="p-6 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-800 max-h-[50vh] overflow-y-auto">
              {/* Bulk Upload Queue */}
              {isBulkMode && uploadQueue.length > 0 && (
                <div className="space-y-4">
                  {/* Global Override Controls */}
                  <div className="flex items-center gap-4 p-3 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700">
                    <span className="text-xs font-bold text-gray-500" style={{ fontFamily: 'var(--font-simpler)' }}>
                      החל על הכל:
                    </span>
                    <div className="flex items-center gap-2">
                      <select
                        value={globalLocation}
                        onChange={(e) => setGlobalLocation(e.target.value as MediaAssetLocation | '')}
                        className="px-3 py-1.5 text-xs border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 focus:ring-2 focus:ring-cyan-500"
                        style={{ fontFamily: 'var(--font-simpler)' }}
                      >
                        <option value="">בחר מיקום...</option>
                        {Object.entries(MEDIA_LOCATION_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={applyGlobalLocation}
                        disabled={!globalLocation}
                        className="px-3 py-1.5 text-xs bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-300 text-white rounded-lg font-medium transition-colors"
                        style={{ fontFamily: 'var(--font-simpler)' }}
                      >
                        החל
                      </button>
                    </div>
                    <span className="text-[10px] text-gray-400">
                      ({uploadQueue.filter(i => i.status === 'pending').length} קבצים ממתינים)
                    </span>
                  </div>

                  {/* Queue Table */}
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                    {/* Table Header */}
                    <div className="grid grid-cols-[60px,1fr,140px,1fr,80px] gap-2 p-3 bg-gray-100 dark:bg-slate-800 text-xs font-bold text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-slate-700" style={{ fontFamily: 'var(--font-simpler)' }}>
                      <div>תצוגה</div>
                      <div>שם הקובץ</div>
                      <div>מיקום</div>
                      <div>תגיות</div>
                      <div className="text-center">פעולות</div>
                    </div>

                    {/* Queue Items */}
                    <div className="divide-y divide-gray-100 dark:divide-slate-800 max-h-[200px] overflow-y-auto">
                      {uploadQueue.map((item) => (
                        <div
                          key={item.id}
                          className={`grid grid-cols-[60px,1fr,140px,1fr,80px] gap-2 p-3 items-center transition-colors ${
                            item.status === 'success' ? 'bg-green-50 dark:bg-green-900/20' :
                            item.status === 'error' ? 'bg-red-50 dark:bg-red-900/20' :
                            item.status === 'uploading' ? 'bg-cyan-50 dark:bg-cyan-900/20' :
                            'hover:bg-gray-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {/* Thumbnail */}
                          <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                            {item.previewUrl ? (
                              <img src={item.previewUrl} alt={item.name} className="w-full h-full object-cover" />
                            ) : item.file.type.startsWith('video/') ? (
                              <Video size={20} className="text-gray-400" />
                            ) : (
                              <ImageIcon size={20} className="text-gray-400" />
                            )}
                          </div>

                          {/* Editable Name */}
                          <div>
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => updateQueueItem(item.id, { name: e.target.value })}
                              disabled={item.status !== 'pending'}
                              className="w-full px-2 py-1 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-transparent focus:ring-2 focus:ring-cyan-500 disabled:bg-gray-100 dark:disabled:bg-slate-800"
                              style={{ fontFamily: 'var(--font-simpler)' }}
                            />
                            {item.status === 'error' && (
                              <p className="text-[10px] text-red-500 mt-0.5">{item.error}</p>
                            )}
                          </div>

                          {/* Location Dropdown */}
                          <div>
                            <select
                              value={item.location || ''}
                              onChange={(e) => updateQueueItem(item.id, { location: e.target.value as MediaAssetLocation || undefined })}
                              disabled={item.status !== 'pending'}
                              className={`w-full px-2 py-1 text-xs border rounded-lg focus:ring-2 focus:ring-cyan-500 disabled:bg-gray-100 dark:disabled:bg-slate-800 ${
                                item.location ? 'border-cyan-300 bg-cyan-50 dark:bg-cyan-900/20' : 'border-gray-200 dark:border-slate-700 bg-transparent'
                              }`}
                              style={{ fontFamily: 'var(--font-simpler)' }}
                            >
                              <option value="">ללא מיקום</option>
                              {Object.entries(MEDIA_LOCATION_LABELS).map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                              ))}
                            </select>
                          </div>

                          {/* Tags */}
                          <div className="flex flex-wrap items-center gap-1">
                            {item.tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded text-[10px]"
                              >
                                {tag}
                                {item.status === 'pending' && (
                                  <button
                                    type="button"
                                    onClick={() => removeTagFromItem(item.id, tag)}
                                    className="hover:text-red-500"
                                  >
                                    <X size={10} />
                                  </button>
                                )}
                              </span>
                            ))}
                            {item.status === 'pending' && (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={newTagInput[item.id] || ''}
                                  onChange={(e) => setNewTagInput((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      addTagToItem(item.id, newTagInput[item.id] || '');
                                    }
                                  }}
                                  placeholder="+תגית"
                                  className="w-14 px-1 py-0.5 text-[10px] border border-dashed border-gray-300 dark:border-slate-600 rounded bg-transparent focus:ring-1 focus:ring-cyan-500"
                                />
                              </div>
                            )}
                          </div>

                          {/* Actions/Status */}
                          <div className="flex items-center justify-center">
                            {item.status === 'pending' && (
                              <button
                                type="button"
                                onClick={() => removeFromQueue(item.id)}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                            {item.status === 'uploading' && (
                              <div className="flex items-center gap-2">
                                <Loader2 size={16} className="animate-spin text-cyan-500" />
                                <span className="text-[10px] text-cyan-600">{item.progress}%</span>
                              </div>
                            )}
                            {item.status === 'success' && (
                              <Check size={16} className="text-green-500" />
                            )}
                            {item.status === 'error' && (
                              <X size={16} className="text-red-500" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bulk Upload Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleBulkUpload();
                    }}
                    disabled={uploading || uploadQueue.filter(i => i.status === 'pending').length === 0}
                    className="w-full px-4 py-3 bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    {uploading ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        מעלה...
                      </>
                    ) : (
                      <>
                        <Upload size={18} />
                        העלה {uploadQueue.filter(i => i.status === 'pending').length} קבצים
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Single File Upload (Legacy) */}
              {!isBulkMode && (
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
              )}
            </div>
          )}

          {/* Sticky Search Bar with Quick Actions */}
          <div className="sticky top-0 z-10 p-4 border-b border-gray-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              {/* Search Input */}
              <div className="relative flex-1">
              <Search size={20} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="חפש לפי שם, תגית או מיקום..."
                className="w-full pr-10 pl-4 py-2 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-white dark:bg-slate-900"
                style={{ fontFamily: 'var(--font-simpler)' }}
              />
            </div>
              
              {/* Quick Upload Actions (Always Visible) */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <label className="flex items-center gap-1.5 cursor-pointer px-2 py-1.5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition-colors">
                  <input
                    type="checkbox"
                    checked={isBulkMode}
                    onChange={(e) => {
                      setIsBulkMode(e.target.checked);
                      if (e.target.checked && !showUploadForm) {
                        setShowUploadForm(true);
                      }
                    }}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-cyan-500 focus:ring-cyan-500"
                  />
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400" style={{ fontFamily: 'var(--font-simpler)' }}>
                    מרובה
                  </span>
                </label>
                
                <label className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg cursor-pointer transition-colors">
                  <Plus size={14} />
                  <span className="text-xs font-bold" style={{ fontFamily: 'var(--font-simpler)' }}>
                    {isBulkMode ? 'הוסף' : 'העלה'}
                  </span>
                  <input
                    type="file"
                    accept={assetType === 'image' ? 'image/*' : assetType === 'video' ? 'video/mp4,video/quicktime,video/x-m4v' : 'image/*,video/mp4,video/quicktime,video/x-m4v'}
                    onChange={(e) => {
                      if (isBulkMode) {
                        handleBulkFileSelect(e);
                      } else {
                        handleFileSelect(e);
                        setShowUploadForm(true);
                      }
                    }}
                    multiple={isBulkMode}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
            
            {/* Search Results Count */}
            {searchTerm && (
              <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                <span style={{ fontFamily: 'var(--font-simpler)' }}>
                  נמצאו {filteredAssets.length} תוצאות עבור "{searchTerm}"
                </span>
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="text-cyan-600 hover:text-cyan-700 font-medium"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  נקה חיפוש
                </button>
              </div>
            )}
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
                {filteredAssets.map((asset) => {
                  const isSelected = selectedIds.has(asset.id);
                  return (
                  <motion.div
                    key={asset.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={() => handleSelect(asset)}
                      className={`relative group cursor-pointer bg-gray-100 dark:bg-slate-800 rounded-xl overflow-hidden transition-all ${
                        isSelected
                          ? 'ring-2 ring-red-400 shadow-lg'
                          : 'hover:ring-2 hover:ring-cyan-500'
                      }`}
                  >
                    {/* Selection Checkbox */}
                    <button
                      type="button"
                      onClick={(e) => toggleSelect(asset.id, e)}
                      className={`absolute top-2 right-2 z-10 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all shadow-sm ${
                        isSelected
                          ? 'bg-red-500 border-red-500 text-white'
                          : 'bg-white/80 border-gray-300 text-transparent group-hover:border-gray-400 hover:border-red-400 hover:bg-red-50'
                      }`}
                      title="בחר למחיקה"
                    >
                      <Check size={14} />
                    </button>

                    {/* Delete Button - Appears on Hover */}
                    <button
                      type="button"
                      onClick={(e) => handleDeleteClick(e, asset)}
                      className="absolute top-2 left-2 z-10 p-1.5 bg-red-500/90 hover:bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                      title="מחק קובץ"
                    >
                      <Trash2 size={14} />
                    </button>
                    
                    {asset.type === 'image' ? (
                      <div className="aspect-square relative">
                        <img
                          src={asset.url}
                          alt={asset.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                          <ImageIcon size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    ) : (
                      <div className="aspect-square relative overflow-hidden">
                        <VideoThumbnail 
                          asset={asset} 
                          className="w-full h-full"
                        />
                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                      </div>
                    )}
                    <div className="p-3">
                      <p className="text-xs font-bold text-gray-900 dark:text-white truncate" style={{ fontFamily: 'var(--font-simpler)' }}>
                        {asset.name}
                      </p>
                      <div className="flex items-center justify-between mt-1">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-[10px] text-gray-500 dark:text-gray-400" style={{ fontFamily: 'var(--font-simpler)' }}>
                        {asset.type === 'image' ? 'תמונה' : 'וידאו'}
                          </span>
                          {asset.location && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 rounded">
                              {MEDIA_LOCATION_LABELS[asset.location] || asset.location}
                            </span>
                          )}
                        </div>
                        {asset.type === 'video' && asset.durationSeconds && (
                          <span className="text-[10px] text-gray-400 bg-gray-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                            {Math.floor(asset.durationSeconds / 60)}:{String(Math.floor(asset.durationSeconds % 60)).padStart(2, '0')}
                          </span>
                        )}
                      </div>
                      {/* Tags row */}
                      {asset.tags && asset.tags.length > 0 && (
                        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                          {asset.tags.slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className="text-[9px] px-1.5 py-0.5 bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                          {asset.tags.length > 2 && (
                            <span className="text-[9px] text-gray-400">
                              +{asset.tags.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Floating Bulk Action Bar ───────────────────────── */}
          <AnimatePresence>
            {selectedIds.size > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="sticky bottom-0 z-20 border-t border-red-200 bg-red-50 dark:bg-red-950/80 backdrop-blur-md px-6 py-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-red-700 dark:text-red-300" style={{ fontFamily: 'var(--font-simpler)' }}>
                    {selectedIds.size} פריטים נבחרו
                  </span>
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-xs text-red-600 hover:text-red-700 underline font-medium"
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    בחר הכל ({filteredAssets.length})
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-xs text-gray-500 hover:text-gray-700 underline font-medium"
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    בטל בחירה
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleBulkDeleteClick}
                  className="flex items-center gap-2 px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-colors shadow-lg"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  <Trash2 size={16} />
                  מחק נבחרים ({selectedIds.size})
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        
        {/* Bulk Delete Confirmation Modal */}
        {showBulkDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[210] flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleCancelBulkDelete} />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6"
              dir="rtl"
            >
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <AlertTriangle size={32} className="text-red-600 dark:text-red-400" />
                </div>
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center mb-2" style={{ fontFamily: 'var(--font-simpler)' }}>
                מחיקה מרובה — {selectedIds.size} פריטים
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-4" style={{ fontFamily: 'var(--font-simpler)' }}>
                האם אתה בטוח שברצונך למחוק {selectedIds.size} קבצים?
                <br />
                פעולה זו תסיר את הקבצים <strong>לצמיתות</strong> מהשרת ומ-Firestore. לא ניתן לשחזר.
              </p>

              {/* Preview thumbnails of selected items (max 8) */}
              <div className="flex flex-wrap gap-1.5 justify-center mb-4 p-3 bg-gray-100 dark:bg-slate-800 rounded-xl">
                {assets
                  .filter((a) => selectedIds.has(a.id))
                  .slice(0, 8)
                  .map((a) => (
                    <div key={a.id} className="w-10 h-10 rounded-md overflow-hidden bg-gray-200 dark:bg-slate-700 flex-shrink-0">
                      {a.type === 'image' ? (
                        <img src={a.url} alt={a.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><Video size={14} className="text-gray-400" /></div>
                      )}
                    </div>
                  ))}
                {selectedIds.size > 8 && (
                  <div className="w-10 h-10 rounded-md bg-gray-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-gray-500">
                    +{selectedIds.size - 8}
                  </div>
                )}
              </div>

              {bulkDeleteError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl mb-4">
                  <p className="text-sm text-red-600 dark:text-red-400 text-center" style={{ fontFamily: 'var(--font-simpler)' }}>
                    {bulkDeleteError}
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCancelBulkDelete}
                  disabled={isBulkDeleting}
                  className="flex-1 px-4 py-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold transition-colors disabled:opacity-50"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  ביטול
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBulkDelete}
                  disabled={isBulkDeleting}
                  className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  {isBulkDeleting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      מוחק {selectedIds.size} פריטים...
                    </>
                  ) : (
                    <>
                      <Trash2 size={16} />
                      מחק {selectedIds.size} פריטים
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Delete Confirmation Modal */}
        {assetToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[210] flex items-center justify-center p-4"
          >
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={handleCancelDelete}
            />
            
            {/* Confirmation Dialog */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6"
              dir="rtl"
            >
              {/* Warning Icon */}
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <AlertTriangle size={32} className="text-red-600 dark:text-red-400" />
                </div>
              </div>
              
              {/* Title */}
              <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center mb-2" style={{ fontFamily: 'var(--font-simpler)' }}>
                האם למחוק את הקובץ?
              </h3>
              
              {/* File Preview */}
              <div className="flex items-center gap-3 p-3 bg-gray-100 dark:bg-slate-800 rounded-xl mb-4">
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                  {assetToDelete.type === 'image' ? (
                    <img src={assetToDelete.url} alt={assetToDelete.name} className="w-full h-full object-cover" />
                  ) : (
                    <Video size={20} className="text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 dark:text-white truncate" style={{ fontFamily: 'var(--font-simpler)' }}>
                    {assetToDelete.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400" style={{ fontFamily: 'var(--font-simpler)' }}>
                    {assetToDelete.type === 'image' ? 'תמונה' : 'וידאו'}
                    {assetToDelete.fileSize && ` • ${(assetToDelete.fileSize / 1024 / 1024).toFixed(2)} MB`}
                  </p>
                </div>
              </div>
              
              {/* Warning Text */}
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-4" style={{ fontFamily: 'var(--font-simpler)' }}>
                פעולה זו תסיר את הקובץ לצמיתות מהשרת. לא ניתן לשחזר קובץ שנמחק.
              </p>
              
              {/* Error Message */}
              {deleteError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl mb-4">
                  <p className="text-sm text-red-600 dark:text-red-400 text-center" style={{ fontFamily: 'var(--font-simpler)' }}>
                    {deleteError}
                  </p>
                </div>
              )}
              
              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCancelDelete}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold transition-colors disabled:opacity-50"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  ביטול
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      מוחק...
                    </>
                  ) : (
                    <>
                      <Trash2 size={16} />
                      מחק לצמיתות
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>
    </AnimatePresence>
  );
}
