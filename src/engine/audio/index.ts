import type { AssetCatalog } from "../assets/manifest.ts";
import { WebAudioPlayer } from "./webAudio.ts";

/**
 * Audio port: the game requests sounds through events; this layer handles playback.
 *
 * Implementation: webAudio.ts maps manifest audio entries to WebAudio.
 * A silent fallback handles unsupported browsers or AudioContext creation failure.
 */
export type SfxId = string;

export type PlayOptions = { volume?: number; rate?: number };

export interface AudioPort {
  play(id: SfxId, options?: PlayOptions): void;
  setVolume(master: number): void;
  /** Report whether audio is unlocked after the required user interaction. */
  readonly unlocked: boolean;
  /**
   * Call during the first pointerdown/keydown gesture; WebAudio AudioContext
   * resume requires a gesture. Optional for silent implementations; use audio.unlock?.().
   */
  unlock?(): void;
  dispose(): void;
}

/** Silent implementation for absent assets/interaction, avoiding null checks in callers. */
export const silentAudio: AudioPort = {
  play: () => {},
  setVolume: () => {},
  unlocked: false,
  unlock: () => {},
  dispose: () => {},
};

/** Prefer WebAudio; fall back to silence if AudioContext cannot be created (unsupported/headless). */
export function createAudio(assets?: AssetCatalog): AudioPort {
  try {
    return new WebAudioPlayer(assets);
  } catch (err) {
    console.warn("[audio] WebAudio unavailable; falling back to silence", err);
    return silentAudio;
  }
}

export { WebAudioPlayer } from "./webAudio.ts";
