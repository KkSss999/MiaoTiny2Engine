import { Graphics } from "pixi.js";
import { makeRng } from "#core/rng/index.ts";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
};

const MAX = 400;

/** 纯表现：粒子不进 ECS，单独对象池，自己一条随机流 */
export class Particles {
  readonly view = new Graphics();
  private list: Particle[] = [];
  private rng = makeRng(0x9e3779b9);

  get count(): number {
    return this.list.length;
  }

  emit(x: number, y: number, count: number, options: { color: number; speed?: number; size?: number; life?: number }): void {
    const speed = options.speed ?? 160;
    const size = options.size ?? 4;
    const life = options.life ?? 0.45;
    for (let i = 0; i < count; i++) {
      if (this.list.length >= MAX) this.list.shift();
      const angle = this.rng.next() * Math.PI * 2;
      const v = speed * (0.4 + this.rng.next());
      this.list.push({
        x,
        y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life: life * (0.6 + this.rng.next() * 0.8),
        maxLife: life,
        size: size * (0.6 + this.rng.next() * 0.8),
        color: options.color,
      });
    }
  }

  update(dt: number): void {
    if (this.list.length === 0) return;
    const next: Particle[] = [];
    for (const p of this.list) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 3;
      p.vy *= 1 - dt * 3;
      next.push(p);
    }
    this.list = next;
  }

  draw(): void {
    this.view.clear();
    for (const p of this.list) {
      const t = Math.max(0, p.life / p.maxLife);
      this.view.alpha = 1;
      this.view.rect(p.x - p.size / 2, p.y - p.size / 2, p.size * t, p.size * t).fill({ color: p.color, alpha: 0.4 + t * 0.6 });
    }
  }

  clear(): void {
    this.list = [];
    this.view.clear();
  }
}
