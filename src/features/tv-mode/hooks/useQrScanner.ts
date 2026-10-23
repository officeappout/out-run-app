'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type BarcodeDetectorLike = { detect(src: CanvasImageSource): Promise<Array<{ rawValue: string }>> };
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

export type ScanState = 'idle' | 'starting' | 'scanning' | 'denied' | 'unsupported';

/**
 * Camera QR scan as a progressive enhancement: uses the platform BarcodeDetector when there is
 * one (Chrome / Android WebView). Everywhere else it reports 'unsupported' and the phone's own
 * camera app (which opens the join link) plus the typed code remain the way in.
 */
export function useQrScanner(onText: (text: string) => void) {
  const [state, setState] = useState<ScanState>('idle');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef(0);
  const cb = useRef(onText);
  cb.current = onText;

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setState((s) => (s === 'scanning' || s === 'starting' ? 'idle' : s));
  }, []);

  const start = useCallback(async () => {
    const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setState('unsupported');
      return;
    }
    setState('starting');
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      stream.current = media;
      const video = videoRef.current;
      if (!video) {
        media.getTracks().forEach((t) => t.stop());
        setState('idle');
        return;
      }
      video.srcObject = media;
      await video.play();
      const detector = new Detector({ formats: ['qr_code'] });
      setState('scanning');
      const tick = async () => {
        if (!stream.current) return;
        try {
          const hits = await detector.detect(video);
          if (hits[0]?.rawValue) {
            cb.current(hits[0].rawValue);
            return;
          }
        } catch {
          /* a frame that cannot be read: try the next one */
        }
        raf.current = requestAnimationFrame(() => void tick());
      };
      void tick();
    } catch {
      setState('denied');
    }
  }, []);

  useEffect(() => stop, [stop]);
  return { state, videoRef, start, stop };
}
