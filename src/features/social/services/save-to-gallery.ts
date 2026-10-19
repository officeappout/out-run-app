/**
 * "שמירה לגלריה" for share images & stickers.
 *
 * - Native app with the photo-library plugin (iOS, from the next native
 *   build on): writes the PNG bytes straight into Photos via
 *   @capacitor-community/media (add-only permission; PNG transparency kept).
 * - Android app with the in-repo `SaveToGallery` plugin (from the next native
 *   build on): writes the bytes into Pictures/OUT via MediaStore — no
 *   permission on Android 10+ (@capacitor-community/media would need
 *   READ_MEDIA_IMAGES, which the app deliberately doesn't declare). Below
 *   Android 10 the plugin rejects and we fall back to the share sheet.
 * - Native app without a plugin (today's store builds): the OS share sheet,
 *   whose "Save image" does the job.
 * - Web: a plain file download.
 *
 * The decision is a pure function (`chooseSaveStrategy`) so it's unit-tested;
 * the platform calls are injected through `SaveDeps`.
 */
import { shareOrDownload } from './share-image-render';
import { getSaveToGalleryPlugin, SAVE_TO_GALLERY_PLUGIN } from './save-to-gallery-plugin';

export type SaveStrategy = 'photo-library' | 'media-store' | 'share-sheet' | 'download';
export type SaveResult = 'saved' | 'shared' | 'downloaded' | 'cancelled' | 'denied';

/** Capacitor registers the plugin under this name (`registerPlugin('Media')`). */
export const MEDIA_PLUGIN = 'Media';

/** Platforms where the plugin may write to the photo library. */
const PHOTO_LIBRARY_PLATFORMS = new Set(['ios']);

export interface SaveEnv {
  native: boolean;
  platform: string;
  /** @capacitor-community/media is registered (iOS builds from #475 on). */
  pluginAvailable: boolean;
  /** The app's own Android `SaveToGallery` plugin is registered. */
  galleryPluginAvailable?: boolean;
}

export function chooseSaveStrategy(env: SaveEnv): SaveStrategy {
  if (!env.native) return 'download';
  if (env.pluginAvailable && PHOTO_LIBRARY_PLATFORMS.has(env.platform)) return 'photo-library';
  if (env.galleryPluginAvailable && env.platform === 'android') return 'media-store';
  return 'share-sheet';
}

/** The plugin rejects with code "accessDenied" when the user said no. */
export function isPermissionDenied(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  if (e?.code === 'accessDenied') return true;
  return typeof e?.message === 'string' && /denied|not allowed/i.test(e.message);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('read failed'));
    r.readAsDataURL(blob);
  });
}

export interface SaveDeps {
  env: () => SaveEnv;
  savePhoto: (dataUrl: string) => Promise<void>;
  /** Android MediaStore write (SaveToGallery plugin). */
  saveToMediaStore: (dataUrl: string, fileName: string, mimeType: string) => Promise<void>;
  share: (blob: Blob, fileName: string) => Promise<'shared' | 'downloaded' | 'cancelled'>;
  download: (blob: Blob, fileName: string) => void;
  toDataUrl: (blob: Blob) => Promise<string>;
}

function capacitor(): { isNativePlatform?: () => boolean; getPlatform?: () => string; isPluginAvailable?: (n: string) => boolean } | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { Capacitor?: ReturnType<typeof capacitor> }).Capacitor;
}

function downloadFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const defaultDeps: SaveDeps = {
  env: () => {
    const cap = capacitor();
    return {
      native: Boolean(cap?.isNativePlatform?.()),
      platform: cap?.getPlatform?.() ?? 'web',
      pluginAvailable: Boolean(cap?.isPluginAvailable?.(MEDIA_PLUGIN)),
      galleryPluginAvailable: Boolean(cap?.isPluginAvailable?.(SAVE_TO_GALLERY_PLUGIN)),
    };
  },
  savePhoto: async (dataUrl) => {
    // Lazy: only the native path needs the plugin's JS.
    const { Media } = await import('@capacitor-community/media');
    // No album → iOS asks for add-only access (NSPhotoLibraryAddUsageDescription).
    await Media.savePhoto({ path: dataUrl });
  },
  saveToMediaStore: async (dataUrl, fileName, mimeType) => {
    const plugin = await getSaveToGalleryPlugin();
    await plugin.saveImage({
      data: dataUrl,
      fileName,
      mimeType: mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png',
    });
  },
  share: shareOrDownload,
  download: downloadFile,
  toDataUrl: blobToDataUrl,
};

/**
 * Save a rendered share image. Never throws on permission denial — returns
 * 'denied' so the caller can show a friendly hint. Other plugin failures fall
 * back to the share sheet so the user can still keep the image.
 */
export async function saveImageToGallery(blob: Blob, fileName: string, deps: SaveDeps = defaultDeps): Promise<SaveResult> {
  const strategy = chooseSaveStrategy(deps.env());
  if (strategy === 'download') {
    deps.download(blob, fileName);
    return 'downloaded';
  }
  if (strategy === 'photo-library') {
    try {
      await deps.savePhoto(await deps.toDataUrl(blob));
      return 'saved';
    } catch (err) {
      if (isPermissionDenied(err)) return 'denied';
      // fall through to the share sheet
    }
  }
  if (strategy === 'media-store') {
    try {
      await deps.saveToMediaStore(await deps.toDataUrl(blob), fileName, blob.type || 'image/png');
      return 'saved';
    } catch {
      // Android < 10 ("UNSUPPORTED") or a MediaStore failure → share sheet
    }
  }
  return deps.share(blob, fileName);
}
