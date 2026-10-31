/**
 * Camera scan: the "too dark" check before upload (ScanEdges board). Pure.
 * Rec. 601 luma over RGBA pixels; below DARK_LUMA the photo never leaves the phone.
 */
export const DARK_LUMA = 40;

export function meanLuma(rgba: ArrayLike<number>): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i + 2 < rgba.length; i += 4) {
    sum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    n++;
  }
  return n ? sum / n : 0;
}

export function isTooDark(brightness: number): boolean {
  return brightness < DARK_LUMA;
}
