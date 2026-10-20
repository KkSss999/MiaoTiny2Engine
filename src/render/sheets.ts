import { Container, Graphics, Rectangle, RenderTexture, Texture, type Renderer } from "pixi.js";
import { getManifest, type SheetEntry } from "../engine/assets/index.ts";
import { loadImageTexture } from "./assets.ts";
import { SHEET_PLACEHOLDERS, drawMissingBox } from "./placeholders.ts";

/**
 * 网格图集（sprite sheet）。
 *
 * 开源项目通行做法：一张图按 rows × cols 均分，帧号 = row * cols + col。
 * 帧数与网格来自 content/manifest.json；现在没有美术资源，用
 * SHEET_PLACEHOLDERS 逐帧画，烘成一张大图后再切出子纹理——
 * 换成真实 atlas 时只要 manifest 里填 image，占位绘制自然不再用到。
 */
export type SheetDef = {
  id: string;
  frameWidth: number;
  frameHeight: number;
  cols: number;
  rows: number;
  /** 有真实图集时填图片地址；填了就不再用占位绘制 */
  image?: string | null;
  draw?: (g: Graphics, frame: number) => void;
};

/** 图集定义由清单派生（帧数 = cols × rows），逐帧画什么来自 placeholders.ts */
export const SHEETS: Record<string, SheetDef> = buildSheetTable();

function buildSheetTable(): Record<string, SheetDef> {
  const table: Record<string, SheetDef> = {};
  for (const entry of getManifest().sheets) {
    table[entry.id] = {
      id: entry.id,
      frameWidth: entry.frameWidth,
      frameHeight: entry.frameHeight,
      cols: entry.cols,
      rows: entry.rows,
      image: entry.image ?? null,
      draw: SHEET_PLACEHOLDERS[entry.id],
    };
  }
  return table;
}

type Sheet = { def: SheetDef; frames: Texture[] };
const sheets = new Map<string, Sheet>();
let prepared = false;

export function prepareSheets(renderer: Renderer): void {
  if (prepared) return;
  prepared = true;

  for (const entry of getManifest().sheets) {
    if (sheets.has(entry.id)) continue;

    const total = entry.cols * entry.rows;
    const image = entry.image ? loadImageTexture(entry.image) : null;
    const frames = image ? sliceAtlas(image, entry, total) : bakePlaceholders(renderer, entry, total);

    sheets.set(entry.id, { def: SHEETS[entry.id], frames });
  }
}

/** 真实图集：一张图按网格切成 total 帧 */
function sliceAtlas(atlas: Texture, entry: SheetEntry, total: number): Texture[] {
  const frames: Texture[] = [];
  for (let i = 0; i < total; i++) {
    const col = i % entry.cols;
    const row = Math.floor(i / entry.cols);
    frames.push(
      new Texture({
        source: atlas.source,
        frame: new Rectangle(col * entry.frameWidth, row * entry.frameHeight, entry.frameWidth, entry.frameHeight),
      }),
    );
  }
  return frames;
}

/** 没图：逐帧画占位图，烘成整张网格图再切帧 */
function bakePlaceholders(renderer: Renderer, entry: SheetEntry, total: number): Texture[] {
  const draw = SHEET_PLACEHOLDERS[entry.id] ?? drawMissingBox;
  const stage = new Container();

  for (let i = 0; i < total; i++) {
    const col = i % entry.cols;
    const row = Math.floor(i / entry.cols);
    const cell = new Graphics();
    draw(cell, i);
    cell.position.set(col * entry.frameWidth + entry.frameWidth / 2, row * entry.frameHeight + entry.frameHeight / 2);
    stage.addChild(cell);
  }

  // 撑满整张画布的透明底，保证生成的纹理尺寸精确等于网格
  const bounds = new Graphics();
  bounds.rect(0, 0, entry.cols * entry.frameWidth, entry.rows * entry.frameHeight).fill({ color: 0x000000, alpha: 0 });
  stage.addChildAt(bounds, 0);

  const texture =
    renderer.generateTexture({
      target: stage,
      resolution: 1,
      antialias: false,
      textureSourceOptions: { scaleMode: "nearest", autoGenerateMipmaps: false },
    }) ?? RenderTexture.create({ width: entry.cols * entry.frameWidth, height: entry.rows * entry.frameHeight });

  stage.destroy({ children: true });

  return sliceAtlas(texture, entry, total);
}

export function getSheetFrame(sheetId: string, index: number): Texture | null {
  const sheet = sheets.get(sheetId);
  if (!sheet) return null;
  return sheet.frames[index] ?? sheet.frames[0] ?? null;
}

export function getSheet(sheetId: string): Sheet | undefined {
  return sheets.get(sheetId);
}

export function allSheets(): { def: SheetDef; frames: Texture[] }[] {
  return [...sheets.values()];
}
