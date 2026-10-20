import type { Graphics } from "pixi.js";

/**
 * 程序化占位图。
 *
 * 占位是开发兜底，不是数据：`content/manifest.json` 只说"有哪些资源、图在哪"，
 * 缺图时画什么完全由表现层决定。接美术后删掉对应条目即可，
 * 实体、系统、同步一行都不用改。
 */
export type PlaceholderDraw = (g: Graphics) => void;
export type FramePlaceholderDraw = (g: Graphics, frame: number) => void;

/** sprite id → 占位绘制（围绕 (0,0) 画，原点即锚点） */
export const PLACEHOLDERS: Record<string, PlaceholderDraw> = {
  "player.human": (g) => {
    g.circle(0, 0, 16).fill(0xb4552d).stroke({ width: 3, color: 0xffd166 });
    g.circle(0, 0, 6).fill(0xffd166);
  },
  "player.undead": (g) => {
    g.circle(0, 0, 16).fill(0xe8e2d0).stroke({ width: 3, color: 0x39e0c8 });
    g.circle(0, 0, 6).fill(0x39e0c8);
  },
  "enemy.melee": (g) => {
    g.circle(0, 0, 16).fill(0x2a1c24).stroke({ width: 3, color: 0xd7263d });
  },
  "enemy.turret": (g) => {
    g.circle(0, 0, 18).fill(0x24313f).stroke({ width: 3, color: 0xc9a227 });
  },
  "enemy.sentry": (g) => {
    g.poly([0, -16, 14, 10, -14, 10]).fill(0x1b2a33).stroke({ width: 2.5, color: 0x66ccff });
    g.circle(0, -2, 4).fill(0x66ccff);
  },
  "enemy.charger": (g) => {
    g.poly([0, -20, 18, 0, 0, 20, -18, 0]).fill(0x3a2418).stroke({ width: 3, color: 0xffa000 });
    g.circle(0, 0, 6).fill(0xffa000);
  },
  "enemy.boss": (g) => {
    g.circle(0, 0, 60).fill(0x3a2318).stroke({ width: 6, color: 0xb4552d });
    g.circle(0, 0, 26).fill(0xd7263d);
  },
  "prop.barrel": (g) => {
    g.circle(0, 0, 22).fill(0x6b2f1c).stroke({ width: 3, color: 0xb4552d });
  },
  "prop.crystal": (g) => {
    g.circle(0, 0, 22).fill(0x14453f).stroke({ width: 3, color: 0x39e0c8 });
  },
  "bullet.friendly": (g) => {
    g.rect(-4, -2, 8, 4).fill(0xffd166);
  },
  "bullet.hostile": (g) => {
    g.rect(-5, -2.5, 10, 5).fill(0xd7263d);
  },
  "weapon.gun": (g) => {
    g.rect(0, -3.5, 24, 7).fill(0xffffff).stroke({ width: 1.5, color: 0x11161c });
    g.rect(22, -2, 6, 4).fill(0xffffff);
  },
  "weapon.melee": (g) => {
    g.rect(0, -2.5, 14, 5).fill(0x8a7a5c);
    g.poly([10, 3, 40, -26, 52, -26, 16, 9]).fill(0xffffff).stroke({ width: 2, color: 0x11161c });
  },
  "weapon.spell": (g) => {
    g.rect(0, -2, 26, 4).fill(0x8a7a5c);
    g.circle(30, 0, 7).fill(0xffffff).stroke({ width: 1.5, color: 0x11161c });
  },
  "weapon.totem": (g) => {
    g.rect(0, -2, 16, 4).fill(0x8a7a5c);
    g.circle(22, 0, 8).fill(0xffffff).stroke({ width: 2, color: 0x11161c });
  },
  "pickup.weapon": (g) => {
    g.poly([0, -14, 12, 0, 0, 14, -12, 0]).fill(0xffffff).stroke({ width: 2, color: 0x0a0e14 });
  },
  "fx.spark": (g) => {
    g.circle(0, 0, 4).fill(0xffffff);
  },
  "fx.totem": (g) => {
    g.circle(0, 0, 22).fill({ color: 0xffffff, alpha: 0.25 }).stroke({ width: 3, color: 0xffffff });
  },
  "debug.box": (g) => {
    g.rect(-12, -12, 24, 24).fill(0xff00ff);
  },
};

/** sheet id → 逐帧占位绘制；帧号 = row * cols + col */
export const SHEET_PLACEHOLDERS: Record<string, FramePlaceholderDraw> = {
  // 近战怪的心跳脉冲：半径 14→18→20→18
  pulse: (g, index) => {
    const r = [14, 17, 20, 17][index] ?? 14;
    const glow = [0x8a2530, 0xb52a38, 0xd7263d, 0xb52a38][index] ?? 0x8a2530;
    g.circle(0, 0, r).fill(0x2a1c24).stroke({ width: 3, color: glow });
  },
};

/** 清单里有、占位图没有：画个洋红方块，一眼看出漏了 */
export function drawMissingBox(g: Graphics): void {
  g.rect(-12, -12, 24, 24).fill(0xff00ff);
}

/** 按 id 取占位绘制，缺条目时退回洋红方块 */
export function placeholderFor(id: string): PlaceholderDraw {
  return PLACEHOLDERS[id] ?? drawMissingBox;
}

/** 按 id 取图集占位绘制，缺条目时退回洋红方块 */
export function sheetPlaceholderFor(id: string): FramePlaceholderDraw {
  return SHEET_PLACEHOLDERS[id] ?? drawMissingBox;
}
