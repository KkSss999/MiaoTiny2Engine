import type { Entity } from "@core/ecs/index.ts";

type Tween = { e: Entity; from: number; to: number; t: number; dur: number };

/** 极简缩放补间：出场弹一下、受击压一下。只作用于表现，不碰逻辑 */
export class Tweens {
  private list: Tween[] = [];
  private active = new Map<Entity, number>();

  add(e: Entity, from: number, to: number, dur: number): void {
    this.list = this.list.filter((t) => t.e !== e);
    this.list.push({ e, from, to, t: 0, dur });
  }

  update(dt: number): void {
    this.active.clear();
    if (this.list.length === 0) return;
    const next: Tween[] = [];
    for (const tw of this.list) {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      const eased = 1 - Math.pow(1 - k, 3);
      this.active.set(tw.e, tw.from + (tw.to - tw.from) * eased);
      if (k < 1) next.push(tw);
    }
    this.list = next;
  }

  get(e: Entity): number | undefined {
    return this.active.get(e);
  }

  clear(e: Entity): void {
    this.list = this.list.filter((t) => t.e !== e);
    this.active.delete(e);
  }
}
