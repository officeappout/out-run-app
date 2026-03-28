/**
 * Media Assets Service
 * Centralized service for managing media assets (images and videos)
 * Stores assets in Firebase Storage and metadata in Firestore
 */

import { db, storage } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, orderBy, where, doc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject, UploadMetadata } from 'firebase/storage';

/**
 * Location type for media assets
 * Used to categorize where the exercise/content was filmed
 */
export type MediaAssetLocation = 'park' | 'home' | 'gym' | 'office' | 'street' | 'studio' | 'other';

/**
 * Labels for media asset locations (for UI display)
 */
export const MEDIA_LOCATION_LABELS: Record<MediaAssetLocation, string> = {
  park: 'פארק',
  home: 'בית',
  gym: 'חדר כושר',
  office: 'משרד',
  street: 'רחוב',
  studio: 'סטודיו',
  other: 'אחר',
};

export type MediaScope = 'community' | 'locations';

export interface MediaAsset {
  id: string;
  name: string;
  url: string;
  type: 'image' | 'video';
  createdAt: Date;
  fileSize?: number;
  mimeType?: string;
  /** Optional thumbnail URL for videos (generated or uploaded separately) */
  thumbnailUrl?: string;
  /** Optional poster URL for videos */
  posterUrl?: string;
  /** Video duration in seconds (if available) */
  durationSeconds?: number;
  /** Location where the content was filmed */
  location?: MediaAssetLocation;
  /** Tags for categorization (e.g., exercise name, muscle group) */
  tags?: string[];
  /** Authority ID for scoped assets */
  authorityId?: string;
  /** Scope context (community = groups/events, locations = parks/fields) */
  scope?: MediaScope;
}

export interface MediaAssetFormData {
  name: string;
  file: File;
  /** Location where the content was filmed */
  location?: MediaAssetLocation;
  /** Tags for categorization */
  tags?: string[];
  /** Authority ID for scoped uploads */
  authorityId?: string;
  /** Scope context for storage path and filtering */
  scope?: MediaScope;
}

/**
 * Parse filename to detect location hints
 * Recognizes patterns like: "pushup_park_v1.mp4", "home_stretching.mov", etc.
 */
export function parseLocationFromFilename(filename: string): MediaAssetLocation | undefined {
  const lowerName = filename.toLowerCase();
  
  // Check for location keywords in filename
  if (lowerName.includes('park') || lowerName.includes('פארק') || lowerName.includes('outdoor')) {
    return 'park';
  }
  if (lowerName.includes('home') || lowerName.includes('בית') || lowerName.includes('indoor')) {
    return 'home';
  }
  if (lowerName.includes('gym') || lowerName.includes('כושר') || lowerName.includes('חדר')) {
    return 'gym';
  }
  if (lowerName.includes('office') || lowerName.includes('משרד') || lowerName.includes('work')) {
    return 'office';
  }
  if (lowerName.includes('street') || lowerName.includes('רחוב')) {
    return 'street';
  }
  if (lowerName.includes('studio') || lowerName.includes('סטודיו')) {
    return 'studio';
  }
  
  return undefined;
}

/**
 * Upload a new media asset to Firebase Storage and save metadata to Firestore
 */
export async function uploadMediaAsset(data: MediaAssetFormData): Promise<MediaAsset> {
  try {
    const { name, file, location, tags, authorityId, scope } = data;
    
    // Validate file type - support all video formats and images
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    
    if (!isImage && !isVideo) {
      throw new Error('רק קבצי תמונה או וידאו נתמכים');
    }

    // Validate file size (100MB limit)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      throw new Error('גודל הקובץ חורג מ-100MB. נא להקטין את הקובץ או להמיר אותו.');
    }

    // Build storage path based on scope
    const timestamp = Date.now();
    const safeName = name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const fileExtension = file.name.split('.').pop();
    let storagePath: string;
    if (authorityId && scope) {
      storagePath = `authorities/${authorityId}/${scope}/${timestamp}-${safeName}.${fileExtension}`;
    } else {
      storagePath = `media-assets/${timestamp}-${safeName}.${fileExtension}`;
    }
    
    // Upload to Firebase Storage with correct contentType metadata
    const storageRef = ref(storage, storagePath);
    const metadata: UploadMetadata = {
      contentType: file.type,
    };
    await uploadBytes(storageRef, file, metadata);
    
    // Get download URL
    const downloadURL = await getDownloadURL(storageRef);
    
    // Save metadata to Firestore (only include defined fields)
    const assetData: Record<string, any> = {
      name,
      url: downloadURL,
      type: isImage ? 'image' : 'video',
      createdAt: new Date(),
      fileSize: file.size,
      mimeType: file.type,
    };
    
    // Add optional fields only if they have values
    if (location) assetData.location = location;
    if (tags && tags.length > 0) assetData.tags = tags;
    if (authorityId) assetData.authorityId = authorityId;
    if (scope) assetData.scope = scope;
    
    const docRef = await addDoc(collection(db, 'mediaAssets'), assetData);
    
    return {
      id: docRef.id,
      ...assetData,
      createdAt: assetData.createdAt,
    } as MediaAsset;
  } catch (error: any) {
    console.error('Error uploading media asset:', error);
    throw new Error(`נכשלה העלאת הקובץ: ${error.message}`);
  }
}

