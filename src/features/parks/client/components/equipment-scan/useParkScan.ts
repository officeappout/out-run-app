'use client';

/**
 * Camera scan, park mapping (phase 2) state: guided shots (nextParkShot), each sent in 'park'
 * mode, plus one high-accuracy GPS fix taken with the first photo. A photo with people is
 * dropped at once (its preview revoked, its pixels never kept); a dark one never leaves the phone.
 * Usable shots keep their base64 in memory only, for the cover photo and the unknown-item crops
 * uploaded on submit (scan-upload.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nextParkShot } from '@/lib/ai/scan/scan-merge';
import type { ScanPhotoResult } from '@/lib/ai/scan/scan-types';
import { useGPSStore, type GPSCoords } from '@/features/parks/core/store/useGPSStore';
import { captureScanShot } from './scan-capture';
import { isTooDark } from './scan-brightness';
import { postScan, type ScanApiError } from './scan-api';

export interface ParkShot {
  result: ScanPhotoResult;
  /** null for a dropped (people) photo. */
  base64: string | null;
  previewUrl: string | null;
}

export type ParkScanNotice = 'people' | 'dark' | ScanApiError | null;

export function useParkScan(onPermissionDenied: () => void) {
  const [shots, setShots] = useState<ParkShot[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ParkScanNotice>(null);
  const [fix, setFix] = useState<GPSCoords | null>(null);
  const urls = useRef<string[]>([]);
  const requestFix = useGPSStore((s) => s.requestFix);

  useEffect(() => () => { urls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  const results = useMemo(() => shots.map((s) => s.result), [shots]);
  const guide = useMemo(() => nextParkShot(results), [results]);

  const shoot = useCallback(async () => {
    setNotice(null);
    let shot;
    try {
      shot = await captureScanShot();
    } catch (err) {
      if (String((err as { message?: unknown })?.message) === 'permission-denied') onPermissionDenied();
      return;
    }
    if (!shot) return;
    if (isTooDark(shot.brightness)) {
      URL.revokeObjectURL(shot.previewUrl);
      setNotice('dark');
      return;
    }
    setBusy(true);
    const located = fix ? Promise.resolve(null) : requestFix({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 });
    const res = await postScan({ image: shot.base64, mode: 'park' });
    const gps = await located;
    if (gps?.coords) setFix(gps.coords);
    setBusy(false);
    if (!res.ok) {
      URL.revokeObjectURL(shot.previewUrl);
      setNotice(res.error);
      return;
    }
    if (res.result.hasPeople) {
      URL.revokeObjectURL(shot.previewUrl);
      setNotice('people');
      setShots((prev) => [...prev, { result: res.result, base64: null, previewUrl: null }]);
      return;
    }
    urls.current.push(shot.previewUrl);
    setShots((prev) => [...prev, { result: res.result, base64: shot.base64, previewUrl: shot.previewUrl }]);
  }, [fix, requestFix, onPermissionDenied]);

  return { shots, results, guide, busy, notice, fix, shoot };
}
