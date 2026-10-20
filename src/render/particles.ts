import { Container, Sprite, type Texture } from "pixi.js";
import { makeRng } from "#core/kernel/index.ts";
import { getTexture } from "./assets.ts";

export type EmitOptions = {
  color: number;
  /** 初速度（像素/秒） */
  speed?: number;
  size?: number;
  life?: number;
  /** 重力（像素/秒²），负数向上飘 */
  gravity?: number;
  /** 速度衰减系数，每秒 */
  drag?: number;
  /** 加法混合，适合火花/等离子 */
  additive?: boolean;
};

type Particle = {
  sprite: Sprite;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  gravity: number;
  drag: number;
  active: boolean;
};

const MAX = 512;
const SPARK = "fx.spark";

/**
 * 粒子：纹理 + 对象池的 Sprite。
 *
 * 之前是一个 Graphics 每帧重建所有矩形几何；现在复用同一张纹理的 Sprite，
 * 由批处理合并成极少几次 draw call，并且支持重力/阻力/加法混合。
 */
export class Particles {
  readonly view = new Container();
  private pool: Particle[] = [];
  private rng = makeRng(0x9e3779b9);
  private texture: Texture | null = null;

  get count(): number {
    let n = 0;
    for (const p of this.pool) if (p.active) n++;
    return n;
  }

  emit(x: number, y: number, count: number, options: EmitOptions): void {
    const speed = options.speed ?? 160;
    const size = options.size ?? 4;
    const life = options.life ?? 0.45;
    const gravity = options.gravity ?? 0;
    const drag = options.drag ?? 3;

    for (let i = 0; i < count; i++) {
      const p = this.take();
      if (!p) return;

      const angle = this.rng.next() * Math.PI * 2;
      const v = speed * (0.4 + this.rng.next());
      p.vx = Math.cos(angle) * v;
      p.vy = Math.sin(angle) * v;
      p.life = life * (0.6 + this.rng.next() * 0.8);
      p.maxLife = p.life;
      p.size = size * (0.6 + this.rng.next() * 0.8);
      p.gravity = gravity;
      p.drag = drag;
      p.active = true;

      p.sprite.visible = true;
      p.sprite.position.set(x, y);
      p.sprite.tint = options.color;
      p.sprite.alpha = 1;
      p.sprite.rotation = this.rng.next() * Math.PI * 2;
      p.sprite.scale.set(p.size / 8);
      p.sprite.blendMode = options.additive ? "add" : "normal";
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.sprite.visible = false;
        continue;
      }

      p.vy += p.gravity * dt;
      const damping = Math.max(0, 1 - p.drag * dt);
      p.vx *= damping;
      p.vy *= damping;

      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;

      const t = p.life / p.maxLife;
      p.sprite.alpha = t < 0.4 ? t / 0.4 : 1;
      p.sprite.scale.set((p.size / 8) * (0.4 + t * 0.6));
    }
  }

  clear(): void {
    for (const p of this.pool) {
      p.active = false;
      p.sprite.visible = false;
    }
  }

  private take(): Particle | null {
    for (const p of this.pool) if (!p.active) return p;
    if (this.pool.length >= MAX) return null;

    this.texture ??= getTexture(SPARK);
    if (!this.texture) return null;

    const sprite = new Sprite(this.texture);
    sprite.anchor.set(0.5);
    sprite.visible = false;
    this.view.addChild(sprite);

    const p: Particle = { sprite, vx: 0, vy: 0, life: 0, maxLife: 1, size: 4, gravity: 0, drag: 3, active: false };
    this.pool.push(p);
    return p;
  }
}
