/**
 * Typed wrapper for the app's own Android plugin `SaveToGallery`
 * (android/app/src/main/java/co/il/appout/outrun/SaveToGalleryPlugin.java).
 *
 * It writes the image bytes into Pictures/OUT through MediaStore — no storage
 * permission on Android 10+. Only native builds that ship the plugin register
 * it; check `Capacitor.isPluginAvailable(SAVE_TO_GALLERY_PLUGIN)` first.
 */

/** Must match `@CapacitorPlugin(name = "SaveToGallery")` on the native side. */
export const SAVE_TO_GALLERY_PLUGIN = 'SaveToGallery';

export interface SaveImageOptions {
  /** Base64 image data, either raw or as a `data:image/...;base64,` URL. */
  data: string;
  /** Display name in the gallery; the extension is fixed up natively. */
  fileName?: string;
  /** 'image/png' (default, alpha kept) or 'image/jpeg'. */
  mimeType?: 'image/png' | 'image/jpeg';
}

export interface SaveToGalleryPlugin {
  /**
   * Rejects with code "UNSUPPORTED" below Android 10, "INVALID_INPUT" on bad
   * data, "SAVE_FAILED" when MediaStore refuses the write.
   */
  saveImage(options: SaveImageOptions): Promise<{ uri: string }>;
}

let cached: SaveToGalleryPlugin | undefined;

/** Lazily registers the proxy so web bundles never touch @capacitor/core here. */
export async function getSaveToGalleryPlugin(): Promise<SaveToGalleryPlugin> {
  if (!cached) {
    const { registerPlugin } = await import('@capacitor/core');
    cached = registerPlugin<SaveToGalleryPlugin>(SAVE_TO_GALLERY_PLUGIN);
  }
  return cached;
}
