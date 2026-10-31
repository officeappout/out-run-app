/** "העתקה" in the share sheet (board PostShare): the PNG to the clipboard; false when the browser can't. */
export async function copyImageToClipboard(blob: Blob): Promise<boolean> {
  try {
    const C = (globalThis as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
    if (!C || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new C({ [blob.type || 'image/png']: blob })]);
    return true;
  } catch {
    return false;
  }
}
