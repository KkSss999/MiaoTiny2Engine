import { Container, Graphics, Sprite, Texture, type Renderer } from "pixi.js";
import { getManifest } from "../engine/assets/index.ts";
import { PLACEHOLDERS, drawMissingBox, type PlaceholderDraw } from "./placeholders.ts";

/** sprite id 由 `content/manifest.json` 决定，渲染层不再维护联合类型 */
export type SpriteId = string;

export type SpriteAsset = {
  key: SpriteId;
  /** manifest 里填的图片地址；为空说明还没有美术资源 */
  image?: string | null;
  /** 设计尺寸（像素）；渲染不依赖它，编辑器和缺图检查用 */
  size?: [number, number];
  /** 缺图时的程序化占位绘制（来自 placeholders.ts） */
  draw: PlaceholderDraw;
};

/**
 * 资源表：从内容清单派生。
 *
 * 之前这是一张手写的 SPRITES 表，id 和 draw 都写死在渲染层；
 * 现在"有哪些 sprite、图在哪、多大"来自 content/manifest.json，
 * 缺图时画什么来自 placeholders.ts。加一个 sprite 只改 manifest，
 * 实体、系统、同步代码一行都不用动。
 */
export const SPRITES: Record<string, SpriteAsset> = buildSpriteTable();

function buildSpriteTable(): Record<string, SpriteAsset> {
  const table: Record<string, SpriteAsset> = {};
  for (const entry of getManifest().sprites) {
    table[entry.id] = {
      key: entry.id,
      image: entry.image ?? null,
      size: entry.size,
      draw: PLACEHOLDERS[entry.id] ?? drawMissingBox,
    };
  }
  return table;
}

const textures = new Map<string, Texture>();
/** 图形是围绕自己的原点画的，烘成纹理后要把这个原点补回来 */
const anchors = new Map<string, { x: number; y: number }>();
let prepared = false;

/**
 * 图片地址 → 纹理。
 *
 * **空实现**：engine/assets 目前只提供清单（纯数据），真正的加载器
 * （Assets.load / 图集解析 / 缓存）还没写，所以恒返回 null。
 * 调用方拿到 null 就回落到程序化占位图——所以现在即使 manifest 里
 * 填了 image，画面上仍然是占位图。接加载器时只改这一个函数。
 */
export function loadImageTexture(_url: string): Texture | null {
  return null;
}

/**
 * 把资源烘成纹理（启动跑一次）。
 *
 * 顺序：manifest 的 image（真实图片）优先；没有图 / 图还没加载出来时，
 * 用 placeholders.ts 的程序化图形烘一张。
 *
 * 之前每个实体都是自己的 Graphics —— 每个都是独立 draw call，
 * 而且各自持有一份矢量几何。烘成纹理后同一资源的 Sprite 会被批处理，
 * 40 个敌人从 40 次 draw call 降到个位数。
 *
 * 像素风：纹理按 1:1 生成，采样用 nearest，缩放时不糊。
 */
export function prepareAssets(renderer: Renderer): void {
  if (prepared) return;
  prepared = true;

  for (const entry of getManifest().sprites) {
    if (textures.has(entry.id)) continue;

    // 1) 清单里填了 image：用真实图片（加载器还没实现，现在恒为 null）
    const image = entry.image ? loadImageTexture(entry.image) : null;
    if (image) {
      textures.set(entry.id, image);
      // 美术约定：图片自带留白，原点居中
      anchors.set(entry.id, { x: 0.5, y: 0.5 });
      continue;
    }

    // 2) 没图：回落到程序化占位
    const g = new Graphics();
    (PLACEHOLDERS[entry.id] ?? drawMissingBox)(g);

    const bounds = g.getLocalBounds();
    const texture = renderer.generateTexture({
      target: g,
      resolution: 1,
      antialias: false,
      textureSourceOptions: { scaleMode: "nearest", autoGenerateMipmaps: false },
    });
    g.destroy();

    // 纹理的左上角对应原 bounds.x/y，算出 0,0 在纹理里的相对位置当作 anchor
    anchors.set(entry.id, {
      x: bounds.width > 0 ? -bounds.x / bounds.width : 0.5,
      y: bounds.height > 0 ? -bounds.y / bounds.height : 0.5,
    });
    textures.set(entry.id, texture);
  }
}

export function getTexture(id: string): Texture | null {
  return textures.get(id) ?? null;
}

export function assetReady(): boolean {
  return prepared;
}

/**
 * 实体视图。烘焙过的资源返回 Sprite（可批处理）；
 * 还没烘焙（或清单里没有这个 id）时，直接退回 Graphics 把占位图画出来，
 * 保证视图永远存在、画出来的形状和烘焙版一致。
 */
export function createSpriteView(id: string): Container {
  const texture = textures.get(id);

  if (!texture) {
    const g = new Graphics();
    (PLACEHOLDERS[id] ?? drawMissingBox)(g);
    return g;
  }

  const sprite = new Sprite(texture);
  const anchor = anchors.get(id) ?? { x: 0.5, y: 0.5 };
  sprite.anchor.set(anchor.x, anchor.y);
  sprite.roundPixels = true;
  return sprite;
}

export function hasSprite(id: string): boolean {
  return id in SPRITES;
}
