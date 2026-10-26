/**
 * Native share shim (pilot 26.10, W2).
 *
 * The Android WebView has no `navigator.share`, so every "share" / "invite a friend" button
 * fell back to copying the link. Inside the native shell this routes `navigator.share` to the
 * OS share sheet through @capacitor/share, so the ~25 existing call sites keep working
 * unchanged. iOS already has `navigator.share` (WKWebView) and is left alone.
 *
 * File shares (`{ files }`) are not supported by the plugin from the web layer, so
 * `navigator.canShare` answers false for them and callers keep their own fallback.
 */

type ShareData = { title?: string; text?: string; url?: string; files?: File[] };
type SharePlugin = { share: (o: { title?: string; text?: string; url?: string; dialogTitle?: string }) => Promise<unknown> };

/** Pure: should the shim be installed? */
export function needsShareShim(nav: { share?: unknown } | undefined, isNative: boolean): boolean {
  return isNative && !!nav && typeof nav.share !== 'function';
}

/** Pure: map Web Share data to the plugin's options (null = nothing shareable). */
export function toPluginShare(data: ShareData | undefined): { title?: string; text?: string; url?: string } | null {
  if (!data) return null;
  const { title, text, url } = data;
  if (!title && !text && !url) return null;
  return { title, text, url };
}

/** A user who closes the share sheet is not an error worth surfacing (same as Web Share's AbortError). */
function isCancel(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /cancel/i.test(msg);
}

export function installShareShim(nav: Navigator, plugin: SharePlugin): void {
  const n = nav as Navigator & { share?: (d: ShareData) => Promise<void>; canShare?: (d?: ShareData) => boolean };
  n.share = async (data?: ShareData) => {
    const opts = toPluginShare(data);
    if (!opts) throw new TypeError('Nothing to share');
    try {
      await plugin.share(opts);
    } catch (err) {
      if (isCancel(err)) throw new DOMException('Share canceled', 'AbortError');
      throw err;
    }
  };
  n.canShare = (data?: ShareData) => !data?.files?.length && toPluginShare(data) !== null;
}
