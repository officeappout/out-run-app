import { describe, it, expect, vi } from 'vitest';
import { installShareShim, needsShareShim, toPluginShare } from '../shareShim';

describe('native share shim (pilot W2)', () => {
  it('installs only inside the native shell when navigator.share is missing', () => {
    expect(needsShareShim({}, true)).toBe(true);
    expect(needsShareShim({ share: () => {} }, true)).toBe(false);
    expect(needsShareShim({}, false)).toBe(false);
  });

  it('maps Web Share data to the plugin and refuses an empty share', () => {
    expect(toPluginShare({ text: 'hi', url: 'https://x' })).toEqual({ title: undefined, text: 'hi', url: 'https://x' });
    expect(toPluginShare({})).toBeNull();
  });

  it('navigator.share opens the plugin; closing the sheet is an AbortError; files are not shareable', async () => {
    const plugin = { share: vi.fn().mockResolvedValue({}) };
    const nav = {} as Navigator;
    installShareShim(nav, plugin);
    await nav.share({ text: 'join me' });
    expect(plugin.share).toHaveBeenCalledWith({ title: undefined, text: 'join me', url: undefined });

    plugin.share.mockRejectedValueOnce(new Error('Share canceled'));
    await expect(nav.share({ text: 'x' })).rejects.toMatchObject({ name: 'AbortError' });

    const file = new File(['a'], 'a.png');
    expect(nav.canShare({ files: [file] })).toBe(false);
    expect(nav.canShare({ text: 'x' })).toBe(true);
  });
});
