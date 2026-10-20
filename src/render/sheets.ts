import { Container, Graphics, Rectangle, RenderTexture, Texture, type Renderer } from "pixi.js";

/**
 * 网格图集（sprite sheet）。
 *
 * 开源项目通行做法：一张图按 rows × cols 均分，帧号 = row * cols + col。
 * 现在没有美术资源，用程序化 draw 逐帧画，烘成一张大图后再切出子纹理——
 * 换成真实 atlas 时只要填 image，draw 丢掉。
 */
export type SheetDef = {
  id: string;
  frameWidth: number;
  frameHeight: number;
  cols: number;
  rows: number;
  /** 有真实图集时填图片地址；填了就不再用 draw */
  image?: string;
  draw?: (g: Graphics, frame: number) => void;
};

/** 程序化占位图集：接美术前提供真实的帧数据 */
export const SHEETS: Record<string, SheetDef> = {
  // 近战怪的心跳脉冲：半径 14→18→20→18
  pulse: {
    id: "pulse",
    frameWidth: 48,
    frameHeight: 48,
    cols: 4,
    rows: 1,
    draw: (g, index) => {
      const r = [14, 17, 20, 17][index] ?? 14;
      const glow = [0x8a2530, 0xb52a38, 0xd7263d, 0xb52a38][index] ?? 0x8a2530;
      g.circle(0, 0, r).fill(0x2a1c24).stroke({ width: 3, color: glow });
    },
  },
};

type Sheet = { def: SheetDef; frames: Texture[] };
const sheets = new Map<string, Sheet>();
let prepared = false;

export function prepareSheets(renderer: Renderer): void {
  if (prepared) return;
  prepared = true;

  for (const def of Object.values(SHEETS)) {
    if (def.image) continue; // 真实图集走 Assets 加载，暂未实现

    const total = def.cols * def.rows;
    const stage = new Container();

    for (let i = 0; i < total; i++) {
      const col = i % def.cols;
      const row = Math.floor(i / def.cols);
      const cell = new Graphics();
      def.draw?.(cell, i);
      cell.position.set(col * def.frameWidth + def.frameWidth / 2, row * def.frameHeight + def.frameHeight / 2);
      stage.addChild(cell);
    }

    // 撑满整张画布的透明底，保证生成的纹理尺寸精确等于网格
    const bounds = new Graphics();
    bounds.rect(0, 0, def.cols * def.frameWidth, def.rows * def.frameHeight).fill({ color: 0x000000, alpha: 0 });
    stage.addChildAt(bounds, 0);

    const texture =
      renderer.generateTexture({
        target: stage,
        resolution: 1,
        antialias: false,
        textureSourceOptions: { scaleMode: "nearest", autoGenerateMipmaps: false },
      }) ?? RenderTexture.create({ width: def.cols * def.frameWidth, height: def.rows * def.frameHeight });

    const frames: Texture[] = [];
    for (let i = 0; i < total; i++) {
      const col = i % def.cols;
      const row = Math.floor(i / def.cols);
      frames.push(
        new Texture({
          source: texture.source,
          frame: new Rectangle(col * def.frameWidth, row * def.frameHeight, def.frameWidth, def.frameHeight),
        }),
      );
    }

    stage.destroy({ children: true });
    sheets.set(def.id, { def, frames });
  }
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