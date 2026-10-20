import { Container, Graphics } from "pixi.js";

export type SpriteId =
  | "player.human"
  | "player.undead"
  | "enemy.melee"
  | "enemy.turret"
  | "enemy.sentry"
  | "enemy.charger"
  | "enemy.boss"
  | "prop.barrel"
  | "prop.crystal"
  | "bullet.friendly"
  | "bullet.hostile"
  | "weapon.gun"
  | "weapon.melee"
  | "weapon.spell"
  | "weapon.totem"
  | "pickup.weapon"
  | "fx.totem"
  | "debug.box";

export type SpriteAsset = {
  key: SpriteId;
  /** 有美术资源时填图集帧名；为空就走程序化占位 */
  frame?: string;
  draw?: (g: Graphics) => void;
};

/**
 * 资源表。现在全部是程序化占位（灰盒），接美术后在这里把 draw 换成 frame，
 * 其余代码（实体、系统、同步）一行都不用改。
 */
export const SPRITES: Record<SpriteId, SpriteAsset> = {
  "player.human": {
    key: "player.human",
    draw: (g) => {
      g.circle(0, 0, 16).fill(0xb4552d).stroke({ width: 3, color: 0xffd166 });
      g.circle(0, 0, 6).fill(0xffd166);
    },
  },
  "player.undead": {
    key: "player.undead",
    draw: (g) => {
      g.circle(0, 0, 16).fill(0xe8e2d0).stroke({ width: 3, color: 0x39e0c8 });
      g.circle(0, 0, 6).fill(0x39e0c8);
    },
  },
  "enemy.melee": {
    key: "enemy.melee",
    draw: (g) => {
      g.circle(0, 0, 16).fill(0x2a1c24).stroke({ width: 3, color: 0xd7263d });
    },
  },
  "enemy.turret": {
    key: "enemy.turret",
    draw: (g) => {
      g.circle(0, 0, 18).fill(0x24313f).stroke({ width: 3, color: 0xc9a227 });
    },
  },
  "enemy.sentry": {
    key: "enemy.sentry",
    draw: (g) => {
      g.poly([0, -16, 14, 10, -14, 10]).fill(0x1b2a33).stroke({ width: 2.5, color: 0x66ccff });
      g.circle(0, -2, 4).fill(0x66ccff);
    },
  },
  "enemy.charger": {
    key: "enemy.charger",
    draw: (g) => {
      g.poly([0, -20, 18, 0, 0, 20, -18, 0]).fill(0x3a2418).stroke({ width: 3, color: 0xffa000 });
      g.circle(0, 0, 6).fill(0xffa000);
    },
  },
  "enemy.boss": {
    key: "enemy.boss",
    draw: (g) => {
      g.circle(0, 0, 60).fill(0x3a2318).stroke({ width: 6, color: 0xb4552d });
      g.circle(0, 0, 26).fill(0xd7263d);
    },
  },
  "prop.barrel": {
    key: "prop.barrel",
    draw: (g) => {
      g.circle(0, 0, 22).fill(0x6b2f1c).stroke({ width: 3, color: 0xb4552d });
    },
  },
  "prop.crystal": {
    key: "prop.crystal",
    draw: (g) => {
      g.circle(0, 0, 22).fill(0x14453f).stroke({ width: 3, color: 0x39e0c8 });
    },
  },
  "bullet.friendly": {
    key: "bullet.friendly",
    draw: (g) => {
      g.rect(-4, -2, 8, 4).fill(0xffd166);
    },
  },
  "bullet.hostile": {
    key: "bullet.hostile",
    draw: (g) => {
      g.rect(-5, -2.5, 10, 5).fill(0xd7263d);
    },
  },
  "weapon.gun": {
    key: "weapon.gun",
    draw: (g) => {
      g.rect(0, -3.5, 24, 7).fill(0xffffff).stroke({ width: 1.5, color: 0x11161c });
      g.rect(22, -2, 6, 4).fill(0xffffff);
    },
  },
  "weapon.melee": {
    key: "weapon.melee",
    draw: (g) => {
      g.rect(0, -2.5, 14, 5).fill(0x8a7a5c);
      g.poly([10, 3, 40, -26, 52, -26, 16, 9]).fill(0xffffff).stroke({ width: 2, color: 0x11161c });
    },
  },
  "weapon.spell": {
    key: "weapon.spell",
    draw: (g) => {
      g.rect(0, -2, 26, 4).fill(0x8a7a5c);
      g.circle(30, 0, 7).fill(0xffffff).stroke({ width: 1.5, color: 0x11161c });
    },
  },
  "weapon.totem": {
    key: "weapon.totem",
    draw: (g) => {
      g.rect(0, -2, 16, 4).fill(0x8a7a5c);
      g.circle(22, 0, 8).fill(0xffffff).stroke({ width: 2, color: 0x11161c });
    },
  },
  "pickup.weapon": {
    key: "pickup.weapon",
    draw: (g) => {
      g.poly([0, -14, 12, 0, 0, 14, -12, 0]).fill(0xffffff).stroke({ width: 2, color: 0x0a0e14 });
    },
  },
  "fx.totem": {
    key: "fx.totem",
    draw: (g) => {
      g.circle(0, 0, 22).fill({ color: 0xffffff, alpha: 0.25 }).stroke({ width: 3, color: 0xffffff });
    },
  },
  "debug.box": {
    key: "debug.box",
    draw: (g) => {
      g.rect(-12, -12, 24, 24).fill(0xff00ff);
    },
  },
};

const cache = new Map<SpriteId, Graphics>();

/** 占位资源：每个 key 一个模板，实体拿到的是自己的 Graphics 实例 */
export function createSpriteView(id: string): Container {
  const asset = SPRITES[id as SpriteId];
  const g = new Graphics();
  if (!asset || !asset.draw) {
    g.rect(-12, -12, 24, 24).fill(0xff00ff);
    return g;
  }
  asset.draw(g);
  if (!cache.has(asset.key)) cache.set(asset.key, g);
  return g;
}

export function hasSprite(id: string): boolean {
  return id in SPRITES;
}