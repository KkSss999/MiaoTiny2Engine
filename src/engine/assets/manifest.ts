import raw from "../../../content/manifest.json" with { type: "json" };

/**
 * 资源清单：**纯数据**，不含任何渲染代码。
 *
 * 目的：让"有哪些资源、缺不缺图"能脱离 pixi 被检查（编辑器、CI、工具）。
 * 占位图不在这里——那是表现层的开发兜底（render/placeholders.ts）。
 */
export type SpriteEntry = {
  id: string;
  /** 有美术资源时填路径；为空则用表现层占位图 */
  image?: string | null;
  /** 设计尺寸（像素），用于编辑器预览与缺图检查 */
  size?: [number, number];
};

export type SheetEntry = {
  id: string;
  image?: string | null;
  frameWidth: number;
  frameHeight: number;
  cols: number;
  rows: number;
};

export type AudioEntry = {
  id: string;
  src: string;
  volume?: number;
};

export type Manifest = {
  sprites: SpriteEntry[];
  sheets: SheetEntry[];
  audio: AudioEntry[];
};

// JSON 的数组字面量推不出元组，这里按契约断言（结构由 manifest.json 保证）
const manifest = raw as unknown as Manifest;

export function getManifest(): Manifest {
  return manifest;
}

export function getSpriteEntry(id: string): SpriteEntry | undefined {
  return manifest.sprites.find((s) => s.id === id);
}

export function getSheetEntry(id: string): SheetEntry | undefined {
  return manifest.sheets.find((s) => s.id === id);
}

export function getAudioEntry(id: string): AudioEntry | undefined {
  return manifest.audio.find((a) => a.id === id);
}

/** 还没接美术的资源：编辑器里标出来，一屏看清欠账 */
export function missingImages(): { sprites: string[]; sheets: string[] } {
  return {
    sprites: manifest.sprites.filter((s) => !s.image).map((s) => s.id),
    sheets: manifest.sheets.filter((s) => !s.image).map((s) => s.id),
  };
}