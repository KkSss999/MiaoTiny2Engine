import type { AssetCatalog } from "../assets/manifest.ts";
import { WebAudioPlayer } from "./webAudio.ts";

/**
 * 音频端口：游戏只发事件、说"要什么声音"，这一层决定"怎么响"。
 *
 * 实现：webAudio.ts（manifest 的 audio 条目 → WebAudio）；
 * 静音实现是降级路径——浏览器不支持、或 AudioContext 建不起来时用它。
 */
export type SfxId = string;

export type PlayOptions = { volume?: number; rate?: number };

export interface AudioPort {
  play(id: SfxId, options?: PlayOptions): void;
  setVolume(master: number): void;
  /** 浏览器要求用户交互后才能出声，这里如实告知 */
  readonly unlocked: boolean;
  /**
   * 在首次用户手势（pointerdown / keydown）里调用：WebAudio 的 AudioContext
   * 只能在手势中 resume。可选——静音实现不需要，调用方写 audio.unlock?.()。
   */
  unlock?(): void;
  dispose(): void;
}

/** 静音实现：没有资源、没有用户交互时用它，保证调用方永远不用判空 */
export const silentAudio: AudioPort = {
  play: () => {},
  setVolume: () => {},
  unlocked: false,
  unlock: () => {},
  dispose: () => {},
};

/** 优先真实现；AudioContext 建不起来（无 WebAudio / headless）就退回静音 */
export function createAudio(assets?: AssetCatalog): AudioPort {
  try {
    return new WebAudioPlayer(assets);
  } catch (err) {
    console.warn("[audio] WebAudio 不可用，退回静音实现", err);
    return silentAudio;
  }
}

export { WebAudioPlayer } from "./webAudio.ts";
