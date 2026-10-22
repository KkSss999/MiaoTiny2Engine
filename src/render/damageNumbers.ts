import { BitmapText, Container } from "pixi.js";

type Item = {
  text: BitmapText;
  life: number;
  total: number;
  vx: number;
  vy: number;
  scaleFrom: number;
};

const POOL_MAX = 64;
const BASE_FONT = 15;

/**
 * 伤害飘字。
 *
 * 用 BitmapText 而不是 Text：飘字的内容每一下都在变，
 * Text 每次改字都要重画 canvas 并重新上传纹理，密集命中时会把
 * 主线程拖垮（这也是之前卡死的头号嫌疑）。BitmapText 改文字只
 * 重排四边形，颜色走实例 tint，不触发任何纹理重绘。
 */
export class DamageNumbers {
  readonly root = new Container();
  private items: Item[] = [];
  private random: () => number;
  private disposed = false;

  constructor(parent: Container, random: () => number = Math.random) {
    this.random = random;
    parent.addChild(this.root);
  }

  spawn(x: number, y: number, value: number, color: number, scale = 1): void {
    if (this.disposed) throw new Error("DamageNumbers are disposed");
    const item = this.take();
    item.text.text = String(Math.max(1, Math.round(value)));
    item.text.tint = color;
    item.text.position.set(x + (this.random() - 0.5) * 30, y + (this.random() - 0.5) * 10);
    item.text.alpha = 1;
    item.text.visible = true;
    item.text.scale.set(scale);
    item.scaleFrom = scale;
    item.life = 0.75;
    item.total = 0.75;
    item.vx = (this.random() - 0.5) * 80;
    item.vy = -78 - this.random() * 34;
  }

  update(dt: number): void {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError("Invalid text delta");
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

      const t = 1 - item.life / item.total;
      item.text.scale.set(item.scaleFrom * (1.3 - 0.3 * Math.min(1, t * 5)));
      item.text.alpha = item.life < 0.28 ? item.life / 0.28 : 1;
    }
  }

  clear(): void {
    for (const item of this.items) {
      item.life = 0;
      item.text.visible = false;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.items = [];
    this.root.destroy({ children: true });
  }

  private take(): Item {
    for (const item of this.items) {
      if (item.life <= 0) return item;
    }
    if (this.items.length >= POOL_MAX) return this.items[0];

    const text = new BitmapText({
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