/**
 * Media Assets Service
 * Centralized service for managing media assets (images and videos)
 * Stores assets in Firebase Storage and metadata in Firestore
 */

import { db, storage } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, orderBy, where, doc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject, UploadMetadata } from 'firebase/storage';

export interface MediaAsset {
  id: string;
  name: string;
  url: string;
  type: 'image' | 'video';
  createdAt: Date;
  fileSize?: number;
  mimeType?: string;
}

export interface MediaAssetFormData {
  name: string;
  file: File;
}

/**
 * Upload a new media asset to Firebase Storage and save metadata to Firestore
 */
export async function uploadMediaAsset(data: MediaAssetFormData): Promise<MediaAsset> {
  try {
    const { name, file } = data;
    
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

    // Create storage path
    const timestamp = Date.now();
    const safeName = name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const fileExtension = file.name.split('.').pop();
    const storagePath = `media-assets/${timestamp}-${safeName}.${fileExtension}`;
    
    // Upload to Firebase Storage with correct contentType metadata
    const storageRef = ref(storage, storagePath);
    const metadata: UploadMetadata = {
      contentType: file.type,
    };
    await uploadBytes(storageRef, file, metadata);
    
    // Get download URL
    const downloadURL = await getDownloadURL(storageRef);
    
    // Save metadata to Firestore
    const assetData = {
      name,
      url: downloadURL,
      type: isImage ? 'image' : 'video',
      createdAt: new Date(),
      fileSize: file.size,
      mimeType: file.type,
    };
    
    const docRef = await addDoc(collection(db, 'mediaAssets'), assetData);
    
    return {
      id: docRef.id,
      ...assetData,
    };
  } catch (error: any) {
    console.error('Error uploading media asset:', error);
    throw new Error(`נכשלה העלאת הקובץ: ${error.message}`);
  }
}

/**
 * Get all media assets from Firestore
 */
export async function getAllMediaAssets(): Promise<MediaAsset[]> {
  try {
    const q = query(
      collection(db, 'mediaAssets'),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
    })) as MediaAsset[];
  } catch (error: any) {
    // Handle missing index error gracefully
    if (error.code === 'failed-precondition' || error.message?.includes('index')) {
      console.warn('Media assets index missing. Please create the index in Firebase Console:', error);
      // Return empty array instead of crashing
      return [];
    }
    console.error('Error fetching media assets:', error);
    // Return empty array instead of throwing to prevent app crash
    return [];
  }
}

/**
 * Get media assets filtered by type
 */
export async function getMediaAssetsByType(type: 'image' | 'video'): Promise<MediaAsset[]> {
  try {
    const q = query(
      collection(db, 'mediaAssets'),
      where('type', '==', type),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
    })) as MediaAsset[];
  } catch (error: any) {
    // Handle missing index error gracefully
    if (error.code === 'failed-precondition' || error.message?.includes('index')) {
      console.warn('Media assets index missing. Please create the index in Firebase Console:', error);
      // Return empty array instead of crashing
      return [];
    }
    console.error('Error fetching media assets by type:', error);
    // Return empty array instead of throwing to prevent app crash
    return [];
  }
}

/**
 * Search media assets by name
 */
export async function searchMediaAssets(searchTerm: string): Promise<MediaAsset[]> {
  try {
    const allAssets = await getAllMediaAssets();
    const lowerSearchTerm = searchTerm.toLowerCase();
    
    return allAssets.filter((asset) =>
      asset.name.toLowerCase().includes(lowerSearchTerm)
    );
  } catch (error: any) {
    console.error('Error searching media assets:', error);
    // Return empty array instead of throwing to prevent app crash
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
