/**
 * Which layout the strength player uses (enable_wide_player_v1). Pure.
 *   immersive — a landscape-filmed video (recovery sessions) while the phone is
 *               landscape, or the user chose it: drawer / header disappear and the
 *               video fills the screen.
 *   split     — a wide container: video + side panel.
 *   default   — today's portrait player.
 */

export type VideoAspect = 'landscape' | 'portrait' | null;
export type PlayerMode = 'default' | 'split' | 'immersive';

/** null until the clip's size is known. Near-square counts as portrait (the app's clips are 9:16 or 16:9). */
export function videoAspect(width: number, height: number): VideoAspect {
  if (!(width > 0) || !(height > 0)) return null;
  return width > height * 1.1 ? 'landscape' : 'portrait';
}

export interface PlayerModeInput {
  enabled: boolean;
  wide: boolean;
  landscape: boolean;
  aspect: VideoAspect;
  /** The user tapped the full-screen toggle. */
  userImmersive: boolean;
}

export function decidePlayerMode(i: PlayerModeInput): PlayerMode {
  if (!i.enabled) return 'default';
  if (i.aspect === 'landscape' && (i.landscape || i.userImmersive)) return 'immersive';
  return i.wide ? 'split' : 'default';
}

/** Portrait clip in the wide media pane → a narrow column over an ambient fill. Unknown stays full-pane. */
export function isAmbientColumn(aspect: VideoAspect): boolean {
  return aspect === 'portrait';
}