/**
 * Get all media assets from Firestore.
 * When authorityId + scope are provided, returns only that authority's scoped assets.
 */
export async function getAllMediaAssets(
  authorityId?: string,
  scope?: MediaScope,
): Promise<MediaAsset[]> {
  try {
    const constraints: any[] = [];
    if (authorityId) constraints.push(where('authorityId', '==', authorityId));
    if (scope) constraints.push(where('scope', '==', scope));
    constraints.push(orderBy('createdAt', 'desc'));

    const q = query(collection(db, 'mediaAssets'), ...constraints);
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
    })) as MediaAsset[];
  } catch (error: any) {
    if (error.code === 'failed-precondition' || error.message?.includes('index')) {
      console.warn('Media assets index missing. Please create the index in Firebase Console:', error);
      return [];
    }
    console.error('Error fetching media assets:', error);
    return [];
  }
}

/**
 * Get media assets filtered by type (and optionally by authority scope).
 */
export async function getMediaAssetsByType(
  type: 'image' | 'video',
  authorityId?: string,
  scope?: MediaScope,
): Promise<MediaAsset[]> {
  try {
    const constraints: any[] = [where('type', '==', type)];
    if (authorityId) constraints.push(where('authorityId', '==', authorityId));
    if (scope) constraints.push(where('scope', '==', scope));
    constraints.push(orderBy('createdAt', 'desc'));

    const q = query(collection(db, 'mediaAssets'), ...constraints);
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
    })) as MediaAsset[];
  } catch (error: any) {
    if (error.code === 'failed-precondition' || error.message?.includes('index')) {
      console.warn('Media assets index missing. Please create the index in Firebase Console:', error);
      return [];
    }
    console.error('Error fetching media assets by type:', error);
    return [];
  }
}

/**
 * Search media assets by name
 */
export async function searchMediaAssets(
  searchTerm: string,
  authorityId?: string,
  scope?: MediaScope,
): Promise<MediaAsset[]> {
  try {
    const allAssets = await getAllMediaAssets(authorityId, scope);
    const lowerSearchTerm = searchTerm.toLowerCase();
    
    return allAssets.filter((asset) =>
      asset.name.toLowerCase().includes(lowerSearchTerm)
    );
  } catch (error: any) {
    console.error('Error searching media assets:', error);
    return [];
  }
}

/**
 * Delete a media asset (both from Storage and Firestore)
 */
export async function deleteMediaAsset(assetId: string, storagePath?: string): Promise<void> {
  try {
    // Delete from Firestore
    await deleteDoc(doc(db, 'mediaAssets', assetId));
    
    // Delete from Storage if path is provided
    if (storagePath) {
      const storageRef = ref(storage, storagePath);
      await deleteObject(storageRef);
    }
  } catch (error: any) {
    console.error('Error deleting media asset:', error);
    throw new Error(`נכשלה מחיקת הנכס: ${error.message}`);
  }
}

/**
 * Extract Firebase Storage path from a download URL.
 * Returns undefined if the URL cannot be parsed.
 */
export function extractStoragePath(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/o\/(.+?)(\?|$)/);
    return match?.[1] ? decodeURIComponent(match[1]) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Bulk-delete media assets (Firestore records + Storage files).
 * Deletes are performed in parallel; individual failures are counted but
 * do not stop the batch.
 */
export async function bulkDeleteMediaAssets(
  assets: Pick<MediaAsset, 'id' | 'url'>[]
): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;

  await Promise.all(
    assets.map(async (asset) => {
      try {
        const storagePath = extractStoragePath(asset.url);
        await deleteMediaAsset(asset.id, storagePath);
        deleted++;
      } catch (err) {
        console.error(`Failed to delete asset ${asset.id}:`, err);
        failed++;
      }
    })
  );

  return { deleted, failed };
}
