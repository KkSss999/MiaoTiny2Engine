import { createLocalSave } from "../engine/save/index.ts";
import type { AudioPort } from "../engine/audio/index.ts";

/**
 * 设置：存哪儿、默认值、改动后怎么落到音频端口。
 *
 * 走 SavePort（createLocalSave → localStorage），和存档同一套存取方式，
 * 以后换文件/云存档只换适配器。改动即写盘，并把音量重新应用给 AudioPort。
 */
export type Settings = {
  /** 0..1 的主音量 */
  masterVolume: number;
  muted: boolean;
};

export const DEFAULT_SETTINGS: Settings = { masterVolume: 0.7, muted: false };

/** localStorage 里这条的 key 后缀，最终是 "cbb:settings" */
export const SETTINGS_KEY = "settings";

const save = createLocalSave();

let current: Settings = readSettings();
let audio: AudioPort | null = null;

/** 当前设置（只读快照；改动请走 setMasterVolume / toggleMute） */
export function getSettings(): Readonly<Settings> {
  return current;
}

/** 接上音频端口：之后的每次改动都实时应用到它 */
export function bindAudio(port: AudioPort | null): void {
  audio = port;
  applyVolume();
}

export function setMasterVolume(value: number): void {
  current = { ...current, masterVolume: clamp01(value) };
  commit();
}

/** 返回切换后的静音状态，方便 UI 立刻画对 */
export function toggleMute(): boolean {
  current = { ...current, muted: !current.muted };
  commit();
  return current.muted;
}

/** 静音时给 0，否则给主音量——AudioPort 只认一个数 */
export function effectiveVolume(settings: Readonly<Settings> = current): number {
  return settings.muted ? 0 : settings.masterVolume;
}

// ------------------------------------------------------------------- 内部

function commit(): void {
  save.write(SETTINGS_KEY, current);
  applyVolume();
}

function applyVolume(): void {
  audio?.setVolume(effectiveVolume());
}

function readSettings(): Settings {
  // 存档可能是旧版本 / 被手改过：逐字段校验，坏值退回默认
  const raw = save.read<Partial<Settings>>(SETTINGS_KEY);
  return {
    masterVolume:
      typeof raw?.masterVolume === "number" && Number.isFinite(raw.masterVolume)
        ? clamp01(raw.masterVolume)
        : DEFAULT_SETTINGS.masterVolume,
    muted: typeof raw?.muted === "boolean" ? raw.muted : DEFAULT_SETTINGS.muted,
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.masterVolume;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
