/**
 * Screens in order, for the owner's canvas. Every screen the tester saw is written into the
 * run's artifact folder (uploaded by .github/workflows/qa-testers.yml, `gh run download`):
 *
 *   qa-out/<runId>/shots/<mission>/<NN>-<screenId>-<device>.jpg
 *   qa-out/<runId>/shots/manifest.json   { runId, shots: [{ order, mission, screenId, title, … }] }
 *
 * A view is held until the next one replaces it, so a score_screen / report_finding made on it
 * lands in its file name and manifest row. The manifest is rewritten after every file, so a run
 * that dies midway still leaves a valid one. Firebase Storage keeps getting the finding shots.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Mission } from './missions';
import type { Scores } from './design/dimensions';
import { overallScore } from './design/dimensions';

export interface ShotEntry {
  /** 1-based, across the whole run (sessions run one after another). */
  order: number;
  mission: string;
  device: string;
  /** The checkpoint / screen id the tester scored this view under, else null. */
  screenId: string | null;
  /** The checkpoint's Hebrew name (mission file), else null. */
  title: string | null;
  route: string;
  url: string;
  step: number;
  /** Path inside shots/ (mission/NN-screen-device.jpg). */
  file: string;
  bytes: number;
  scores: Scores | null;
  overall: number | null;
  /** The DESIGN-SCORE record of this view, when scored. */
  scoreId: string | null;
  /** Other findings (lint / model / runner) recorded on this view. */
  findingIds: string[];
  capturedAtMs: number;
}

export interface ShotFs {
  mkdir(dir: string): void;
  write(path: string, data: Buffer | string): void;
}

const nodeFs: ShotFs = {
  mkdir: (dir) => mkdirSync(dir, { recursive: true }),
  write: (path, data) => writeFileSync(path, data),
};

/** File-name safe: [A-Za-z0-9_-], max 48. */
export function slug(s: string): string {
  const out = s.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48);
  return out || 'root';
}

export function shotFileName(nn: number, screenId: string | null, route: string, device: string): string {
  return `${String(nn).padStart(2, '0')}-${screenId ? slug(screenId) : `x_${slug(route)}`}-${slug(device)}.jpg`;
}

interface Pending {
  entry: Omit<ShotEntry, 'order' | 'file' | 'bytes'>;
  img: Buffer;
  checkpoints: Mission['checkpoints'];
}

export class ShotLog {
  private readonly entries: ShotEntry[] = [];
  private readonly perSession = new Map<string, number>();
  private pending: Pending | null = null;

  constructor(
    private readonly runId: string,
    /** qa-out/<runId>/shots */
    private readonly dir: string,
    private readonly fs: ShotFs = nodeFs,
  ) {}

  get size(): number {
    return this.entries.length;
  }

  all(): readonly ShotEntry[] {
    return this.entries;
  }

  /** A new view on screen (the previous one is written out). img null = nothing to keep. */
  capture(mission: Pick<Mission, 'id' | 'checkpoints'>, device: string, step: number, url: string, route: string, img: Buffer | null, now = Date.now()): void {
    this.flush();
    if (!img) return;
    this.pending = {
      entry: { mission: mission.id, device, screenId: null, title: null, route, url, step, scores: null, overall: null, scoreId: null, findingIds: [], capturedAtMs: now },
      img,
      checkpoints: mission.checkpoints,
    };
  }

  /** The tester scored the view on screen. */
  score(screenId: string, scores: Scores, scoreId: string | null): void {
    const p = this.pending;
    if (!p) return;
    p.entry.screenId = screenId;
    p.entry.title = p.checkpoints?.find((c) => c.id === screenId)?.screen ?? null;
    p.entry.scores = { ...scores };
    p.entry.overall = Number(overallScore(scores).toFixed(2));
    p.entry.scoreId = scoreId;
  }

  /** A finding (new or a repeat) recorded on the view on screen. */
  finding(id: string): void {
    const p = this.pending;
    if (p && id && !p.entry.findingIds.includes(id)) p.entry.findingIds.push(id);
  }

  /** Writes the held view + the manifest. Never throws (the artifact is a convenience). */
  flush(): void {
    const p = this.pending;
    this.pending = null;
    if (!p) return;
    try {
      const key = `${p.entry.mission}|${p.entry.device}`;
      const nn = (this.perSession.get(key) ?? 0) + 1;
      this.perSession.set(key, nn);
      const name = shotFileName(nn, p.entry.screenId, p.entry.route, p.entry.device);
      const folder = slug(p.entry.mission);
      this.fs.mkdir(join(this.dir, folder));
      this.fs.write(join(this.dir, folder, name), p.img);
      this.entries.push({ ...p.entry, order: this.entries.length + 1, file: `${folder}/${name}`, bytes: p.img.length });
      this.writeManifest();
    } catch {
      /* the run goes on without this screenshot */
    }
  }

  manifest(): { runId: string; count: number; shots: ShotEntry[] } {
    return { runId: this.runId, count: this.entries.length, shots: [...this.entries] };
  }

  private writeManifest(): void {
    this.fs.mkdir(this.dir);
    this.fs.write(join(this.dir, 'manifest.json'), JSON.stringify(this.manifest(), null, 2));
  }
}
