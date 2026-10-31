'use client';

/**
 * Camera scan, phase 1 state: capture → (dark check) → analyzing → a ScanScreen, plus the manual
 * "pick from the list" screen. The preview URL is revoked on every new shot and on unmount, and
 * dropped at once when the photo has people in it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { captureScanShot } from './scan-capture';
import { isTooDark } from './scan-brightness';
import { postScan } from './scan-api';
import type { ScanPhotoResult } from '@/lib/ai/scan/scan-types';
import { screenFromVerdict, type ScanScreen } from './scan-flow';

export type ScanState =
  | { kind: 'idle' }
  | { kind: 'analyzing' }
  | { kind: 'pick' }
  | ScanScreen;

export function useEquipmentScan(parkId: string | undefined, onPermissionDenied: () => void) {
  const [state, setState] = useState<ScanState>({ kind: 'idle' });
  const [preview, setPreview] = useState<string | null>(null);
  /** The last answer, kept for the accuracy log (detected vs what the user confirms). */
  const [lastResult, setLastResult] = useState<ScanPhotoResult | null>(null);
  const previewRef = useRef<string | null>(null);
  const run = useRef(0);

  const setPhoto = useCallback((url: string | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
    setPreview(url);
  }, []);

  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  /** Returns false when the user cancelled the camera. */
  const shoot = useCallback(async (): Promise<boolean> => {
    const id = ++run.current;
    let shot;
    try {
      shot = await captureScanShot();
    } catch (err) {
      if (String((err as { message?: unknown })?.message) === 'permission-denied') onPermissionDenied();
      return false;
    }
    if (!shot || id !== run.current) return false;
    setPhoto(shot.previewUrl);
    if (isTooDark(shot.brightness)) {
      setState({ kind: 'edge', edge: 'dark' });
      return true;
    }
    setState({ kind: 'analyzing' });
    setLastResult(null);
    const res = await postScan({ image: shot.base64, mode: 'single', parkId });
    if (id !== run.current) return true;
    if (!res.ok) {
      setState({ kind: 'error', error: res.error });
      return true;
    }
    setLastResult(res.result);
    const next = screenFromVerdict(res.verdict);
    if (next.kind === 'edge' && next.edge === 'people') setPhoto(null);
    setState(next);
    return true;
  }, [parkId, onPermissionDenied, setPhoto]);

  const reset = useCallback(() => {
    run.current++;
    setPhoto(null);
    setState({ kind: 'idle' });
  }, [setPhoto]);

  return { state, setState, preview, lastResult, shoot, reset };
}
