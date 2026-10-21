/**
 * Browser crash handling (pure helpers). A long sweep on a video-heavy page can take the
 * browser's renderer down ("page.evaluate: Target crashed" — run 39550288326, D01 on iphone-13,
 * 21.10.2026), which used to kill the WHOLE run. Now a crash ends only the session's current
 * browser; ./mission-runner.ts opens a fresh one and resumes the sweep from the first screen
 * that was not scored yet (missions are resumable via `MISSION@checkpoint`).
 */
import { freemem, totalmem } from 'node:os';
import { checkpointsFrom, type Checkpoint } from './design/checkpoints';

/** Fresh browsers per session after a crash (each needs a new mint — keep it small). */
export const MAX_CRASH_RESTARTS = 2;

/** Playwright's messages when the page / browser process died under us. */
const CRASH_RE = /target crashed|page crashed|target (page, context or browser )?(has been )?closed|browser has been closed|browser has disconnected|connection closed|websocket.*closed/i;

export function isBrowserCrash(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return CRASH_RE.test(msg);
}

/** Launch arguments per engine. Chromium on a CI runner: no /dev/shm, no GPU. WebKit takes none. */
export function launchArgs(engine: 'webkit' | 'chromium'): string[] {
  if (engine !== 'chromium') return [];
  return ['--disable-dev-shm-usage', '--disable-gpu', '--disable-software-rasterizer', '--disable-extensions', '--mute-audio'];
}

const mb = (n: number) => Math.round(n / 1024 / 1024);

/** One log line: this process's memory + the machine's free memory. */
export function memoryLine(proc: NodeJS.MemoryUsage = process.memoryUsage(), free = freemem(), total = totalmem()): string {
  return `mem rss ${mb(proc.rss)}MB heap ${mb(proc.heapUsed)}/${mb(proc.heapTotal)}MB · machine free ${(free / 1024 ** 3).toFixed(1)}/${(total / 1024 ** 3).toFixed(1)}GB`;
}

/**
 * Where a crashed sweep picks up: the first checkpoint (from the current resume point on) that
 * has not been scored in this session. null = nothing left to cover (or not a sweep).
 */
export function nextResumePoint(checkpoints: readonly Checkpoint[] | undefined, from: string | null, scored: ReadonlySet<string>): string | null {
  if (!checkpoints?.length) return null;
  const rest = checkpointsFrom(checkpoints, from) ?? [...checkpoints];
  return rest.find((c) => !scored.has(c.id))?.id ?? null;
}
