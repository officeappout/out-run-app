import { describe, expect, it, vi } from 'vitest';

vi.mock('../share-image-render', () => ({ shareOrDownload: vi.fn() }));

import { chooseSaveStrategy, isPermissionDenied, saveImageToGallery, type SaveDeps, type SaveEnv } from '../save-to-gallery';

const blob = new Blob(['x'], { type: 'image/png' });

function deps(env: SaveEnv, over: Partial<SaveDeps> = {}): SaveDeps {
  return {
    env: () => env,
    savePhoto: vi.fn(async () => {}),
    share: vi.fn(async () => 'shared' as const),
    download: vi.fn(),
    toDataUrl: vi.fn(async () => 'data:image/png;base64,eA=='),
    ...over,
  };
}

const IOS_NEW: SaveEnv = { native: true, platform: 'ios', pluginAvailable: true };
const IOS_OLD: SaveEnv = { native: true, platform: 'ios', pluginAvailable: false };
const ANDROID: SaveEnv = { native: true, platform: 'android', pluginAvailable: true };
const WEB: SaveEnv = { native: false, platform: 'web', pluginAvailable: false };

describe('chooseSaveStrategy', () => {
  it('web downloads', () => expect(chooseSaveStrategy(WEB)).toBe('download'));
  it('iOS with the plugin writes to Photos', () => expect(chooseSaveStrategy(IOS_NEW)).toBe('photo-library'));
  it('today\'s store build (no plugin) keeps the share sheet', () => expect(chooseSaveStrategy(IOS_OLD)).toBe('share-sheet'));
  it('Android keeps the share sheet (no READ_MEDIA_IMAGES)', () => expect(chooseSaveStrategy(ANDROID)).toBe('share-sheet'));
  it('a web page that somehow reports the plugin still downloads', () =>
    expect(chooseSaveStrategy({ native: false, platform: 'ios', pluginAvailable: true })).toBe('download'));
});

describe('isPermissionDenied', () => {
  it('matches the plugin code', () => expect(isPermissionDenied({ code: 'accessDenied' })).toBe(true));
  it('matches denial messages', () => {
    expect(isPermissionDenied(new Error('Access to photos not allowed by user'))).toBe(true);
    expect(isPermissionDenied(new Error('user denied permission request'))).toBe(true);
  });
  it('ignores other errors', () => {
    expect(isPermissionDenied(new Error('Unable to save image to album'))).toBe(false);
    expect(isPermissionDenied(null)).toBe(false);
  });
});

describe('saveImageToGallery', () => {
  it('web → download', async () => {
    const d = deps(WEB);
    expect(await saveImageToGallery(blob, 'a.png', d)).toBe('downloaded');
    expect(d.download).toHaveBeenCalledWith(blob, 'a.png');
    expect(d.savePhoto).not.toHaveBeenCalled();
    expect(d.share).not.toHaveBeenCalled();
  });

  it('iOS with plugin → saves the PNG data URL to Photos', async () => {
    const d = deps(IOS_NEW);
    expect(await saveImageToGallery(blob, 'a.png', d)).toBe('saved');
    expect(d.savePhoto).toHaveBeenCalledWith('data:image/png;base64,eA==');
    expect(d.share).not.toHaveBeenCalled();
  });

  it('permission denied → "denied", no share sheet', async () => {
    const d = deps(IOS_NEW, { savePhoto: vi.fn(async () => Promise.reject({ code: 'accessDenied' })) });
    expect(await saveImageToGallery(blob, 'a.png', d)).toBe('denied');
    expect(d.share).not.toHaveBeenCalled();
  });

  it('other plugin failure → falls back to the share sheet', async () => {
    const d = deps(IOS_NEW, { savePhoto: vi.fn(async () => Promise.reject(new Error('Unable to save image to album'))) });
    expect(await saveImageToGallery(blob, 'a.png', d)).toBe('shared');
    expect(d.share).toHaveBeenCalledWith(blob, 'a.png');
  });

  it('old native build → share sheet, cancel passes through', async () => {
    const d = deps(IOS_OLD, { share: vi.fn(async () => 'cancelled' as const) });
    expect(await saveImageToGallery(blob, 'a.png', d)).toBe('cancelled');
    expect(d.savePhoto).not.toHaveBeenCalled();
  });
});
