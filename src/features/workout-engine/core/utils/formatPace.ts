export function formatPace(paceMinutes: number | null | undefined): string {
  if (!paceMinutes || !isFinite(paceMinutes) || paceMinutes <= 0) return '00:00';
  const minutes = Math.floor(paceMinutes);
  let seconds = Math.round((paceMinutes - minutes) * 60);
  // Guard against 3:60 style bug by rolling over to next minute
  if (seconds === 60) {
    return `${(minutes + 1).toString().padStart(2, '0')}:00`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

