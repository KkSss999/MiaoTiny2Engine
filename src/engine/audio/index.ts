/**
 * 音频端口：游戏只发事件、说"要什么声音"，这一层决定"怎么响"。
 *
 * 先给出接口 + 静音实现，接音频文件时替换实现即可，玩法代码不动。
 */
export type SfxId = string;

export type PlayOptions = { volume?: number; rate?: number };

export interface AudioPort {
  play(id: SfxId, options?: PlayOptions): void;
  setVolume(master: number): void;
  /** 浏览器要求用户交互后才能出声，这里如实告知 */
  readonly unlocked: boolean;
  dispose(): void;
}

/** 静音实现：没有资源、没有用户交互时用它，保证调用方永远不用判空 */
export const silentAudio: AudioPort = {
  play: () => {},
  setVolume: () => {},
  unlocked: false,
  dispose: () => {},
};

export function createAudio(): AudioPort {
  // TODO(P2): 按 manifest 的 audio 条目建 WebAudio 播放器
  return silentAudio;
}
