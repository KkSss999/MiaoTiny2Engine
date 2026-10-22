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

/** Validate user-supplied data before any loader consumes it. IDs are unique per kind. */
export function parseManifest(raw: unknown): Manifest {
  if (!raw || typeof raw !== "object") throw new TypeError("Manifest must be an object");
  const value = raw as Record<string, unknown>;
  const positive = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n > 0;
  for (const kind of ["sprites", "sheets", "audio"] as const) {
    if (!Array.isArray(value[kind])) throw new TypeError(`Manifest.${kind} must be an array`);
    const ids = new Set<string>();
    for (const item of value[kind]) {
      if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id.trim() || ids.has(item.id)) throw new TypeError(`Invalid or duplicate ${kind} id`);
      ids.add(item.id);
      if (kind === "audio") {
        if (typeof item.src !== "string" || !item.src.trim()) throw new TypeError("Audio src is required");
        if (item.volume !== undefined && (typeof item.volume !== "number" || !Number.isFinite(item.volume) || item.volume < 0 || item.volume > 1)) throw new TypeError("Invalid audio volume");
      } else {
        if (item.image !== undefined && item.image !== null && (typeof item.image !== "string" || !item.image.trim())) throw new TypeError("Invalid image path");
        if (kind === "sprites" && item.size !== undefined && (!Array.isArray(item.size) || item.size.length !== 2 || !item.size.every(positive))) throw new TypeError("Invalid sprite size");
        if (kind === "sheets" && ![item.frameWidth, item.frameHeight, item.cols, item.rows].every((n) => positive(n) && Number.isInteger(n))) throw new TypeError("Invalid sheet dimensions");
      }
    }
  }
  return structuredClone(raw) as Manifest;
}

/** A manifest is injected by the application, never imported from game content. */
export function createAssetCatalog(raw: unknown) {
  const manifest = parseManifest(raw);
  return {
    getManifest: (): Manifest => structuredClone(manifest),
    getSpriteEntry: (id: string): SpriteEntry | undefined => structuredClone(manifest.sprites.find((s) => s.id === id)),
    getSheetEntry: (id: string): SheetEntry | undefined => structuredClone(manifest.sheets.find((s) => s.id === id)),
    getAudioEntry: (id: string): AudioEntry | undefined => structuredClone(manifest.audio.find((s) => s.id === id)),
    missingImages: () => ({ sprites: manifest.sprites.filter((s) => !s.image).map((s) => s.id), sheets: manifest.sheets.filter((s) => !s.image).map((s) => s.id) }),
  };
}
export type AssetCatalog = ReturnType<typeof createAssetCatalog>;
