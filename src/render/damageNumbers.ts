import { Container, Text } from "pixi.js";

type Item = {
  text: Text;
  life: number;
  total: number;
  vx: number;
  vy: number;
  scaleFrom: number;
};

const POOL_MAX = 48;
const BASE_FONT = 20;

/**
 * 伤害飘字：对象池复用 Text。
 * 字号固定、用 scale 缩放——避免每次改 fontSize 触发纹理重绘。
 */
export class DamageNumbers {
  readonly root = new Container();
  private items: Item[] = [];

  constructor(parent: Container) {
    parent.addChild(this.root);
  }

  spawn(x: number, y: number, value: number, color: number, scale = 1): void {
    const item = this.take();
    item.text.text = String(Math.max(1, Math.round(value)));
    item.text.style.fill = color;
    item.text.position.set(x + (Math.random() - 0.5) * 16, y + (Math.random() - 0.5) * 6);
    item.text.alpha = 1;
    item.text.visible = true;
    item.text.scale.set(scale * 1.35);
    item.scaleFrom = scale;
    item.life = 0.75;
    item.total = 0.75;
    item.vx = (Math.random() - 0.5) * 46;
    item.vy = -78 - Math.random() * 34;
  }

  update(dt: number): void {
    for (const item of this.items) {
      if (item.life <= 0) continue;
      item.life -= dt;
      if (item.life <= 0) {
        item.text.visible = false;
        continue;
      }
      item.text.x += item.vx * dt;
      item.text.y += item.vy * dt;
      item.vy += 150 * dt;

      const t = 1 - item.life / item.total; // 0 → 1
      item.text.scale.set(item.scaleFrom * (1.35 - 0.35 * Math.min(1, t * 5)));
      item.text.alpha = item.life < 0.28 ? item.life / 0.28 : 1;
    }
  }

  clear(): void {
    for (const item of this.items) {
      item.life = 0;
      item.text.visible = false;
    }
  }

  private take(): Item {
    for (const item of this.items) {
      if (item.life <= 0) return item;
    }
    if (this.items.length >= POOL_MAX) return this.items[0];

    const text = new Text({
      text: "",
      style: {
        fontFamily: "ui-monospace, monospace",
        fontSize: BASE_FONT,
        fontWeight: "700",
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 4 },
      },
    });
    text.anchor.set(0.5);
    text.visible = false;
    this.root.addChild(text);

    const item: Item = { text, life: 0, total: 1, vx: 0, vy: 0, scaleFrom: 1 };
    this.items.push(item);
    return item;
  }
}
