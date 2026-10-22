/** Client side of /api/join/preview?token= — the signed-out-safe session invite read. */
import type { SessionPreviewResult } from './session-preview';

export async function fetchSessionPreview(token: string): Promise<SessionPreviewResult> {
  const res = await fetch(`/api/join/preview?token=${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error(`session-preview-${res.status}`);
  return (await res.json()) as SessionPreviewResult;
}
