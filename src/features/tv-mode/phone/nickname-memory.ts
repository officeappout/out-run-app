/** The last nickname a guest used, so a second room does not ask again. Convenience only. */
const KEY = 'tv:nick';

export function readNickname(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveNickname(nick: string): void {
  try {
    localStorage.setItem(KEY, nick);
  } catch {
    /* storage unavailable: asked again next time */
  }
}
